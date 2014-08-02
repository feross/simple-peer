module.exports = Peer

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var hat = require('hat')
var once = require('once')

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

  this.initiator = opts.initiator
  this.stream = opts.stream
  this.ready = false

  this._channelName = opts.channelName || 'simple-peer-' + hat(160)
  this._config = opts.config || Peer.config
  this._constraints = opts.constraints || Peer.constraints

  this._pc = new RTCPeerConnection(this._config, this._constraints)
  this._pc.oniceconnectionstatechange = this._onIceConnectionStateChange.bind(this)
  this._pc.onsignalingstatechange = this._onSignalingStateChange.bind(this)
  this._pc.onicecandidate = this._onIceCandidate.bind(this)

  if (this.stream) {
    this._setupVideo(this.stream)
  }

  var self = this
  if (this.initiator) {
    this._setupData({ channel: this._pc.createDataChannel(this._channelName) })

    this._pc.onnegotiationneeded = once(function () {
      self._pc.createOffer(function (offer) {
        self._pc.setLocalDescription(offer)
        self.emit('signal', offer)
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
 * time you
 */
Peer.config = { iceServers: [ { url: 'stun:23.21.150.121' } ] }
Peer.constraints = {}

Peer.prototype.close = function () {
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
  }

  this._pc = null
  this._channel = null
}

Peer.prototype._setupData = function (event) {
  this._channel = event.channel
  this._channel.onmessage = this._onChannelMessage.bind(this)
}

Peer.prototype._setupVideo = function (stream) {
  this._pc.addStream(stream)
  this._pc.onaddstream = this._onAddStream.bind(this)
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
          self.emit('signal', answer)
        }, self._onError.bind(self))
      }
    }, self._onError.bind(self))
  }
  if (data.candidate) {
    try {
      this._pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    } catch (err) {
      self.emit('error', new Error('error adding candidate, ' + err.message))
    }
  }
  if (!data.sdp && !data.candidate)
    self.emit('error', new Error('signal() called with invalid signal data'))
}

Peer.prototype.send = function (data) {
  if (!this._pc || !this._channel || this._channel.readyState !== 'open') return
  if (typeof data === 'object') {
    this._channel.send(JSON.stringify(data))
  } else {
    this._channel.send(data)
  }
}

Peer.prototype._onIceConnectionStateChange = function () {
  var iceGatheringState = this._pc.iceGatheringState
  var iceConnectionState = this._pc.iceConnectionState
  this.emit('iceConnectionStateChange', iceGatheringState, iceConnectionState)
  if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
    if (!this.ready) {
      this.ready = true
      this.emit('ready')
    }
  }
  if (iceConnectionState === 'disconnected')
    this.emit('close')
}

Peer.prototype._onSignalingStateChange = function () {
  this.emit('signalingStateChange', this._pc.signalingState, this._pc.readyState)
}

Peer.prototype._onIceCandidate = function (event) {
  if (event.candidate) {
    this.emit('signal', { candidate: event.candidate })
  }
}

Peer.prototype._onChannelMessage = function (event) {
  console.log('[datachannel] ' + event.data)
  try {
    var message = JSON.parse(event.data)
    this.emit('message', message)
  } catch (err) {
    this.emit('message', event.data)
  }
}

Peer.prototype._onAddStream = function (event) {
  this.emit('stream', event.stream)
}

Peer.prototype._onError = function (err) {
  this.emit('error', err)
}
