module.exports = Peer

var debug = require('debug')('simple-peer')
var getBrowserRTC = require('get-browser-rtc')
var inherits = require('inherits')
var randombytes = require('randombytes')
var DataChannel = require('./datachannel')

var ICECOMPLETE_TIMEOUT = 5 * 1000

inherits(Peer, DataChannel)

/**
 * WebRTC peer connection. Same API as node core `net.Socket`, plus a few extra methods.
 * Duplex stream.
 * @param {Object} opts
 */
function Peer (opts) {
  var self = this
  if (!(self instanceof Peer)) return new Peer(opts)

  opts = opts || {}

  self._id = randombytes(4).toString('hex').slice(0, 7)
  self._debug('new peer %o', opts)

  DataChannel.call(self, opts) // the Peer is a DataChannel

  self.initiator = opts.initiator || false
  self.channelName = opts.channelName
  self.channelConfig = opts.channelConfig || Peer.channelConfig
  self.config = Object.assign({}, Peer.config, opts.config)
  self.offerOptions = opts.offerOptions || {}
  self.answerOptions = opts.answerOptions || {}
  self.sdpTransform = opts.sdpTransform || function (sdp) { return sdp }
  self.streams = opts.streams || (opts.stream ? [opts.stream] : []) // support old "stream" option
  self.trickle = opts.trickle !== undefined ? opts.trickle : true
  self.allowHalfTrickle = opts.allowHalfTrickle !== undefined ? opts.allowHalfTrickle : false
  self.iceCompleteTimeout = opts.iceCompleteTimeout || ICECOMPLETE_TIMEOUT

  self.destroyed = false
  self.connected = false

  self.remoteAddress = undefined
  self.remoteFamily = undefined
  self.remotePort = undefined
  self.localAddress = undefined
  self.localFamily = undefined
  self.localPort = undefined

  self._wrtc = (opts.wrtc && typeof opts.wrtc === 'object')
    ? opts.wrtc
    : getBrowserRTC()

  if (!self._wrtc) {
    if (typeof window === 'undefined') {
      throw makeError('No WebRTC support: Specify `opts.wrtc` option in this environment', 'ERR_WEBRTC_SUPPORT')
    } else {
      throw makeError('No WebRTC support: Not a supported browser', 'ERR_WEBRTC_SUPPORT')
    }
  }

  self._pcReady = false
  self._channelReady = false
  self._iceComplete = false // ice candidate trickle done (got null candidate)
  self._iceCompleteTimer = null // send an offer/answer anyway after some timeout
  self._pendingCandidates = []

  self._isNegotiating = !self.initiator // is this peer waiting for negotiation to complete?
  self._batchedNegotiation = false // batch synchronous negotiations
  self._queuedNegotiation = false // is there a queued negotiation request?
  self._sendersAwaitingStable = []
  self._senderMap = new Map()
  self._firstStable = true

  self._remoteTracks = []
  self._remoteStreams = []

  self._channels = []
  self._channelNameCounter = 0

  try {
    self._pc = new (self._wrtc.RTCPeerConnection)(self.config)
  } catch (err) {
    self.destroy(err)
  }

  // We prefer feature detection whenever possible, but sometimes that's not
  // possible for certain implementations.
  self._isReactNativeWebrtc = typeof self._pc._peerConnectionId === 'number'

  self._pc.oniceconnectionstatechange = function () {
    self._onIceStateChange()
  }
  self._pc.onicegatheringstatechange = function () {
    self._onIceStateChange()
  }
  self._pc.onsignalingstatechange = function () {
    self._onSignalingStateChange()
  }
  self._pc.onicecandidate = function (event) {
    self._onIceCandidate(event)
  }

  // Other spec events, unused by this implementation:
  // - onconnectionstatechange
  // - onicecandidateerror
  // - onfingerprintfailure
  // - onnegotiationneeded

  if (self.initiator || self.channelConfig.negotiated) {
    var channelName = self._makeUniqueChannelName(self.channelName || 'default')
    var channel = self._pc.createDataChannel(channelName, self.channelConfig) // use label 'default' for datachannel correlation
    self._setDataChannel(channel)
  }
  self._pc.ondatachannel = function (event) {
    self._debug('ondatachannel', event.channel.label)

    if (!self._channels[0]._channel) {
      self._setDataChannel(event.channel)
    } else {
      var channel = new DataChannel(opts)
      channel._setDataChannel(event.channel)
      self._channels.push(channel)
      self.emit('datachannel', channel, channel.channelName)
    }
  }
  self._channels.push(self)

  if (self.streams) {
    self.streams.forEach(function (stream) {
      self.addStream(stream)
    })
  }
  self._pc.ontrack = function (event) {
    self._onTrack(event)
  }

  self.on('open', function () {
    self._channelReady = true
    self._maybeReady()
  })

  if (self.initiator) {
    self._needsNegotiation()
  }
}

Peer.WEBRTC_SUPPORT = !!getBrowserRTC()

/**
 * Expose peer and data channel config for overriding all Peer
 * instances. Otherwise, just set opts.config or opts.channelConfig
 * when constructing a Peer.
 */
Peer.config = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'stun:global.stun.twilio.com:3478?transport=udp'
    }
  ],
  sdpSemantics: 'unified-plan'
}
Peer.channelConfig = {}

Peer.prototype.address = function () {
  var self = this
  return { port: self.localPort, family: self.localFamily, address: self.localAddress }
}

Peer.prototype.signal = function (data) {
  var self = this
  if (self.destroyed) throw makeError('cannot signal after peer is destroyed', 'ERR_SIGNALING')
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (err) {
      data = {}
    }
  }
  self._debug('signal()')

  if (data.renegotiate && self.initiator) {
    self._debug('got request to renegotiate')
    self._needsNegotiation()
  }
  if (data.transceiverRequest && self.initiator) {
    self._debug('got request for transceiver')
    self.addTransceiver(data.transceiverRequest.kind, data.transceiverRequest.init)
  }
  if (data.candidate) {
    if (self._pc.localDescription && self._pc.localDescription.type && self._pc.remoteDescription && self._pc.remoteDescription.type) {
      self._addIceCandidate(data.candidate)
    } else {
      self._pendingCandidates.push(data.candidate)
    }
  }
  if (data.sdp) {
    self._pc.setRemoteDescription(new (self._wrtc.RTCSessionDescription)(data)).then(function () {
      if (self.destroyed) return

      self._pendingCandidates.forEach(function (candidate) {
        self._addIceCandidate(candidate)
      })
      self._pendingCandidates = []

      if (self._pc.remoteDescription.type === 'offer') self._createAnswer()
    }).catch(function (err) { self.destroy(makeError(err, 'ERR_SET_REMOTE_DESCRIPTION')) })
  }
  if (!data.sdp && !data.candidate && !data.renegotiate && !data.transceiverRequest) {
    self.destroy(makeError('signal() called with invalid signal data', 'ERR_SIGNALING'))
  }
}

Peer.prototype._addIceCandidate = function (candidate) {
  var self = this
  self._pc.addIceCandidate(new self._wrtc.RTCIceCandidate(candidate)).catch(function (err) {
    // HACK: node-webrtc throws an incorrect error https://github.com/node-webrtc/node-webrtc/issues/498
    if (self._pc.signalingState !== 'closed' && err.message === 'Failed to set ICE candidate; RTCPeerConnection is closed.') {
      return self._debug('ignoring incorrect wrtc error')
    }
    self.destroy(makeError(err, 'ERR_ADD_ICE_CANDIDATE'))
  })
}

Peer.prototype.createDataChannel = function (channelName, channelConfig, opts) {
  var self = this
  var channel = new DataChannel(opts)
  channelName = self._makeUniqueChannelName(channelName)
  channel._setDataChannel(self._pc.createDataChannel(channelName, channelConfig))
  self._channels.push(channel)
  return channel
}

/**
 * Add a Transceiver to the connection.
 * @param {String} kind
 * @param {Object} init
 */
Peer.prototype.addTransceiver = function (kind, init) {
  var self = this

  self._debug('addTransceiver()')

  if (self.initiator) {
    try {
      self._pc.addTransceiver(kind, init)
      self._needsNegotiation()
    } catch (err) {
      self.destroy(err)
    }
  } else {
    self.emit('signal', { // request initiator to renegotiate
      transceiverRequest: { kind, init }
    })
  }
}

/**
 * Add a Transceiver to the connection.
 * @param {String} kind
 * @param {Object} init
 */
Peer.prototype.addTransceiver = function (kind, init) {
  var self = this

  self._debug('addTransceiver()')

  if (self.initiator) {
    try {
      self._pc.addTransceiver(kind, init)
      self._needsNegotiation()
    } catch (err) {
      self.destroy(err)
    }
  } else {
    self.emit('signal', { // request initiator to renegotiate
      transceiverRequest: { kind, init }
    })
  }
}

/**
 * Add a MediaStream to the connection.
 * @param {MediaStream} stream
 */
Peer.prototype.addStream = function (stream) {
  var self = this

  self._debug('addStream()')

  stream.getTracks().forEach(function (track) {
    self.addTrack(track, stream)
  })
}

/**
 * Add a MediaStreamTrack to the connection.
 * @param {MediaStreamTrack} track
 * @param {MediaStream} stream
 */
Peer.prototype.addTrack = function (track, stream) {
  var self = this

  self._debug('addTrack()')

  var submap = self._senderMap.get(track) || new Map() // nested Maps map [track, stream] to sender
  var sender = submap.get(stream)
  if (!sender) {
    sender = self._pc.addTrack(track, stream)
    submap.set(stream, sender)
    self._senderMap.set(track, submap)
    self._needsNegotiation()
  } else if (sender.removed) {
    self.destroy(makeError('Track has been removed. You should enable/disable tracks that you want to re-add.'), 'ERR_SENDER_REMOVED')
  } else {
    self.destroy(makeError('Track has already been added to that stream.'), 'ERR_SENDER_ALREADY_ADDED')
  }
}

/**
 * Replace a MediaStreamTrack by another in the connection.
 * @param {MediaStreamTrack} oldTrack
 * @param {MediaStreamTrack} newTrack
 * @param {MediaStream} stream
 */
Peer.prototype.replaceTrack = function (oldTrack, newTrack, stream) {
  var self = this

  self._debug('replaceTrack()')

  var submap = self._senderMap.get(oldTrack)
  var sender = submap ? submap.get(stream) : null
  if (!sender) {
    self.destroy(makeError('Cannot replace track that was never added.'), 'ERR_TRACK_NOT_ADDED')
  }
  if (newTrack) self._senderMap.set(newTrack, submap)

  if (sender.replaceTrack != null) {
    sender.replaceTrack(newTrack)
  } else {
    self.destroy(makeError('replaceTrack is not supported in this browser', 'ERR_UNSUPPORTED_REPLACETRACK'))
  }
}

/**
 * Remove a MediaStreamTrack from the connection.
 * @param {MediaStreamTrack} track
 * @param {MediaStream} stream
 */
Peer.prototype.removeTrack = function (track, stream) {
  var self = this

  self._debug('removeSender()')

  var submap = self._senderMap.get(track)
  var sender = submap ? submap.get(stream) : null
  if (!sender) {
    self.destroy(makeError('Cannot remove track that was never added.', 'ERR_TRACK_NOT_ADDED'))
  }
  try {
    sender.removed = true
    self._pc.removeTrack(sender)
  } catch (err) {
    if (err.name === 'NS_ERROR_UNEXPECTED') {
      self._sendersAwaitingStable.push(sender) // HACK: Firefox must wait until (signalingState === stable) https://bugzilla.mozilla.org/show_bug.cgi?id=1133874
    } else {
      self.destroy(err)
    }
  }
  self._needsNegotiation()
}

/**
 * Remove a MediaStream from the connection.
 * @param {MediaStream} stream
 */
Peer.prototype.removeStream = function (stream) {
  var self = this

  self._debug('removeSenders()')

  stream.getTracks().forEach(function (track) {
    self.removeTrack(track, stream)
  })
}

Peer.prototype._needsNegotiation = function () {
  var self = this

  self._debug('_needsNegotiation')
  if (self._batchedNegotiation) return // batch synchronous renegotiations
  self._batchedNegotiation = true
  setTimeout(function () {
    self._batchedNegotiation = false
    self._debug('starting batched negotiation')
    self.negotiate()
  }, 0)
}

Peer.prototype.negotiate = function () {
  var self = this

  if (self.initiator) {
    if (self._isNegotiating) {
      self._queuedNegotiation = true
      self._debug('already negotiating, queueing')
    } else {
      self._debug('start negotiation')
      setTimeout(() => { // HACK: Chrome crashes if we immediately call createOffer
        self._createOffer()
      }, 0)
    }
  } else {
    if (!self._isNegotiating) {
      self._debug('requesting negotiation from initiator')
      self.emit('signal', { // request initiator to renegotiate
        renegotiate: true
      })
    }
  }
  self._isNegotiating = true
}

// TODO: Delete this method once readable-stream is updated to contain a default
// implementation of destroy() that automatically calls _destroy()
// See: https://github.com/nodejs/readable-stream/issues/283
Peer.prototype.destroy = function (err) {
  var self = this
  if (self.destroyed) return

  self._debug('destroy (error: %s)', err && (err.message || err))

  self._channels.forEach(function (channel) {
    DataChannel.prototype.destroy.apply(channel, err)
  })
  self._channels = null
  self._channelNameCounter = null

  self.destroyed = true
  self.connected = false
  self._pcReady = false
  self._remoteTracks = null
  self._remoteStreams = null
  self._senderMap = null

  if (self._pc) {
    try {
      self._pc.close()
    } catch (err) {}

    self._pc.oniceconnectionstatechange = null
    self._pc.onicegatheringstatechange = null
    self._pc.onsignalingstatechange = null
    self._pc.onicecandidate = null
    self._pc.ontrack = null
    self._pc.ondatachannel = null
  }
  self._pc = null
}

Peer.prototype._startIceCompleteTimeout = function () {
  var self = this
  if (self.destroyed) return
  if (self._iceCompleteTimer) return
  self._debug('started iceComplete timeout')
  self._iceCompleteTimer = setTimeout(function () {
    if (!self._iceComplete) {
      self._iceComplete = true
      self._debug('iceComplete timeout completed')
      self.emit('iceTimeout')
      self.emit('_iceComplete')
    }
  }, self.iceCompleteTimeout)
}

Peer.prototype._createOffer = function () {
  var self = this
  if (self.destroyed) return

  self._pc.createOffer(self.offerOptions).then(function (offer) {
    if (self.destroyed) return
    if (!self.trickle && !self.allowHalfTrickle) offer.sdp = filterTrickle(offer.sdp)
    offer.sdp = self.sdpTransform(offer.sdp)
    self._pc.setLocalDescription(offer).then(onSuccess).catch(onError)

    function onSuccess () {
      self._debug('createOffer success')
      if (self.destroyed) return
      if (self.trickle || self._iceComplete) sendOffer()
      else self.once('_iceComplete', sendOffer) // wait for candidates
    }

    function onError (err) {
      self.destroy(makeError(err, 'ERR_SET_LOCAL_DESCRIPTION'))
    }

    function sendOffer () {
      if (self.destroyed) return
      var signal = self._pc.localDescription || offer
      self._debug('signal')
      self.emit('signal', {
        type: signal.type,
        sdp: signal.sdp
      })
    }
  }).catch(function (err) { self.destroy(makeError(err, 'ERR_CREATE_OFFER')) })
}

Peer.prototype._requestMissingTransceivers = function () {
  var self = this

  if (self._pc.getTransceivers) {
    self._pc.getTransceivers().forEach(transceiver => {
      if (!transceiver.mid && transceiver.sender.track) {
        self.addTransceiver(transceiver.sender.track.kind)
      }
    })
  }
}

Peer.prototype._createAnswer = function () {
  var self = this
  if (self.destroyed) return

  self._pc.createAnswer(self.answerOptions).then(function (answer) {
    if (self.destroyed) return
    if (!self.trickle && !self.allowHalfTrickle) answer.sdp = filterTrickle(answer.sdp)
    answer.sdp = self.sdpTransform(answer.sdp)
    self._pc.setLocalDescription(answer).then(onSuccess).catch(onError)

    function onSuccess () {
      if (self.destroyed) return
      if (self.trickle || self._iceComplete) sendAnswer()
      else self.once('_iceComplete', sendAnswer)
    }

    function onError (err) {
      self.destroy(makeError(err, 'ERR_SET_LOCAL_DESCRIPTION'))
    }

    function sendAnswer () {
      if (self.destroyed) return
      var signal = self._pc.localDescription || answer
      self._debug('signal')
      self.emit('signal', {
        type: signal.type,
        sdp: signal.sdp
      })
      if (!self.initiator) self._requestMissingTransceivers()
    }
  }).catch(function (err) { self.destroy(makeError(err, 'ERR_CREATE_ANSWER')) })
}

Peer.prototype._onIceStateChange = function () {
  var self = this
  if (self.destroyed) return
  var iceConnectionState = self._pc.iceConnectionState
  var iceGatheringState = self._pc.iceGatheringState

  self._debug(
    'iceStateChange (connection: %s) (gathering: %s)',
    iceConnectionState,
    iceGatheringState
  )
  self.emit('iceStateChange', iceConnectionState, iceGatheringState)

  if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
    self._pcReady = true
    self._maybeReady()
  }
  if (iceConnectionState === 'failed') {
    self.destroy(makeError('Ice connection failed.', 'ERR_ICE_CONNECTION_FAILURE'))
  }
  if (iceConnectionState === 'closed') {
    self.destroy(makeError('Ice connection closed.', 'ERR_ICE_CONNECTION_CLOSED'))
  }
}

Peer.prototype.getStats = function (cb) {
  var self = this

  // Promise-based getStats() (standard)
  if (self._pc.getStats.length === 0) {
    self._pc.getStats().then(function (res) {
      var reports = []
      res.forEach(function (report) {
        reports.push(flattenValues(report))
      })
      cb(null, reports)
    }, function (err) { cb(err) })

  // Two-parameter callback-based getStats() (deprecated, former standard)
  } else if (self._isReactNativeWebrtc) {
    self._pc.getStats(null, function (res) {
      var reports = []
      res.forEach(function (report) {
        reports.push(flattenValues(report))
      })
      cb(null, reports)
    }, function (err) { cb(err) })

  // Single-parameter callback-based getStats() (non-standard)
  } else if (self._pc.getStats.length > 0) {
    self._pc.getStats(function (res) {
      // If we destroy connection in `connect` callback this code might happen to run when actual connection is already closed
      if (self.destroyed) return

      var reports = []
      res.result().forEach(function (result) {
        var report = {}
        result.names().forEach(function (name) {
          report[name] = result.stat(name)
        })
        report.id = result.id
        report.type = result.type
        report.timestamp = result.timestamp
        reports.push(flattenValues(report))
      })
      cb(null, reports)
    }, function (err) { cb(err) })

  // Unknown browser, skip getStats() since it's anyone's guess which style of
  // getStats() they implement.
  } else {
    cb(null, [])
  }

  // statreports can come with a value array instead of properties
  function flattenValues (report) {
    if (Object.prototype.toString.call(report.values) === '[object Array]') {
      report.values.forEach(function (value) {
        Object.assign(report, value)
      })
    }
    return report
  }
}

Peer.prototype._maybeReady = function () {
  var self = this
  self._debug('maybeReady pc %s channel %s', self._pcReady, self._channelReady)
  if (self.connected || self._connecting || !self._pcReady || !self._channelReady) return

  self._connecting = true

  // HACK: We can't rely on order here, for details see https://github.com/js-platform/node-webrtc/issues/339
  function findCandidatePair () {
    if (self.destroyed) return

    self.getStats(function (err, items) {
      if (self.destroyed) return

      // Treat getStats error as non-fatal. It's not essential.
      if (err) items = []

      var remoteCandidates = {}
      var localCandidates = {}
      var candidatePairs = {}
      var foundSelectedCandidatePair = false

      items.forEach(function (item) {
        // TODO: Once all browsers support the hyphenated stats report types, remove
        // the non-hypenated ones
        if (item.type === 'remotecandidate' || item.type === 'remote-candidate') {
          remoteCandidates[item.id] = item
        }
        if (item.type === 'localcandidate' || item.type === 'local-candidate') {
          localCandidates[item.id] = item
        }
        if (item.type === 'candidatepair' || item.type === 'candidate-pair') {
          candidatePairs[item.id] = item
        }
      })

      items.forEach(function (item) {
        // Spec-compliant
        if (item.type === 'transport' && item.selectedCandidatePairId) {
          setSelectedCandidatePair(candidatePairs[item.selectedCandidatePairId])
        }

        // Old implementations
        if (
          (item.type === 'googCandidatePair' && item.googActiveConnection === 'true') ||
          ((item.type === 'candidatepair' || item.type === 'candidate-pair') && item.selected)
        ) {
          setSelectedCandidatePair(item)
        }
      })

      function setSelectedCandidatePair (selectedCandidatePair) {
        foundSelectedCandidatePair = true

        var local = localCandidates[selectedCandidatePair.localCandidateId]

        if (local && (local.ip || local.address)) {
          // Spec
          self.localAddress = local.ip || local.address
          self.localPort = Number(local.port)
        } else if (local && local.ipAddress) {
          // Firefox
          self.localAddress = local.ipAddress
          self.localPort = Number(local.portNumber)
        } else if (typeof selectedCandidatePair.googLocalAddress === 'string') {
          // TODO: remove this once Chrome 58 is released
          local = selectedCandidatePair.googLocalAddress.split(':')
          self.localAddress = local[0]
          self.localPort = Number(local[1])
        }
        if (self.localAddress) {
          self.localFamily = self.localAddress.includes(':') ? 'IPv6' : 'IPv4'
        }

        var remote = remoteCandidates[selectedCandidatePair.remoteCandidateId]

        if (remote && (remote.ip || remote.address)) {
          // Spec
          self.remoteAddress = remote.ip || remote.address
          self.remotePort = Number(remote.port)
        } else if (remote && remote.ipAddress) {
          // Firefox
          self.remoteAddress = remote.ipAddress
          self.remotePort = Number(remote.portNumber)
        } else if (typeof selectedCandidatePair.googRemoteAddress === 'string') {
          // TODO: remove this once Chrome 58 is released
          remote = selectedCandidatePair.googRemoteAddress.split(':')
          self.remoteAddress = remote[0]
          self.remotePort = Number(remote[1])
        }
        if (self.remoteAddress) {
          self.remoteFamily = self.remoteAddress.includes(':') ? 'IPv6' : 'IPv4'
        }

        self._debug(
          'connect local: %s:%s remote: %s:%s',
          self.localAddress, self.localPort, self.remoteAddress, self.remotePort
        )
      }

      // Ignore candidate pair selection in browsers like Safari 11 that do not have any local or remote candidates
      // But wait until at least 1 candidate pair is available
      if (!foundSelectedCandidatePair && (!Object.keys(candidatePairs).length || Object.keys(localCandidates).length)) {
        setTimeout(findCandidatePair, 100)
        return
      } else {
        self._connecting = false
        self.connected = true
      }

      self._debug('connect')
      self.emit('connect')
    })
  }
  findCandidatePair()
}

Peer.prototype._onSignalingStateChange = function () {
  var self = this
  if (self.destroyed) return

  if (self._pc.signalingState === 'stable' && !self._firstStable) {
    self._isNegotiating = false

    // HACK: Firefox doesn't yet support removing tracks when signalingState !== 'stable'
    self._debug('flushing sender queue', self._sendersAwaitingStable)
    self._sendersAwaitingStable.forEach(function (sender) {
      self._pc.removeTrack(sender)
      self._queuedNegotiation = true
    })
    self._sendersAwaitingStable = []

    if (self._queuedNegotiation) {
      self._debug('flushing negotiation queue')
      self._queuedNegotiation = false
      self._needsNegotiation() // negotiate again
    }

    self._debug('negotiate')
    self.emit('negotiate')
  }
  self._firstStable = false

  self._debug('signalingStateChange %s', self._pc.signalingState)
  self.emit('signalingStateChange', self._pc.signalingState)
}

Peer.prototype._onIceCandidate = function (event) {
  var self = this
  if (self.destroyed) return
  if (event.candidate && self.trickle) {
    self._debug('iceCandidate')
    self.emit('signal', {
      candidate: {
        candidate: event.candidate.candidate,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
        sdpMid: event.candidate.sdpMid
      }
    })
  } else if (!event.candidate && !self._iceComplete) {
    self._iceComplete = true
    self.emit('_iceComplete')
  }
  // as soon as we've received one valid candidate start timeout
  if (event.candidate) {
    self._startIceCompleteTimeout()
  }
}

Peer.prototype._onTrack = function (event) {
  var self = this
  if (self.destroyed) return

  event.streams.forEach(function (eventStream) {
    self._debug('on track')
    self.emit('track', event.track, eventStream)

    self._remoteTracks.push({
      track: event.track,
      stream: eventStream
    })

    if (self._remoteStreams.some(function (remoteStream) {
      return remoteStream.id === eventStream.id
    })) return // Only fire one 'stream' event, even though there may be multiple tracks per stream

    self._remoteStreams.push(eventStream)
    setTimeout(function () {
      self.emit('stream', eventStream) // ensure all tracks have been added
    }, 0)
  })
}

Peer.prototype._debug = function () {
  var self = this
  var args = [].slice.call(arguments)
  args[0] = '[' + self._id + '] ' + args[0]
  debug.apply(null, args)
}

// HACK: We cannot reuse channel names, so we use the peer ID and a counter
Peer.prototype._makeUniqueChannelName = function (channelName) {
  var self = this
  channelName = channelName || ''
  if (channelName.indexOf('@') !== -1) {
    return self.destroy(makeError('channelName cannot include "@" character', 'INVALID_CHANNEL_NAME'))
  }
  return channelName + '@' + self._id + (self._channelNameCounter++)
}

// HACK: Filter trickle lines when trickle is disabled #354
function filterTrickle (sdp) {
  return sdp.replace(/a=ice-options:trickle\s\n/g, '')
}

function makeError (message, code) {
  var err = new Error(message)
  err.code = code
  return err
}
