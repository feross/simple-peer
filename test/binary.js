var common = require('./common')
var Peer = require('../')
var test = require('tape')

var config
test('get config', function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err)
    config = _config
    t.end()
  })
})

test('data send/receive Uint8Array', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    peer1.send(new Uint8Array([0, 1, 2]))
    peer2.on('data', function (data) {
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.deepEqual(data, new Buffer([0, 1, 2]), 'got correct message')

      peer2.send(new Uint8Array([0, 2, 4]))
      peer1.on('data', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is Buffer')
        t.deepEqual(data, new Buffer([0, 2, 4]), 'got correct message')

        peer1.destroy(tryDone)
        peer2.destroy(tryDone)

        function tryDone () {
          if (!peer1.connected && !peer2.connected) {
            t.pass('both peers closed')
            t.end()
          }
        }
      })
    })
  }
})

test('data send/receive Buffer', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || peer2.connected) return

    peer1.send(new Buffer([0, 1, 2]))
    peer2.on('data', function (data) {
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.deepEqual(data, new Buffer([0, 1, 2]), 'got correct message')

      peer2.send(new Buffer([0, 2, 4]))
      peer1.on('data', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is Buffer')
        t.deepEqual(data, new Buffer([0, 2, 4]), 'got correct message')

        peer1.destroy(tryDone)
        peer2.destroy(tryDone)

        function tryDone () {
          if (!peer1.connected && !peer2.connected) {
            t.pass('both peers closed')
            t.end()
          }
        }
      })
    })
  }
})

test('data send/receive ArrayBuffer', function (t) {
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    peer1.send(new Uint8Array([0, 1, 2]).buffer)
    peer2.on('data', function (data) {
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.deepEqual(data, new Buffer([0, 1, 2]), 'got correct message')

      peer2.send(new Uint8Array([0, 2, 4]).buffer)
      peer1.on('data', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is Buffer')
        t.deepEqual(data, new Buffer([0, 2, 4]), 'got correct message')

        peer1.destroy(tryDone)
        peer2.destroy(tryDone)

        function tryDone () {
          if (!peer1.connected && !peer2.connected) {
            t.pass('both peers closed')
            t.end()
          }
        }
      })
    })
  }
})
