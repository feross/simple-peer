module.exports = Peer

var debug = require('debug')('simple-peer')
var getBrowserRTC = require('get-browser-rtc')
var hat = require('hat')
var inherits = require('inherits')
var once = require('once')
var stream = require('readable-stream')

inherits(Peer, stream.Duplex)

/**
 * WebRTC peer connection. Same API as node core `net.Socket`, plus a few extra methods.
 * Duplex stream.
 * @param {Object} opts
 */
function Peer (opts) {
  var self = this
  if (!(self instanceof Peer)) return new Peer(opts)
  self._debug('new peer %o', opts)

  if (!opts) opts = {}
  opts.allowHalfOpen = false
  if (opts.highWaterMark == null) opts.highWaterMark = 1024 * 1024

  stream.Duplex.call(self, opts)

  self.initiator = opts.initiator || false
  self.channelConfig = opts.channelConfig || Peer.channelConfig
  self.channelName = opts.initiator ? (opts.channelName || hat(160)) : null
  self.config = opts.config || Peer.config
  self.constraints = opts.constraints || Peer.constraints
  self.offerConstraints = opts.offerConstraints
  self.answerConstraints = opts.answerConstraints
  self.reconnectTimer = opts.reconnectTimer || false
  self.sdpTransform = opts.sdpTransform || function (sdp) { return sdp }
  self.stream = opts.stream || false
  self.trickle = opts.trickle !== undefined ? opts.trickle : true

  self.destroyed = false
  self.connected = false

  // so Peer object always has same shape (V8 optimization)
  self.remoteAddress = undefined
  self.remoteFamily = undefined
  self.remotePort = undefined
  self.localAddress = undefined
  self.localPort = undefined

  self._isWrtc = !!opts.wrtc // HACK: to fix `wrtc` bug. See issue: #60
  self._wrtc = (opts.wrtc && typeof opts.wrtc === 'object')
    ? opts.wrtc
    : getBrowserRTC()
  if (!self._wrtc) {
    if (typeof window === 'undefined') {
      throw new Error('No WebRTC support: Specify `opts.wrtc` option in this environment')
    } else {
      throw new Error('No WebRTC support: Not a supported browser')
    }
  }

  self._maxBufferedAmount = opts.highWaterMark
  self._pcReady = false
  self._channelReady = false
  self._iceComplete = false // ice candidate trickle done (got null candidate)
  self._channel = null
  self._pendingCandidates = []

  self._chunk = null
  self._cb = null
  self._interval = null
  self._reconnectTimeout = null

  self._pc = new (self._wrtc.RTCPeerConnection)(self.config, self.constraints)
  self._pc.oniceconnectionstatechange = function () {
    self._onIceConnectionStateChange()
  }
  self._pc.onsignalingstatechange = function () {
    self._onSignalingStateChange()
  }
  self._pc.onicecandidate = function (event) {
    self._onIceCandidate(event)
  }

  if (self.stream) self._pc.addStream(self.stream)
  self._pc.onaddstream = function (event) {
    self._onAddStream(event)
  }

  if (self.initiator) {
    self._setupData({
      channel: self._pc.createDataChannel(self.channelName, self.channelConfig)
    })
    self._pc.onnegotiationneeded = once(function () {
      self._createOffer()
    })
    // Only Chrome triggers "negotiationneeded"; this is a workaround for other
    // implementations
    if (typeof window === 'undefined' || !window.webkitRTCPeerConnection) {
      self._pc.onnegotiationneeded()
    }
  } else {
    self._pc.ondatachannel = function (event) {
      self._setupData(event)
    }
  }

  self.on('finish', function () {
    if (self.connected) {
      // When local peer is finished writing, close connection to remote peer.
      // Half open connections are currently not supported.
      // Wait a bit before destroying so the datachannel flushes.
      // TODO: is there a more reliable way to accomplish this?
      setTimeout(function () {
        self._destroy()
      }, 100)
    } else {
      // If data channel is not connected when local peer is finished writing, wait until
      // data is flushed to network at "connect" event.
      // TODO: is there a more reliable way to accomplish this?
      self.once('connect', function () {
        setTimeout(function () {
          self._destroy()
        }, 100)
      })
    }
  })
}

Peer.WEBRTC_SUPPORT = !!getBrowserRTC()

/**
 * Expose config, constraints, and data channel config for overriding all Peer
 * instances. Otherwise, just set opts.config, opts.constraints, or opts.channelConfig
 * when constructing a Peer.
 */
Peer.config = {
  iceServers: [
    {
      url: 'stun:23.21.150.121', // deprecated, replaced by `urls`
      urls: 'stun:23.21.150.121'
    }
  ]
}
Peer.constraints = {}
Peer.channelConfig = {}

Object.defineProperty(Peer.prototype, 'bufferSize', {
  get: function () {
    var self = this
    return (self._channel && self._channel.bufferedAmount) || 0
  }
})

Peer.prototype.address = function () {
  var self = this
  return { port: self.localPort, family: 'IPv4', address: self.localAddress }
}

Peer.prototype.signal = function (data) {
  var self = this
  if (self.destroyed) throw new Error('cannot signal after peer is destroyed')
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (err) {
      data = {}
    }
  }
  self._debug('signal()')

  function addIceCandidate (candidate) {
    try {
      self._pc.addIceCandidate(
        new self._wrtc.RTCIceCandidate(candidate),
        noop,
        function (err) { self._onError(err) }
      )
    } catch (err) {
      self._destroy(new Error('error adding candidate: ' + err.message))
    }
  }

  if (data.sdp) {
    self._pc.setRemoteDescription(new (self._wrtc.RTCSessionDescription)(data), function () {
      if (self.destroyed) return
      if (self._pc.remoteDescription.type === 'offer') self._createAnswer()

      self._pendingCandidates.forEach(addIceCandidate)
      self._pendingCandidates = []
    }, function (err) { self._onError(err) })
  }
  if (data.candidate) {
    if (self._pc.remoteDescription) addIceCandidate(data.candidate)
    else self._pendingCandidates.push(data.candidate)
  }
  if (!data.sdp && !data.candidate) {
    self._destroy(new Error('signal() called with invalid signal data'))
  }
}

/**
 * Send text/binary data to the remote peer.
 * @param {TypedArrayView|ArrayBuffer|Buffer|string|Blob|Object} chunk
 */
Peer.prototype.send = function (chunk) {
  var self = this

  // HACK: `wrtc` module doesn't accept node.js buffer. See issue: #60
  if (Buffer.isBuffer(chunk) && self._isWrtc) {
    chunk = new Uint8Array(chunk)
  }

  var len = chunk.length || chunk.byteLength || chunk.size
  self._channel.send(chunk)
  self._debug('write: %d bytes', len)
}

Peer.prototype.destroy = function (onclose) {
  var self = this
  self._destroy(null, onclose)
}

Peer.prototype._destroy = function (err, onclose) {
  var self = this
  if (self.destroyed) return
  if (onclose) self.once('close', onclose)

  self._debug('destroy (error: %s)', err && err.message)

  self.readable = self.writable = false

  if (!self._readableState.ended) self.push(null)
  if (!self._writableState.finished) self.end()

  self.destroyed = true
  self.connected = false
  self._pcReady = false
  self._channelReady = false

  self._chunk = null
  self._cb = null
  clearInterval(self._interval)
  clearTimeout(self._reconnectTimeout)

  if (self._pc) {
    try {
      self._pc.close()
    } catch (err) {}

    self._pc.oniceconnectionstatechange = null
    self._pc.onsignalingstatechange = null
    self._pc.onicecandidate = null
    self._pc.onaddstream = null
    self._pc.onnegotiationneeded = null
    self._pc.ondatachannel = null
  }

  if (self._channel) {
    try {
      self._channel.close()
    } catch (err) {}

    self._channel.onmessage = null
    self._channel.onopen = null
    self._channel.onclose = null
  }
  self._pc = null
  self._channel = null

  if (err) self.emit('error', err)
  self.emit('close')
}

Peer.prototype._setupData = function (event) {
  var self = this
  self._channel = event.channel
  self.channelName = self._channel.label

  self._channel.binaryType = 'arraybuffer'
  self._channel.onmessage = function (event) {
    self._onChannelMessage(event)
  }
  self._channel.onopen = function () {
    self._onChannelOpen()
  }
  self._channel.onclose = function () {
    self._onChannelClose()
  }
}

Peer.prototype._read = function () {}

Peer.prototype._write = function (chunk, encoding, cb) {
  var self = this
  if (self.destroyed) return cb(new Error('cannot write after peer is destroyed'))

  if (self.connected) {
    try {
      self.send(chunk)
    } catch (err) {
      return self._onError(err)
    }
    if (self._channel.bufferedAmount > self._maxBufferedAmount) {
      self._debug('start backpressure: bufferedAmount %d', self._channel.bufferedAmount)
      self._cb = cb
    } else {
      cb(null)
    }
  } else {
    self._debug('write before connect')
    self._chunk = chunk
    self._cb = cb
  }
}

Peer.prototype._createOffer = function () {
  var self = this
  if (self.destroyed) return

  self._pc.createOffer(function (offer) {
    if (self.destroyed) return
    offer.sdp = self.sdpTransform(offer.sdp)
    self._pc.setLocalDescription(offer, noop, function (err) { self._onError(err) })
    var sendOffer = function () {
      var signal = self._pc.localDescription || offer
      self._debug('signal')
      self.emit('signal', {
        type: signal.type,
        sdp: signal.sdp
      })
    }
    if (self.trickle || self._iceComplete) sendOffer()
    else self.once('_iceComplete', sendOffer) // wait for candidates
  }, function (err) { self._onError(err) }, self.offerConstraints)
}

Peer.prototype._createAnswer = function () {
  var self = this
  if (self.destroyed) return

  self._pc.createAnswer(function (answer) {
    if (self.destroyed) return
    answer.sdp = self.sdpTransform(answer.sdp)
    self._pc.setLocalDescription(answer, noop, function (err) { self._onError(err) })
    var sendAnswer = function () {
      var signal = self._pc.localDescription || answer
      self._debug('signal')
      self.emit('signal', {
        type: signal.type,
        sdp: signal.sdp
      })
    }
    if (self.trickle || self._iceComplete) sendAnswer()
    else self.once('_iceComplete', sendAnswer)
  }, function (err) { self._onError(err) }, self.answerConstraints)
}

Peer.prototype._onIceConnectionStateChange = function () {
  var self = this
  if (self.destroyed) return
  var iceGatheringState = self._pc.iceGatheringState
  var iceConnectionState = self._pc.iceConnectionState
  self._debug('iceConnectionStateChange %s %s', iceGatheringState, iceConnectionState)
  self.emit('iceConnectionStateChange', iceGatheringState, iceConnectionState)
  if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
    clearTimeout(self._reconnectTimeout)
    self._pcReady = true
    self._maybeReady()
  }
  if (iceConnectionState === 'disconnected') {
    if (self.reconnectTimer) {
      // If user has set `opt.reconnectTimer`, allow time for ICE to attempt a reconnect
      clearTimeout(self._reconnectTimeout)
      self._reconnectTimeout = setTimeout(function () {
        self._destroy()
      }, self.reconnectTimer)
    } else {
      self._destroy()
    }
  }
  if (iceConnectionState === 'failed') {
    self._destroy()
  }
  if (iceConnectionState === 'closed') {
    self._destroy()
  }
}

Peer.prototype.getStats = function (cb) {
  var self = this
  if (!self._pc.getStats) { // No ability to call stats
    cb([])
  } else if (typeof window !== 'undefined' && !!window.mozRTCPeerConnection) { // Mozilla
    self._pc.getStats(null, function (res) {
      var items = []
      res.forEach(function (item) {
        items.push(item)
      })
      cb(items)
    }, function (err) { self._onError(err) })
  } else {
    self._pc.getStats(function (res) { // Chrome
      var items = []
      res.result().forEach(function (result) {
        var item = {}
        result.names().forEach(function (name) {
          item[name] = result.stat(name)
        })
        item.id = result.id
        item.type = result.type
        item.timestamp = result.timestamp
        items.push(item)
      })
      cb(items)
    })
  }
}

Peer.prototype._maybeReady = function () {
  var self = this
  self._debug('maybeReady pc %s channel %s', self._pcReady, self._channelReady)
  if (self.connected || self._connecting || !self._pcReady || !self._channelReady) return
  self._connecting = true

  self.getStats(function (items) {
    self._connecting = false
    self.connected = true

    var remoteCandidates = {}
    var localCandidates = {}

    function setActiveCandidates (item) {
      var local = localCandidates[item.localCandidateId]
      var remote = remoteCandidates[item.remoteCandidateId]

      if (local) {
        self.localAddress = local.ipAddress
        self.localPort = Number(local.portNumber)
      } else if (typeof item.googLocalAddress === 'string') {
        // Sometimes `item.id` is undefined in `wrtc` and Chrome
        // See: https://github.com/feross/simple-peer/issues/66
        local = item.googLocalAddress.split(':')
        self.localAddress = local[0]
        self.localPort = Number(local[1])
      }
      self._debug('connect local: %s:%s', self.localAddress, self.localPort)

      if (remote) {
        self.remoteAddress = remote.ipAddress
        self.remotePort = Number(remote.portNumber)
        self.remoteFamily = 'IPv4'
      } else if (typeof item.googRemoteAddress === 'string') {
        remote = item.googRemoteAddress.split(':')
        self.remoteAddress = remote[0]
        self.remotePort = Number(remote[1])
        self.remoteFamily = 'IPv4'
      }
      self._debug('connect remote: %s:%s', self.remoteAddress, self.remotePort)
    }

    items.forEach(function (item) {
      if (item.type === 'remotecandidate') remoteCandidates[item.id] = item
      if (item.type === 'localcandidate') localCandidates[item.id] = item
    })

    items.forEach(function (item) {
      var isCandidatePair = (
        (item.type === 'googCandidatePair' && item.googActiveConnection === 'true') ||
        (item.type === 'candidatepair' && item.selected)
      )
      if (isCandidatePair) setActiveCandidates(item)
    })

    if (self._chunk) {
      try {
        self.send(self._chunk)
      } catch (err) {
        return self._onError(err)
      }
      self._chunk = null
      self._debug('sent chunk from "write before connect"')

      var cb = self._cb
      self._cb = null
      cb(null)
    }

    self._interval = setInterval(function () {
      if (!self._cb || !self._channel || self._channel.bufferedAmount > self._maxBufferedAmount) return
      self._debug('ending backpressure: bufferedAmount %d', self._channel.bufferedAmount)
      var cb = self._cb
      self._cb = null
      cb(null)
    }, 150)
    if (self._interval.unref) self._interval.unref()

    self._debug('connect')
    self.emit('connect')
  })
}

Peer.prototype._onSignalingStateChange = function () {
  var self = this
  if (self.destroyed) return
  self._debug('signalingStateChange %s', self._pc.signalingState)
  self.emit('signalingStateChange', self._pc.signalingState)
}

Peer.prototype._onIceCandidate = function (event) {
  var self = this
  if (self.destroyed) return
  if (event.candidate && self.trickle) {
    self.emit('signal', {
      candidate: {
        candidate: event.candidate.candidate,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
        sdpMid: event.candidate.sdpMid
      }
    })
  } else if (!event.candidate) {
    self._iceComplete = true
    self.emit('_iceComplete')
  }
}

Peer.prototype._onChannelMessage = function (event) {
  var self = this
  if (self.destroyed) return
  var data = event.data
  self._debug('read: %d bytes', data.byteLength || data.length)

  if (data instanceof ArrayBuffer) data = new Buffer(data)
  self.push(data)
}

Peer.prototype._onChannelOpen = function () {
  var self = this
  if (self.connected || self.destroyed) return
  self._debug('on channel open')
  self._channelReady = true
  self._maybeReady()
}

Peer.prototype._onChannelClose = function () {
  var self = this
  if (self.destroyed) return
  self._debug('on channel close')
  self._destroy()
}

Peer.prototype._onAddStream = function (event) {
  var self = this
  if (self.destroyed) return
  self._debug('on add stream')
  self.emit('stream', event.stream)
}

Peer.prototype._onError = function (err) {
  var self = this
  if (self.destroyed) return
  self._debug('error %s', err.message || err)
  self._destroy(err)
}

Peer.prototype._debug = function () {
  var self = this
  var args = [].slice.call(arguments)
  var id = self.channelName && self.channelName.substring(0, 7)
  args[0] = '[' + id + '] ' + args[0]
  debug.apply(null, args)
}

function noop () {}
