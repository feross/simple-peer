var common = require('../common')
var Peer = require('../..')
var test = require('twintap/tape')

var config
test('get config', function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err)
    config = _config
    t.end()
  })
})

test('data send/receive Buffer', function (t) {
  t.plan(3)

  var peer = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })
  peer.on('signal', function (data) {
    t.send('signal', data)
  })
  t.receive('signal', function (data) {
    peer.signal(data)
  })
  peer.on('connect', tryTest)

  async function tryTest () {
    await t.barrier('connected')

    peer.send(Buffer.from([0, 1, 2]))
    peer.on('data', async function (data) {
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.deepEqual(data, Buffer.from([0, 1, 2]), 'got correct message')

      await t.barrier('readyToClose')
      peer.on('close', function () { t.pass('peer destroyed') })
      peer.destroy()
    })
  }
})

test('data send/receive Uint8Array', function (t) {
  t.plan(3)

  var peer = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })
  peer.on('signal', function (data) {
    t.send('signal', data)
  })
  t.receive('signal', function (data) {
    peer.signal(data)
  })
  peer.on('connect', tryTest)

  async function tryTest () {
    await t.barrier('connected')

    peer.send(new Uint8Array([0, 1, 2]))
    peer.on('data', async function (data) {
      // binary types always get converted to Buffer
      // See: https://github.com/feross/simple-peer/issues/138#issuecomment-278240571
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.deepEqual(data, Buffer.from([0, 1, 2]), 'got correct message')

      await t.barrier('readyToClose')
      peer.on('close', function () { t.pass('peer destroyed') })
      peer.destroy()
    })
  }
})

test('data send/receive ArrayBuffer', function (t) {
  t.plan(3)

  var peer = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })
  peer.on('signal', function (data) {
    t.send('signal', data)
  })
  t.receive('signal', function (data) {
    peer.signal(data)
  })
  peer.on('connect', tryTest)

  async function tryTest () {
    await t.barrier('connected')

    peer.send(new Uint8Array([0, 1, 2]).buffer)
    peer.on('data', async function (data) {
      // binary types always get converted to Buffer
      // See: https://github.com/feross/simple-peer/issues/138#issuecomment-278240571
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.deepEqual(data, Buffer.from([0, 1, 2]), 'got correct message')

      await t.barrier('readyToClose')
      peer.on('close', function () { t.pass('peer destroyed') })
      peer.destroy()
    })
  }
})
