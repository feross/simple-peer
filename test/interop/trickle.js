var common = require('../common')
var Peer = require('../../')
var test = require('twintap/tape')

var config
test('get config', function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err)
    config = _config
    t.end()
  })
})

test('disable trickle', function (t) {
  t.plan(3)

  var peer1 = new Peer({ config: config, initiator: !!t.instance, trickle: false, wrtc: common.wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    t.send('signal', data)
  })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })
  peer1.on('connect', tryTest)

  async function tryTest () {
    await t.barrier('connected')

    t.equal(numSignal1, 1, 'only one `signal` event')
    t.equal(peer1.initiator, !!t.instance, 'initiator is correct')

    peer1.on('close', function () { t.pass('peer1 destroyed') })
    peer1.destroy()
  }
})

test('disable trickle (only initiator)', function (t) {
  t.plan(3)

  var peer1 = new Peer({ config: config, initiator: !!t.instance, trickle: !t.instance, wrtc: common.wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    t.send('signal', data)
  })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', tryTest)

  async function tryTest () {
    await t.barrier('connected')

    if (peer1.initiator) {
      t.equal(numSignal1, 1, 'only one `signal` event for initiator')
    } else {
      t.pass('non-initiator can send multiple signals')
    }
    t.equal(peer1.initiator, !!t.instance, 'initiator is correct')

    peer1.on('close', function () { t.pass('peer1 destroyed') })
    peer1.destroy()
  }
})

test('disable trickle (only non-initiator)', function (t) {
  t.plan(3)

  var peer1 = new Peer({ config: config, initiator: !!t.instance, trickle: !!t.instance, wrtc: common.wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    t.send('signal', data)
  })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', tryTest)

  async function tryTest () {
    await t.barrier('connected')

    if (!peer1.initiator) {
      t.equal(numSignal1, 1, 'only one `signal` event form non-initiator')
    } else {
      t.pass('initiator can send multiple signal events')
    }
    t.equal(peer1.initiator, !!t.instance, 'initiator is correct')

    peer1.on('close', function () { t.pass('peer1 destroyed') })
    peer1.destroy()
  }
})
