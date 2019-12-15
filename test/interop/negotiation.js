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

test('single negotiation', function (t) {
  t.plan(5)

  var peer1 = new Peer({ config: config, initiator: !!t.instance, stream: common.getMediaStream(), wrtc: common.wrtc })

  peer1.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', function () {
    t.pass('peer1 connected')
  })
  peer1.on('stream', function (stream) {
    t.pass('peer1 got stream')
  })

  var trackCount1 = 0
  peer1.on('track', function (track) {
    t.pass('peer1 got track')
    trackCount1++
    if (trackCount1 >= 2) {
      t.pass('got correct number of tracks')
    }
  })

  t.on('end', async () => {
    await t.barrier('readyToClose')
    peer1.destroy()
  })
})

test('manual renegotiation', function (t) {
  t.plan(3)

  var peer1 = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })

  peer1.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('negotiate', function () {
    t.pass('peer1 negotiated')
  })
  peer1.on('connect', async function () {
    t.pass('peer connected')
    await t.barrier('connected')
    if (peer1.initiator) peer1.negotiate()
  })

  t.on('end', async () => {
    await t.barrier('readyToClose')
    peer1.destroy()
  })
})

test('negotiated channels', function (t) {
  t.plan(2)

  var peer1 = new Peer({
    config: config,
    initiator: !!t.instance,
    wrtc: common.wrtc,
    channelConfig: {
      id: 1,
      negotiated: true
    }
  })

  peer1.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', function () {
    t.pass('peer1 connect')
  })
  peer1.write('testData')
  peer1.on('data', async (data) => {
    t.equal(data.toString(), 'testData', 'got correct message')
  })

  t.on('end', async () => {
    await t.barrier('readyToClose')
    peer1.destroy()
  })
})
