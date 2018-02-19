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

test('data send/receive string {objectMode: true}', function (t) {
  t.plan(6)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc, objectMode: true })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc, objectMode: true })
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

    peer1.send('this is a string')
    peer2.on('data', function (data) {
      t.equal(typeof data, 'string', 'data is a string')
      t.equal(data, 'this is a string', 'got correct message')

      peer2.send('this is another string')
      peer1.on('data', function (data) {
        t.equal(typeof data, 'string', 'data is a string')
        t.equal(data, 'this is another string', 'got correct message')

        peer1.on('close', function () { t.pass('peer1 destroyed') })
        peer1.destroy()
        peer2.on('close', function () { t.pass('peer2 destroyed') })
        peer2.destroy()
      })
    })
  }
})

test('data send/receive Buffer {objectMode: true}', function (t) {
  t.plan(6)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc, objectMode: true })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc, objectMode: true })
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

    peer1.send(Buffer.from('this is a Buffer'))
    peer2.on('data', function (data) {
      t.ok(Buffer.isBuffer(data), 'data is a Buffer')
      t.deepEqual(data, Buffer.from('this is a Buffer'), 'got correct message')

      peer2.send(Buffer.from('this is another Buffer'))
      peer1.on('data', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is a Buffer')
        t.deepEqual(data, Buffer.from('this is another Buffer'), 'got correct message')

        peer1.on('close', function () { t.pass('peer1 destroyed') })
        peer1.destroy()
        peer2.on('close', function () { t.pass('peer2 destroyed') })
        peer2.destroy()
      })
    })
  }
})

test('data send/receive Uint8Array {objectMode: true}', function (t) {
  t.plan(6)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc, objectMode: true })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc, objectMode: true })
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
      // binary types always get converted to Buffer
      // See: https://github.com/feross/simple-peer/issues/138#issuecomment-278240571
      t.ok(Buffer.isBuffer(data), 'data is a Buffer')
      t.deepEqual(data, Buffer.from([0, 1, 2]), 'got correct message')

      peer2.send(new Uint8Array([1, 2, 3]))
      peer1.on('data', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is a Buffer')
        t.deepEqual(data, Buffer.from([1, 2, 3]), 'got correct message')

        peer1.on('close', function () { t.pass('peer1 destroyed') })
        peer1.destroy()
        peer2.on('close', function () { t.pass('peer2 destroyed') })
        peer2.destroy()
      })
    })
  }
})

test('data send/receive ArrayBuffer {objectMode: true}', function (t) {
  t.plan(6)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc, objectMode: true })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc, objectMode: true })
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
      t.ok(Buffer.isBuffer(data), 'data is a Buffer')
      t.deepEqual(data, Buffer.from([0, 1, 2]), 'got correct message')

      peer2.send(new Uint8Array([1, 2, 3]).buffer)
      peer1.on('data', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is a Buffer')
        t.deepEqual(data, Buffer.from([1, 2, 3]), 'got correct message')

        peer1.on('close', function () { t.pass('peer1 destroyed') })
        peer1.destroy()
        peer2.on('close', function () { t.pass('peer2 destroyed') })
        peer2.destroy()
      })
    })
  }
})
