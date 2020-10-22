/*! simple-peer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
var debug = require('debug')('simple-peer')
var stream = require('readable-stream')
var errCode = require('err-code')

var MAX_BUFFERED_AMOUNT = 64 * 1024
var CHANNEL_CLOSING_TIMEOUT = 5 * 1000
var CHANNEL_CLOSE_DELAY = 3 * 1000

function closeChannel (channel) {
  try {
    channel.close()
  } catch (err) { }
}

class DataChannel extends stream.Duplex {
  constructor (opts = {}) {
    opts = Object.assign({
      allowHalfOpen: false
    }, opts)

    super(opts)

    this.closed = false
    this._chunk = null
    this._cb = null
    this._interval = null
    this._channel = null
    this._fresh = true
    this._open = false

    this.channelName = opts.channelName || null
    this.channelConfig = opts.channelConfig || DataChannel.channelConfig
    this.channelNegotiated = this.channelConfig.negotiated

    // HACK: Chrome will sometimes get stuck in readyState "closing", let's check for this condition
    var isClosing = false
    this._closingInterval = setInterval(() => { // No "onclosing" event
      if (this._channel && this._channel.readyState === 'closing') {
        if (isClosing) this._onChannelClose() // Equivalent to onclose firing.
        isClosing = true
      } else {
        isClosing = false
      }
    }, CHANNEL_CLOSING_TIMEOUT)
  }

  _setDataChannel (channel) {
    this._channel = channel
    this._channel.binaryType = 'arraybuffer'

    if (typeof this._channel.bufferedAmountLowThreshold === 'number') {
      this._channel.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT
    }

    this.channelName = this._channel.label.split('@')[0]

    this._channel.onmessage = event => {
      this._onChannelMessage(event)
    }
    this._channel.onbufferedamountlow = () => {
      this._onChannelBufferedAmountLow()
    }
    this._channel.onopen = () => {
      this._onChannelOpen()
    }
    this._channel.onclose = () => {
      this._onChannelClose()
    }
    this._channel.onerror = err => {
      this.close(errCode(err, 'ERR_DATA_CHANNEL'))
    }

    this._onFinishBound = () => {
      this._onFinish()
    }
    this.once('finish', this._onFinishBound)
  }

  _read () { }

  _write (chunk, encoding, cb) {
    if (this.closed) return cb(errCode(new Error('cannot write after channel is closed'), 'ERR_DATA_CHANNEL'))

    if (this._channel && this._channel.readyState === 'open') {
      try {
        this.send(chunk)
      } catch (err) {
        this.close(errCode(err, 'ERR_DATA_CHANNEL'))
      }
      if (this._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        this._debug('start backpressure: bufferedAmount %d', this._channel.bufferedAmount)
        this._cb = cb
      } else {
        cb(null)
      }
    } else {
      this._debug('write before connect')
      this._chunk = chunk
      this._cb = cb
    }
  }

  // When stream finishes writing, close socket. Half open connections are not
  // supported.
  _onFinish () {
    if (this.closed) return

    // Wait a bit before closing so the socket flushes.
    // TODO: is there a more reliable way to accomplish this?
    const closeSoon = () => {
      setTimeout(() => this.close(), 1000)
    }

    if (this._open) {
      closeSoon()
    } else {
      this.once('open', closeSoon)
    }
  }

  _onInterval () {
    if (!this._cb || !this._channel || this._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      return
    }
    this._onChannelBufferedAmountLow()
  }

  _onChannelMessage (event) {
    if (this.closed) return
    var data = event.data
    if (data instanceof ArrayBuffer) data = Buffer.from(data)
    this.push(data)
  }

  _onChannelBufferedAmountLow () {
    if (this.closed || !this._cb) return
    this._debug('ending backpressure: bufferedAmount %d', this._channel.bufferedAmount)
    var cb = this._cb
    this._cb = null
    cb(null)
  }

  _onChannelOpen () {
    this._debug('on channel open', this.channelName)
    this._open = true
    this.emit('open')
    this._sendChunk()

    setTimeout(() => {
      this._fresh = false
    }, CHANNEL_CLOSE_DELAY)
  }

  _onChannelClose () {
    this._debug('on channel close')
    return this.close()
  }

  _sendChunk () { // called when peer connects or this._channel set
    if (this.closed) return

    if (this._chunk) {
      try {
        this.send(this._chunk)
      } catch (err) {
        return this.close(errCode(err, 'ERR_DATA_CHANNEL'))
      }
      this._chunk = null
      this._debug('sent chunk from "write before connect"')

      var cb = this._cb
      this._cb = null
      cb(null)
    }

    // If `bufferedAmountLowThreshold` and 'onbufferedamountlow' are unsupported,
    // fallback to using setInterval to implement backpressure.
    if (!this._interval && typeof this._channel.bufferedAmountLowThreshold !== 'number') {
      this._interval = setInterval(() => { this._onInterval() }, 150)
      if (this._interval.unref) this._interval.unref()
    }
  }

  get bufferSize () {
    return (this._channel && this._channel.bufferedAmount) || 0
  }

  /**
   * Send text/binary data to the remote peer.
   * @param {ArrayBufferView|ArrayBuffer|Buffer|string|Blob} chunk
   */
  send (chunk) {
    this._channel.send(chunk)
  }

  destroy (err) {
    DataChannel.prototype._destroy.call(this, err, () => { })
  }

  _destroy (err, cb) {
    this.close(err)
    cb()
  }

  close (err) {
    if (this.closed) return

    this._debug('close datachannel (error: %s)', err && (err.message || err))

    if (this._channel) {
      if (this._fresh) { // HACK: Safari sometimes cannot close channels immediately after opening them
        setTimeout(closeChannel.bind(this, this._channel), CHANNEL_CLOSE_DELAY)
      } else {
        closeChannel(this._channel)
      }

      this._channel.onmessage = null
      this._channel.onopen = null
      this._channel.onclose = null
      this._channel.onerror = null
      this._channel = null
    }

    this.readable = this.writable = false

    if (!this._readableState.ended) this.push(null)
    if (!this._writableState.finished) this.end()

    this.closed = true
    this._open = false

    clearInterval(this._closingInterval)
    this._closingInterval = null

    clearInterval(this._interval)
    this._interval = null
    this._chunk = null
    this._cb = null

    this.channelName = null

    if (this._onFinishBound) this.removeListener('finish', this._onFinishBound)
    this._onFinishBound = null

    if (err) this.emit('error', err)
    this.emit('close')
  }

  _debug () {
    var args = [].slice.call(arguments)
    args[0] = '[' + this._id + '] ' + args[0]
    debug.apply(null, args)
  }
}

DataChannel.channelConfig = {}

module.exports = DataChannel
