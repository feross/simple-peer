module.exports = DataChannel

var debug = require('debug')('simple-peer')
var inherits = require('inherits')
var stream = require('readable-stream')

var MAX_BUFFERED_AMOUNT = 64 * 1024

inherits(DataChannel, stream.Duplex)

function DataChannel (opts) {
  var self = this

  opts = Object.assign({
    allowHalfOpen: false
  }, opts)

  stream.Duplex.call(self, opts)

  self._chunk = null
  self._cb = null
  self._interval = null
  self._channel = null

  self.channelName = null
}

DataChannel.prototype._setDataChannel = function (channel) {
  var self = this

  self._channel = channel
  self._channel.binaryType = 'arraybuffer'

  if (typeof self._channel.bufferedAmountLowThreshold === 'number') {
    self._channel.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT
  }

  self.channelName = self._channel.label

  self._channel.onmessage = function (event) {
    self._onChannelMessage(event)
  }
  self._channel.onbufferedamountlow = function () {
    self._onChannelBufferedAmountLow()
  }
  self._channel.onopen = function () {
    self._onChannelOpen()
  }
  self._channel.onclose = function () {
    self._onChannelClose()
  }
  self._channel.onerror = function (err) {
    self.destroy(makeError(err, 'ERR_DATA_CHANNEL'))
  }

  self._onFinishBound = function () {
    self._onFinish()
  }
  self.once('finish', self._onFinishBound)
}

DataChannel.prototype._read = function () {}

DataChannel.prototype._write = function (chunk, encoding, cb) {
  var self = this
  if (self.destroyed) return cb(makeError('cannot write after channel is destroyed', 'ERR_DATA_CHANNEL'))

  if (self._channel && self._channel.readyState === 'open') {
    try {
      self.send(chunk)
    } catch (err) {
      return self.destroy(makeError(err, 'ERR_DATA_CHANNEL'))
    }
    if (self._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
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

// When stream finishes writing, close socket. Half open connections are not
// supported.
DataChannel.prototype._onFinish = function () {
  var self = this
  if (self.destroyed) return

  if (!self._channel || self._channel.readyState === 'open') {
    destroySoon()
  } else {
    self.once('connect', destroySoon)
  }

  // Wait a bit before destroying so the socket flushes.
  // TODO: is there a more reliable way to accomplish this?
  function destroySoon () {
    setTimeout(function () {
      self.destroy()
    }, 1000)
  }
}

DataChannel.prototype._onInterval = function () {
  var self = this
  if (!self._cb || !self._channel || self._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    return
  }
  self._onChannelBufferedAmountLow()
}

DataChannel.prototype._onChannelMessage = function (event) {
  var self = this
  if (self.destroyed) return
  var data = event.data
  if (data instanceof ArrayBuffer) data = Buffer.from(data)
  self.push(data)
}

DataChannel.prototype._onChannelBufferedAmountLow = function () {
  var self = this
  if (self.destroyed || !self._cb) return
  self._debug('ending backpressure: bufferedAmount %d', self._channel.bufferedAmount)
  var cb = self._cb
  self._cb = null
  cb(null)
}

DataChannel.prototype._onChannelOpen = function () {
  var self = this
  self._debug('on channel open', self.channelName)
  self.emit('open')
  self._sendChunk()
}

DataChannel.prototype._onChannelClose = function () {
  var self = this
  self._debug('on channel close')
  self.destroy()
}

DataChannel.prototype._sendChunk = function () { // called when peer connects or self._channel set
  var self = this
  if (self.destroyed) return

  if (self._chunk) {
    try {
      self.send(self._chunk)
    } catch (err) {
      return self.destroy(makeError(err, 'ERR_DATA_CHANNEL'))
    }
    self._chunk = null
    self._debug('sent chunk from "write before connect"')

    var cb = self._cb
    self._cb = null
    cb(null)
  }

  // If `bufferedAmountLowThreshold` and 'onbufferedamountlow' are unsupported,
  // fallback to using setInterval to implement backpressure.
  if (!self._interval && typeof self._channel.bufferedAmountLowThreshold !== 'number') {
    self._interval = setInterval(function () { self._onInterval() }, 150)
    if (self._interval.unref) self._interval.unref()
  }
}

Object.defineProperty(DataChannel.prototype, 'bufferSize', {
  get: function () {
    var self = this
    return (self._channel && self._channel.bufferedAmount) || 0
  }
})

/**
 * Send text/binary data to the remote peer.
 * @param {ArrayBufferView|ArrayBuffer|Buffer|string|Blob} chunk
 */
DataChannel.prototype.send = function (chunk) {
  var self = this
  if (!self._channel) {
    if (self.destroyed) return self.destroy(makeError('cannot send after channel is destroyed', 'ERR_DATA_CHANNEL'))
    else return self.destroy(makeError('cannot send before channel is created - use write() to buffer', 'ERR_DATA_CHANNEL'))
  }
  self._channel.send(chunk)
}

// TODO: Delete this method once readable-stream is updated to contain a default
// implementation of destroy() that automatically calls _destroy()
// See: https://github.com/nodejs/readable-stream/issues/283
DataChannel.prototype.destroy = function (err) {
  var self = this
  self._destroy(err, function () {})
}

DataChannel.prototype._destroy = function (err, cb) {
  var self = this
  if (self.destroyed) return

  if (self._channel) {
    try {
      self._channel.close()
    } catch (err) {}

    self._channel.onmessage = null
    self._channel.onopen = null
    self._channel.onclose = null
    self._channel.onerror = null
    self._channel = null
  }

  self.readable = self.writable = false

  if (!self._readableState.ended) self.push(null)
  if (!self._writableState.finished) self.end()

  self.destroyed = true

  clearInterval(self._interval)
  self._interval = null
  self._chunk = null
  self._cb = null

  self.channelName = null

  if (self._onFinishBound) self.removeListener('finish', self._onFinishBound)
  self._onFinishBound = null

  if (err) self.emit('error', err)
  self.emit('close')
  cb()
}

DataChannel.prototype._debug = function () {
  var self = this
  var args = [].slice.call(arguments)
  args[0] = '[' + self._id + '] ' + args[0]
  debug.apply(null, args)
}

function makeError (message, code) {
  var err = new Error(message)
  err.code = code
  return err
}
