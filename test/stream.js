var concat = require('concat-stream')
var inherits = require('inherits')
var Peer = require('../')
var stream = require('stream')
var test = require('tape')

inherits(StringStream, stream.Readable)

function StringStream (str) {
  stream.Readable.call(this)
  this._str = str
}

StringStream.prototype._read = function () {
  if (!this.ended) {
    var self = this
    process.nextTick(function () {
      self.push(new Buffer(self._str))
      self.push(null)
    })
    this.ended = true
  }
}

test('data send/receive as stream', function (t) {
  var peer1 = new Peer({ initiator: true })
  var peer2 = new Peer()
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('ready', tryTest)
  peer2.on('ready', tryTest)

  function tryTest () {
    if (peer1.ready && peer2.ready) {
      var stream1 = peer1.getDataStream()
      var stream2 = peer2.getDataStream()

      new StringStream('abc').pipe(stream1)
        .on('finish', function () {
          stream1.destroy() // will trigger 'end' on stream2
        })

      stream2.pipe(concat(function (data) {
        t.equal(data.toString(), 'abc', 'got correct message')
        t.ok(stream1._readableState.ended)
        t.ok(stream2._readableState.ended)
        t.ok(stream1._writableState.finished)
        t.ok(stream2._writableState.finished)
        t.end()
      }))
    }
  }
})
