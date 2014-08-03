module.exports = Peer

var EventEmitter = require('events').EventEmitter
var extend = require('extend.js')
var hat = require('hat')
var inherits = require('inherits')
var isTypedArray = require('is-typedarray')
var once = require('once')
var stream = require('stream')
var toBuffer = require('typedarray-to-buffer')

var RTCPeerConnection = window.mozRTCPeerConnection
  || window.RTCPeerConnection
  || window.webkitRTCPeerConnection

var RTCSessionDescription = window.mozRTCSessionDescription
  || window.RTCSessionDescription
  || window.webkitRTCSessionDescription

var RTCIceCandidate = window.mozRTCIceCandidate
  || window.RTCIceCandidate
  || window.webkitRTCIceCandidate

inherits(Peer, EventEmitter)

function Peer (opts) {
  EventEmitter.call(this)
  if (!opts) opts = {}

  this.initiator = opts.initiator || false
  this.stream = opts.stream || false
  this._config = opts.config || Peer.config
  this._constraints = opts.constraints || Peer.constraints
  this._channelName = opts.channelName || 'simple-peer-' + hat(160)
  this._trickle = opts.trickle === undefined ? true : opts.trickle
  this._iceComplete = false // done with ice candidate trickle (got null candidate)

  this.destroyed = false
  this.ready = false
  this._pcReady = false
  this._channelReady = false
  this._dataStreams = []

  this._pc = new RTCPeerConnection(this._config, this._constraints)
  this._pc.oniceconnectionstatechange = this._onIceConnectionStateChange.bind(this)
  this._pc.onsignalingstatechange = this._onSignalingStateChange.bind(this)
  this._pc.onicecandidate = this._onIceCandidate.bind(this)

  if (this.stream)
    this._setupVideo(this.stream)

  if (this.initiator) {
    this._setupData({ channel: this._pc.createDataChannel(this._channelName) })

    var self = this
    this._pc.onnegotiationneeded = once(function () {
      self._pc.createOffer(function (offer) {
        self._pc.setLocalDescription(offer)
        var sendOffer = function () {
          self.emit('signal', self._pc.localDescription || offer)
        }
        if (self._trickle || self._iceComplete) sendOffer()
        else self.once('_iceComplete', sendOffer) // wait for candidates
      }, self._onError.bind(self))
    })

    if (window.mozRTCPeerConnection) {
      // Firefox does not trigger this event automatically
      setTimeout(this._pc.onnegotiationneeded.bind(this._pc), 0)
    }
  } else {
    this._pc.ondatachannel = this._setupData.bind(this)
  }
}

/**
 * Expose config and constraints for overriding all Peer instances. Otherwise, just
 * set opts.config and opts.constraints when constructing a Peer.
 */
Peer.config = { iceServers: [ { url: 'stun:23.21.150.121' } ] }
Peer.constraints = {}

Peer.prototype.send = function (data) {
  if (!this._pc || !this._channel || this._channel.readyState !== 'open')
    return false
  if (isTypedArray.strict(data) || data instanceof ArrayBuffer ||
      data instanceof Blob || typeof data === 'string') {
    this._channel.send(data)
  } else {
    this._channel.send(JSON.stringify(data))
  }
  return true
}

Peer.prototype.signal = function (data) {
  var self = this
  if (!this._pc) return
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (err) {
      data = {}
    }
  }
  if (data.sdp) {
    this._pc.setRemoteDescription(new RTCSessionDescription(data), function () {
      var needsAnswer = self._pc.remoteDescription.type === 'offer'
      if (needsAnswer) {
        self._pc.createAnswer(function (answer) {
          self._pc.setLocalDescription(answer)
          var sendAnswer = function () {
            self.emit('signal', self._pc.localDescription || answer)
          }
          if (self._trickle || self._iceComplete) sendAnswer()
          else self.once('_iceComplete', sendAnswer)
        }, self._onError.bind(self))
      }
    }, self._onError.bind(self))
  }
  if (data.candidate) {
    try {
      this._pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    } catch (err) {
      self.destroy(new Error('error adding candidate, ' + err.message))
    }
  }
  if (!data.sdp && !data.candidate)
    self.destroy(new Error('signal() called with invalid signal data'))
}

Peer.prototype.destroy = function (err, onclose) {
  if (this.destroyed) return
  this.destroyed = true
  this.ready = false

  if (typeof err === 'function') {
    onclose = err
    err = null
  }

  if (onclose) this.once('close', onclose)

  if (this._pc) {
    try {
      this._pc.close()
    } catch (err) {}

    this._pc.oniceconnectionstatechange = null
    this._pc.onsignalingstatechange = null
    this._pc.onicecandidate = null
  }

  if (this._channel) {
    try {
      this._channel.close()
    } catch (err) {}

    this._channel.onmessage = null
    this._channel.onopen = null
    this._channel.onclose = null
  }
  this._pc = null
  this._channel = null

  this._dataStreams.forEach(function (stream) {
    if (!stream._readableState.ended) stream.push(null)
    if (!stream._writableState.finished) stream.end()
  })
  this._dataStreams = []

  if (err) this.emit('error', err)
  this.emit('close')
}

Peer.prototype.getDataStream = function (opts) {
  if (this.destroyed) throw new Error('peer is destroyed')
  var dataStream = new DataStream(extend({ _peer: this }, opts))
  this._dataStreams.push(dataStream)
  return dataStream
}

Peer.prototype._setupData = function (event) {
  this._channel = event.channel
  this._channel.binaryType = 'arraybuffer'
  this._channel.onmessage = this._onChannelMessage.bind(this)
  this._channel.onopen = this._onChannelOpen.bind(this)
  this._channel.onclose = this._onChannelClose.bind(this)
}

Peer.prototype._setupVideo = function (stream) {
  this._pc.addStream(stream)
  this._pc.onaddstream = this._onAddStream.bind(this)
}

Peer.prototype._onIceConnectionStateChange = function () {
  var iceGatheringState = this._pc.iceGatheringState
  var iceConnectionState = this._pc.iceConnectionState
  this.emit('iceConnectionStateChange', iceGatheringState, iceConnectionState)
  if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
    this._pcReady = true
    this._maybeReady()
  }
  if (iceConnectionState === 'disconnected' || iceConnectionState === 'closed')
    this.destroy()
}

Peer.prototype._maybeReady = function () {
  if (!this.ready && this._pcReady && this._channelReady) {
    this.ready = true
    this.emit('ready')
  }
}

Peer.prototype._onSignalingStateChange = function () {
  this.emit('signalingStateChange', this._pc.signalingState, this._pc.readyState)
}

Peer.prototype._onIceCandidate = function (event) {
  if (event.candidate && this._trickle) {
    this.emit('signal', { candidate: event.candidate })
  } else if (!event.candidate) {
    this._iceComplete = true
    this.emit('_iceComplete')
  }
}

Peer.prototype._onChannelMessage = function (event) {
  var data = event.data
  if (this.destroyed) return
  console.log('[datachannel] ' + data)
  if (data instanceof ArrayBuffer) {
    data = toBuffer(new Uint8Array(data))
    this.emit('message', data)
  } else {
    try {
      this.emit('message', JSON.parse(data))
    } catch (err) {
      this.emit('message', data)
    }
  }
  this._dataStreams.forEach(function (stream) {
    stream.push(data)
  })
}

Peer.prototype._onChannelOpen = function () {
  this._channelReady = true
  this._maybeReady()
}

Peer.prototype._onChannelClose = function () {
  this._channelReady = false
  this.destroy()
}

Peer.prototype._onAddStream = function (event) {
  this.emit('stream', event.stream)
}

Peer.prototype._onError = function (err) {
  this.destroy(err)
}

// Duplex Stream for data channel

inherits(DataStream, stream.Duplex)

function DataStream (opts) {
  stream.Duplex.call(this, opts)
  this._peer = opts._peer
}

DataStream.prototype.destroy = function () {
  this._peer.destroy()
}

DataStream.prototype._read = function () {}

DataStream.prototype._write = function (chunk, encoding, cb) {
  window.chunk = chunk
  if (this._peer.send(chunk))
    cb()
  else
    cb(new Error('peer is closed'))
}
