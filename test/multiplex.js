// multiplexing tests adapted from https://github.com/maxogden/multiplex/blob/master/test.js

var test = require('tape')
var common = require('./common')
var concat = require('concat-stream')
var through = require('through2')
var Peer = require('../')
var Buffer = require('safe-buffer').Buffer

var config
test('get config', function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err)
    config = _config
    t.end()
  })
})

test('one way piping work with 2 sub-streams', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var stream1 = peer1.createDataChannel()
  var stream2 = peer1.createDataChannel()

  peer2.on('datachannel', function onStream (stream) {
    stream.pipe(collect())
  })

  stream1.write(Buffer.from('hello'))
  stream2.write(Buffer.from('world'))
  stream1.end()
  stream2.end()

  var pending = 2
  var results = []

  function collect () {
    return concat(function (data) {
      results.push(data.toString())
      if (--pending === 0) {
        results.sort()
        t.equal(results[0].toString(), 'hello')
        t.equal(results[1].toString(), 'world')
        t.end()

        peer1.destroy()
        peer2.destroy()
      }
    })
  }
})

test('two way piping works with 2 sub-streams', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer2.on('datachannel', function onStream (stream) {
    var uppercaser = through(function (chunk, _, done) {
      this.push(Buffer.from(chunk.toString().toUpperCase()))
      this.end()
      done()
    })
    stream.pipe(uppercaser).pipe(stream)
  })

  var stream1 = peer1.createDataChannel()
  var stream2 = peer1.createDataChannel()

  stream1.pipe(collect())
  stream2.pipe(collect())

  stream1.write(Buffer.from('hello'))
  stream2.write(Buffer.from('world'))

  var pending = 2
  var results = []

  function collect () {
    return concat(function (data) {
      results.push(data.toString())
      if (--pending === 0) {
        results.sort()
        t.equal(results[0].toString(), 'HELLO')
        t.equal(results[1].toString(), 'WORLD')
        t.end()

        peer1.destroy()
        peer2.destroy()
      }
    })
  }
})

test('channelName should be exposed as channel.channelName', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var stream1 = peer1.createDataChannel('5')
  t.equal(stream1.channelName, '5')

  peer2.on('datachannel', function onStream (stream, channelName) {
    t.equal(stream.channelName, '5')
    t.equal(channelName, '5')
    t.end()

    peer1.destroy()
    peer2.destroy()
  })

  stream1.write(Buffer.from('hello'))
  stream1.end()
})

test('channelName can be a long string', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var stream1 = peer1.createDataChannel('hello-yes-this-is-dog')
  t.equal(stream1.channelName, 'hello-yes-this-is-dog')

  peer2.on('datachannel', function onStream (stream, id) {
    t.equal(stream.channelName, 'hello-yes-this-is-dog')
    t.equal(id, 'hello-yes-this-is-dog')
    t.end()

    peer1.destroy()
    peer2.destroy()
  })

  stream1.write(Buffer.from('hello'))
  stream1.end()
})

test('destroy', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var stream1 = peer1.createDataChannel('1')

  // we listen on the local stream instead of the remote stream here:
  // there's no way to propagate error messages across datachannels like multiplex does
  stream1.on('error', function (err) {
    t.equal(err.message, '0 had an error')
    t.end()

    peer1.destroy()
    peer2.destroy()
  })

  stream1.write(Buffer.from('hello'))
  stream1.destroy(new Error('0 had an error'))
})

test('testing invalid data error', function (t) {
  t.pass('skipping test, simple-peer does not have similar data restrictions')
  t.end()
})

test('overflow', function (t) {
  t.pass('skipping test, simple-peer does not have similar data restrictions')
  t.end()
})

test('2 buffers packed into 1 chunk', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer2.on('datachannel', function onStream (b) {
    b.pipe(concat(function (body) {
      t.equal(body.toString('utf8'), 'abc\n123\n')
      t.end()

      peer1.destroy()
      peer2.destroy()
    }))
  })
  var a = peer1.createDataChannel('1337')
  a.write('abc\n')
  a.write('123\n')
  a.end()
})

test('chunks', function (t) {
  t.pass('skipping test, we cannot access the multiplexed SRTP stream to chunk it')
  t.end()
})

test('prefinish + corking', function (t) {
  t.pass('skipping test, simple-peer does not support corking or prefinish event')
  t.end()
})

test('quick message', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('datachannel', function onStream (stream) {
    stream.write('hello world')
  })

  setTimeout(function () {
    var stream = peer2.createDataChannel()
    stream.on('data', function (data) {
      t.same(data, Buffer.from('hello world'))
      t.end()

      peer1.destroy()
      peer2.destroy()
    })
  }, 100)
})

test('if onstream is not passed, stream is emitted', function (t) {
  t.pass('skipping test, simple-peer does not use same onStream callback API')
  t.end()
})
