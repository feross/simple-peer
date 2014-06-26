module.exports = Peer

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
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

var CONFIG = {
  iceServers: [ { url: 'stun:23.21.150.121' } ]
}

var CONSTRAINTS = {}

var CHANNEL_NAME = 'instant.io'

inherits(Peer, EventEmitter)

function Peer (opts) {
  opts = opts || {}

  this.ready = false
  this._pc = new RTCPeerConnection(CONFIG, CONSTRAINTS)

  var self = this
  this._pc.oniceconnectionstatechange = function (event) {
    self.emit('iceconnectionstatechange', self._pc.iceGatheringState, self._pc.iceConnectionState)
    if (self._pc.iceConnectionState === 'connected' || self._pc.iceConnectionState === 'completed') {
      if (!self.ready) {
        self.ready = true
        self.emit('ready')
      }
    }
    if (self._pc.iceConnectionState === 'disconnected') {
      self.emit('close')
    }
  }
  this._pc.onsignalingstatechange = function (event) {
    self.emit('signalingstatechange', self._pc.signalingState, self._pc.readyState)
  }

  this._pc.onicecandidate = function (event) {
    if (event.candidate) {
      self.emit('signal', { candidate: event.candidate })
    }
  }

  this._setupVideo(opts.stream)

  if (opts.initiator) {
    this._setupData({ channel: this._pc.createDataChannel(CHANNEL_NAME) })

    this._pc.onnegotiationneeded = once(function (event) {
      self._pc.createOffer(function (offer) {
        self._pc.setLocalDescription(offer)
        self.emit('signal', offer)
      }, self._onerror.bind(self))
    })

    if (window.mozRTCPeerConnection) {
      // Firefox does not trigger this event automatically
      setTimeout(this._pc.onnegotiationneeded.bind(this._pc), 0)
    }
  } else {
    this._pc.ondatachannel = this._setupData.bind(this)
  }
}

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

  var self = this
  this._channel.onmessage = function (event) {
    console.log('[datachannel] ' + event.data)
    self.emit('message', event.data)
    try {
      var message = JSON.parse(event.data)
    } catch (err) {
      return
    }
    self.emit('message:' + message.type, message.data)
  }
}

Peer.prototype._setupVideo = function (stream) {
  this._pc.addStream(stream)

  var self = this
  this._pc.onaddstream = function (event) {
    var stream = event.stream
    self.emit('stream', stream)
  }
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
        }, self._onerror.bind(self))
      }
    }, self._onerror.bind(self))

  } else if (data.candidate) {
    try {
      this._pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    } catch (err) {
      self.emit('error', new Error('error adding candidate, ' + err.message))
    }

  } else {
    self.emit('error', new Error('signal() called with invalid signal data'))
  }
}

Peer.prototype.send = function (data) {
  if (!this._pc || !this._channel || this._channel.readyState !== 'open') return
  if (typeof data === 'object') {
    this._channel.send(JSON.stringify(data))
  } else {
    this._channel.send(data)
  }
}

Peer.prototype._onerror = function (err) {
  this.emit('error', err)
}
