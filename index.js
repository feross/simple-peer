module.exports = Peer

var debug = require('debug')('simple-peer')
var EventEmitter = require('events').EventEmitter
var extend = require('extend.js')
var hat = require('hat')
var inherits = require('inherits')
var isTypedArray = require('is-typedarray')
var once = require('once')
var stream = require('stream')
var toBuffer = require('typedarray-to-buffer')

var RTCPeerConnection = typeof window !== 'undefined' &&
    (window.mozRTCPeerConnection
  || window.RTCPeerConnection
  || window.webkitRTCPeerConnection)

var RTCSessionDescription = typeof window !== 'undefined' &&
    (window.mozRTCSessionDescription
  || window.RTCSessionDescription
  || window.webkitRTCSessionDescription)

var RTCIceCandidate = typeof window !== 'undefined' &&
    (window.mozRTCIceCandidate
  || window.RTCIceCandidate
  || window.webkitRTCIceCandidate)

inherits(Peer, EventEmitter)

/**
 * A WebRTC peer connection.
 * @param {Object} opts
 */
function Peer (opts) {
  var self = this
  if (!(self instanceof Peer)) return new Peer(opts)
  EventEmitter.call(self)

  opts = extend({
    initiator: false,
    stream: false,
    config: Peer.config,
    constraints: Peer.constraints,
    channelName: (opts && opts.initiator) ? hat(160) : null,
    trickle: true
  }, opts)

  extend(self, opts)

  debug('new peer initiator: %s channelName: %s', self.initiator, self.channelName)

  self.destroyed = false
  self.ready = false
  self._pcReady = false
  self._channelReady = false
  self._dataStreams = []
  self._iceComplete = false // done with ice candidate trickle (got null candidate)

  self._pc = new RTCPeerConnection(self.config, self.constraints)
  self._pc.oniceconnectionstatechange = self._onIceConnectionStateChange.bind(self)
  self._pc.onsignalingstatechange = self._onSignalingStateChange.bind(self)
  self._pc.onicecandidate = self._onIceCandidate.bind(self)

  self._channel = null

  if (self.stream)
    self._setupVideo(self.stream)
  self._pc.onaddstream = self._onAddStream.bind(self)

  if (self.initiator) {
    self._setupData({ channel: self._pc.createDataChannel(self.channelName) })

    self._pc.onnegotiationneeded = once(function () {
      self._pc.createOffer(function (offer) {
        speedHack(offer)
        self._pc.setLocalDescription(offer)
        var sendOffer = function () {
          self.emit('signal', self._pc.localDescription || offer)
        }
        if (self.trickle || self._iceComplete) sendOffer()
        else self.once('_iceComplete', sendOffer) // wait for candidates
      }, self._onError.bind(self))
    })

    if (window.mozRTCPeerConnection) {
      // Firefox does not trigger this event automatically
      setTimeout(function () {
        self._pc.onnegotiationneeded()
      }, 0)
    }
  } else {
    self._pc.ondatachannel = self._setupData.bind(self)
  }
}

/**
 * Expose config and constraints for overriding all Peer instances. Otherwise, just
 * set opts.config and opts.constraints when constructing a Peer.
 */
Peer.config = { iceServers: [ { url: 'stun:23.21.150.121' } ] }
Peer.constraints = {}

Peer.prototype.send = function (data, cb) {
  var self = this
  if (!self._channelReady) return self.once('ready', self.send.bind(self, data, cb))
  debug('send %s', data)

  if (isTypedArray.strict(data) || data instanceof ArrayBuffer ||
      data instanceof Blob || typeof data === 'string') {
    self._channel.send(data)
  } else {
    self._channel.send(JSON.stringify(data))
  }
  if (cb) cb(null)
}

Peer.prototype.signal = function (data) {
  var self = this
  if (self.destroyed) return
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (err) {
      data = {}
    }
  }
  debug('signal %s', JSON.stringify(data))
  if (data.sdp) {
    self._pc.setRemoteDescription(new RTCSessionDescription(data), function () {
      var needsAnswer = self._pc.remoteDescription.type === 'offer'
      if (needsAnswer) {
        self._pc.createAnswer(function (answer) {
          speedHack(answer)
          self._pc.setLocalDescription(answer)
          var sendAnswer = function () {
            self.emit('signal', self._pc.localDescription || answer)
          }
          if (self.trickle || self._iceComplete) sendAnswer()
          else self.once('_iceComplete', sendAnswer)
        }, self._onError.bind(self))
      }
    }, self._onError.bind(self))
  }
  if (data.candidate) {
    try {
      self._pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    } catch (err) {
      self.destroy(new Error('error adding candidate, ' + err.message))
    }
  }
  if (!data.sdp && !data.candidate)
    self.destroy(new Error('signal() called with invalid signal data'))
}

Peer.prototype.destroy = function (err, onclose) {
  var self = this
  if (self.destroyed) return
  debug('destroy (error: %s)', err && err.message)
  self.destroyed = true
  self.ready = false

  if (typeof err === 'function') {
    onclose = err
    err = null
  }

  if (onclose) self.once('close', onclose)

  if (self._pc) {
    try {
      self._pc.close()
    } catch (err) {}

    self._pc.oniceconnectionstatechange = null
    self._pc.onsignalingstatechange = null
    self._pc.onicecandidate = null
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

  self._dataStreams.forEach(function (stream) {
    if (err) stream.emit('error', err)
    if (!stream._readableState.ended) stream.push(null)
    if (!stream._writableState.finished) stream.end()
  })
  self._dataStreams = []

  if (err) self.emit('error', err)
  self.emit('close')
}

Peer.prototype.getDataStream = function (opts) {
  var self = this
  if (self.destroyed) throw new Error('peer is destroyed')
  var dataStream = new DataStream(extend({ _peer: self }, opts))
  self._dataStreams.push(dataStream)
  return dataStream
}

Peer.prototype._setupData = function (event) {
  var self = this
  self._channel = event.channel
  self.channelName = self._channel.label

  self._channel.binaryType = 'arraybuffer'
  self._channel.onmessage = self._onChannelMessage.bind(self)
  self._channel.onopen = self._onChannelOpen.bind(self)
  self._channel.onclose = self._onChannelClose.bind(self)
}

Peer.prototype._setupVideo = function (stream) {
  var self = this
  self._pc.addStream(stream)
}

Peer.prototype._onIceConnectionStateChange = function () {
  var self = this
  if (self.destroyed) return
  var iceGatheringState = self._pc.iceGatheringState
  var iceConnectionState = self._pc.iceConnectionState
  self.emit('iceConnectionStateChange', iceGatheringState, iceConnectionState)
  debug('iceConnectionStateChange %s %s', iceGatheringState, iceConnectionState)
  if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
    self._pcReady = true
    self._maybeReady()
  }
  if (iceConnectionState === 'disconnected' || iceConnectionState === 'closed')
    self.destroy()
}

Peer.prototype._maybeReady = function () {
  var self = this
  debug('maybeReady pc %s channel %s', self._pcReady, self._channelReady)
  if (!self.ready && self._pcReady && self._channelReady) {
    debug('ready')
    self.ready = true
    self.emit('ready')
  }
}

Peer.prototype._onSignalingStateChange = function () {
  var self = this
  if (self.destroyed) return
  self.emit('signalingStateChange', self._pc.signalingState)
  debug('signalingStateChange %s', self._pc.signalingState)
}

Peer.prototype._onIceCandidate = function (event) {
  var self = this
  if (self.destroyed) return
  if (event.candidate && self.trickle) {
    self.emit('signal', { candidate: event.candidate })
  } else if (!event.candidate) {
    self._iceComplete = true
    self.emit('_iceComplete')
  }
}

Peer.prototype._onChannelMessage = function (event) {
  var self = this
  if (self.destroyed) return
  var data = event.data
  debug('receive %s', data)

  if (data instanceof ArrayBuffer) {
    data = toBuffer(new Uint8Array(data))
    self.emit('message', data)
  } else {
    try {
      self.emit('message', JSON.parse(data))
    } catch (err) {
      self.emit('message', data)
    }
  }
  self._dataStreams.forEach(function (stream) {
    stream.push(data)
  })
}

Peer.prototype._onChannelOpen = function () {
  var self = this
  if (self.destroyed) return
  self._channelReady = true
  self._maybeReady()
}

Peer.prototype._onChannelClose = function () {
  var self = this
  if (self.destroyed) return
  self._channelReady = false
  self.destroy()
}

Peer.prototype._onAddStream = function (event) {
  var self = this
  if (self.destroyed) return
  self.emit('stream', event.stream)
}

Peer.prototype._onError = function (err) {
  var self = this
  if (self.destroyed) return
  debug('error %s', err.message)
  self.destroy(err)
}

// Duplex Stream for data channel

inherits(DataStream, stream.Duplex)

function DataStream (opts) {
  var self = this
  stream.Duplex.call(self, opts)
  self._peer = opts._peer
  debug('new stream')
}

DataStream.prototype.destroy = function () {
  var self = this
  self._peer.destroy()
}

DataStream.prototype._read = function () {}

DataStream.prototype._write = function (chunk, encoding, cb) {
  var self = this
  self._peer.send(chunk, cb)
}

function speedHack (obj) {
  var s = obj.sdp.split('b=AS:30')
  if (s.length > 1)
    obj.sdp = s[0] + 'b=AS:1638400' + s[1]
}
