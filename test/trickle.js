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

test('disable trickle', function (t) {
  t.plan(8)

  var peer1 = new Peer({ config: config, initiator: true, trickle: false, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, trickle: false, wrtc: common.wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    peer2.signal(data)
  })

  var numSignal2 = 0
  peer2.on('signal', function (data) {
    numSignal2 += 1
    peer1.signal(data)
  })

  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    t.equal(numSignal1, 1, 'only one `signal` event')
    t.equal(numSignal2, 1, 'only one `signal` event')
    t.equal(peer1.initiator, true, 'peer1 is initiator')
    t.equal(peer2.initiator, false, 'peer2 is not initiator')

    peer1.send('sup peer2')
    peer2.on('data', function (data) {
      t.equal(data.toString(), 'sup peer2', 'got correct message')

      peer2.send('sup peer1')
      peer1.on('data', function (data) {
        t.equal(data.toString(), 'sup peer1', 'got correct message')

        peer1.destroy(function () { t.pass('peer1 destroyed') })
        peer2.destroy(function () { t.pass('peer2 destroyed') })
      })
    })
  }
})

test('disable trickle (only initiator)', function (t) {
  t.plan(8)

  var peer1 = new Peer({ config: config, initiator: true, trickle: false, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    peer2.signal(data)
  })

  var numSignal2 = 0
  peer2.on('signal', function (data) {
    numSignal2 += 1
    peer1.signal(data)
  })

  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    t.equal(numSignal1, 1, 'only one `signal` event for initiator')
    t.ok(numSignal2 >= 1, 'at least one `signal` event for receiver')
    t.equal(peer1.initiator, true, 'peer1 is initiator')
    t.equal(peer2.initiator, false, 'peer2 is not initiator')

    peer1.send('sup peer2')
    peer2.on('data', function (data) {
      t.equal(data.toString(), 'sup peer2', 'got correct message')

      peer2.send('sup peer1')
      peer1.on('data', function (data) {
        t.equal(data.toString(), 'sup peer1', 'got correct message')

        peer1.destroy(function () { t.pass('peer1 destroyed') })
        peer2.destroy(function () { t.pass('peer2 destroyed') })
      })
    })
  }
})

test('disable trickle (only receiver)', function (t) {
  t.plan(8)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, trickle: false, wrtc: common.wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    peer2.signal(data)
  })

  var numSignal2 = 0
  peer2.on('signal', function (data) {
    numSignal2 += 1
    peer1.signal(data)
  })

  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    t.ok(numSignal1 >= 1, 'at least one `signal` event for initiator')
    t.equal(numSignal2, 1, 'only one `signal` event for receiver')
    t.equal(peer1.initiator, true, 'peer1 is initiator')
    t.equal(peer2.initiator, false, 'peer2 is not initiator')

    peer1.send('sup peer2')
    peer2.on('data', function (data) {
      t.equal(data.toString(), 'sup peer2', 'got correct message')

      peer2.send('sup peer1')
      peer1.on('data', function (data) {
        t.equal(data.toString(), 'sup peer1', 'got correct message')

        peer1.destroy(function () { t.pass('peer1 destroyed') })
        peer2.destroy(function () { t.pass('peer2 destroyed') })
      })
    })
  }
})
