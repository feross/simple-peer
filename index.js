/* global Blob */

module.exports = Peer

var debug = require('debug')('simple-peer')
var dezalgo = require('dezalgo')
var extend = require('xtend/mutable')
var hat = require('hat')
var inherits = require('inherits')
var isTypedArray = require('is-typedarray')
var once = require('once')
var stream = require('stream')
var toBuffer = require('typedarray-to-buffer')

var wrtc
try {
  wrtc = require('wrtc') // webrtc in node - will be empty object in browser
} catch (err) {
  wrtc = {} // optional dependency failed to install
}

var RTCPeerConnection = typeof window !== 'undefined'
  ? window.mozRTCPeerConnection || window.RTCPeerConnection ||
    window.webkitRTCPeerConnection
  : wrtc.RTCPeerConnection

var RTCSessionDescription = typeof window !== 'undefined'
  ? window.mozRTCSessionDescription || window.RTCSessionDescription ||
    window.webkitRTCSessionDescription
  : wrtc.RTCSessionDescription

var RTCIceCandidate = typeof window !== 'undefined'
  ? window.mozRTCIceCandidate || window.RTCIceCandidate || window.webkitRTCIceCandidate
  : wrtc.RTCIceCandidate

inherits(Peer, stream.Duplex)

/**
 * A WebRTC peer connection.
 * @param {Object} opts
 */
function Peer (opts) {
  var self = this
  if (!(self instanceof Peer)) return new Peer(opts)
  if (!opts) opts = {}

  opts.allowHalfOpen = false
  stream.Duplex.call(self, opts)

  extend(self, {
    initiator: false,
    stream: false,
    config: Peer.config,
    constraints: Peer.constraints,
    channelName: (opts && opts.initiator) ? hat(160) : null,
    trickle: true
  }, opts)

  if (typeof RTCPeerConnection !== 'function') {
    if (typeof window === 'undefined') {
      throw new Error('Missing WebRTC support - was `wrtc` dependency installed?')
    } else {
      throw new Error('Missing WebRTC support - is this a supported browser?')
    }
  }

  self._debug('new peer (initiator: %s)', self.initiator)

  self.destroyed = false
  self.connected = false

  self._pcReady = false
  self._channelReady = false
  self._iceComplete = false // done with ice candidate trickle (got null candidate)
  self._channel = null
  self._buffer = []

  self._pc = new RTCPeerConnection(self.config, self.constraints)
  self._pc.oniceconnectionstatechange = self._onIceConnectionStateChange.bind(self)
  self._pc.onsignalingstatechange = self._onSignalingStateChange.bind(self)
  self._pc.onicecandidate = self._onIceCandidate.bind(self)

  if (self.stream) self._setupVideo(self.stream)
  self._pc.onaddstream = self._onAddStream.bind(self)

  if (self.initiator) {
    self._setupData({ channel: self._pc.createDataChannel(self.channelName) })
    self._pc.onnegotiationneeded = once(self._createOffer.bind(self))
    // Only Chrome triggers "negotiationneeded"; this is a workaround for other
    // implementations
    if (typeof window === 'undefined' || !window.webkitRTCPeerConnection) {
      self._pc.onnegotiationneeded()
    }
  } else {
    self._pc.ondatachannel = self._setupData.bind(self)
  }

  self.on('finish', function () {
    if (self.connected) {
      // When local peer is finished writing, close connection to remote peer.
      // Half open connections are currently not supported.
      self._destroy()
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

/**
 * Expose config and constraints for overriding all Peer instances. Otherwise, just
 * set opts.config and opts.constraints when constructing a Peer.
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

Peer.prototype.send = function (chunk, cb) {
  var self = this
  if (cb) cb = dezalgo(cb)
  else cb = noop
  self._write(chunk, undefined, cb)
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
  self._debug('signal')
  if (data.sdp) {
    self._pc.setRemoteDescription(new RTCSessionDescription(data), function () {
      if (self._pc.remoteDescription.type === 'offer') self._createAnswer()
    }, self._onError.bind(self))
  }
  if (data.candidate) {
    try {
      self._pc.addIceCandidate(
        new RTCIceCandidate(data.candidate), noop, self._onError.bind(self)
      )
    } catch (err) {
      self._destroy(new Error('error adding candidate: ' + err.message))
    }
  }
  if (!data.sdp && !data.candidate) {
    self._destroy(new Error('signal() called with invalid signal data'))
  }
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

  self.destroyed = true
  self.connected = false
  self._pcReady = false
  self._channelReady = false

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

  this.readable = this.writable = false

  if (!self._readableState.ended) self.push(null)
  if (!self._writableState.finished) self.end()

  if (err) self.emit('error', err)
  self.emit('close')
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

Peer.prototype._read = function () {}

/**
 * Send text/binary data to the remote peer.
 * @param {string|Buffer|TypedArrayView|ArrayBuffer|Blob} chunk
 * @param {string} encoding
 * @param {function} cb
 */
Peer.prototype._write = function (chunk, encoding, cb) {
  var self = this
  if (self.destroyed) return cb(new Error('cannot write after peer is destroyed'))

  var len = chunk.length || chunk.byteLength || chunk.size
  if (!self._channelReady) {
    self._debug('_write before ready: length %d', len)
    self._buffer.push(chunk)
    cb(null)
    return
  }
  self._debug('_write: length %d', len)

  if (isTypedArray.strict(chunk) || chunk instanceof ArrayBuffer ||
    typeof chunk === 'string' || (typeof Blob !== 'undefined' && chunk instanceof Blob)) {
    self._channel.send(chunk)
  } else if (Buffer.isBuffer(chunk)) {
    // node.js buffer
    self._channel.send(new Uint8Array(chunk))
  } else {
    self._channel.send(JSON.stringify(chunk))
  }

  cb(null)
}

Peer.prototype._createOffer = function () {
  var self = this
  if (self.destroyed) return

  self._pc.createOffer(function (offer) {
    if (self.destroyed) return
    speedHack(offer)
    self._pc.setLocalDescription(offer, noop, self._onError.bind(self))
    var sendOffer = function () {
      self.emit('signal', self._pc.localDescription || offer)
    }
    if (self.trickle || self._iceComplete) sendOffer()
    else self.once('_iceComplete', sendOffer) // wait for candidates
  }, self._onError.bind(self), self.offerConstraints)
}

Peer.prototype._createAnswer = function () {
  var self = this
  if (self.destroyed) return

  self._pc.createAnswer(function (answer) {
    if (self.destroyed) return
    speedHack(answer)
    self._pc.setLocalDescription(answer, noop, self._onError.bind(self))
    var sendAnswer = function () {
      self.emit('signal', self._pc.localDescription || answer)
    }
    if (self.trickle || self._iceComplete) sendAnswer()
    else self.once('_iceComplete', sendAnswer)
  }, self._onError.bind(self), self.answerConstraints)
}

Peer.prototype._onIceConnectionStateChange = function () {
  var self = this
  if (self.destroyed) return
  var iceGatheringState = self._pc.iceGatheringState
  var iceConnectionState = self._pc.iceConnectionState
  self.emit('iceConnectionStateChange', iceGatheringState, iceConnectionState)
  self._debug('iceConnectionStateChange %s %s', iceGatheringState, iceConnectionState)
  if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
    self._pcReady = true
    self._maybeReady()
  }
  if (iceConnectionState === 'disconnected' || iceConnectionState === 'closed') {
    self._destroy()
  }
}

Peer.prototype._maybeReady = function () {
  var self = this
  self._debug('maybeReady pc %s channel %s', self._pcReady, self._channelReady)
  if (!self.connected && self._pcReady && self._channelReady) {
    self.connected = true
    self._buffer.forEach(function (chunk) {
      self.send(chunk)
    })
    self._buffer = []

    self._debug('connect')
    self.emit('connect')
  }
}

Peer.prototype._onSignalingStateChange = function () {
  var self = this
  if (self.destroyed) return
  self.emit('signalingStateChange', self._pc.signalingState)
  self._debug('signalingStateChange %s', self._pc.signalingState)
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
  self._debug('on channel message: length %d', data.byteLength || data.length)

  if (data instanceof ArrayBuffer) {
    data = toBuffer(new Uint8Array(data))
    self.push(data)
  } else {
    try {
      data = JSON.parse(data)
    } catch (err) {}
    self.emit('data', data)
  }
}

Peer.prototype._onChannelOpen = function () {
  var self = this
  if (self.destroyed) return
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

function speedHack (obj) {
  var s = obj.sdp.split('b=AS:30')
  if (s.length > 1) obj.sdp = s[0] + 'b=AS:1638400' + s[1]
}

function noop () {}
