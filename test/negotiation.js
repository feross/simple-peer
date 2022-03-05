const common = require('./common')
const Peer = require('../')
const test = require('tape')

let config
test('get config', function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err)
    config = _config
    t.end()
  })
})

test('single negotiation', function (t) {
  t.plan(10)

  const peer1 = new Peer({ config, initiator: true, stream: common.getMediaStream(), wrtc: common.wrtc })
  const peer2 = new Peer({ config, stream: common.getMediaStream(), wrtc: common.wrtc })

  peer1.on('signal', function (data) {
    if (data.renegotiate) t.fail('got unexpected request to renegotiate')
    if (!peer2.destroyed) peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    if (data.renegotiate) t.fail('got unexpected request to renegotiate')
    if (!peer1.destroyed) peer1.signal(data)
  })

  peer1.on('connect', function () {
    t.pass('peer1 connected')
  })
  peer2.on('connect', function () {
    t.pass('peer2 connected')
  })

  peer1.on('stream', function (stream) {
    t.pass('peer1 got stream')
  })
  peer2.on('stream', function (stream) {
    t.pass('peer2 got stream')
  })

  let trackCount1 = 0
  peer1.on('track', function (track) {
    t.pass('peer1 got track')
    trackCount1++
    if (trackCount1 >= 2) {
      t.pass('got correct number of tracks')
    }
  })
  let trackCount2 = 0
  peer2.on('track', function (track) {
    t.pass('peer2 got track')
    trackCount2++
    if (trackCount2 >= 2) {
      t.pass('got correct number of tracks')
    }
  })
})

test('manual renegotiation', function (t) {
  t.plan(2)

  const peer1 = new Peer({ config, initiator: true, wrtc: common.wrtc })
  const peer2 = new Peer({ config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', function () {
    peer1.negotiate()

    peer1.on('negotiated', function () {
      t.pass('peer1 negotiated')
    })
    peer2.on('negotiated', function () {
      t.pass('peer2 negotiated')
    })
  })
})

test('repeated manual renegotiation', function (t) {
  t.plan(6)

  const peer1 = new Peer({ config, initiator: true, wrtc: common.wrtc })
  const peer2 = new Peer({ config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer1.once('connect', function () {
    peer1.negotiate()
  })
  peer1.once('negotiated', function () {
    t.pass('peer1 negotiated')
    peer1.negotiate()
    peer1.once('negotiated', function () {
      t.pass('peer1 negotiated again')
      peer1.negotiate()
      peer1.once('negotiated', function () {
        t.pass('peer1 negotiated again')
      })
    })
  })
  peer2.once('negotiated', function () {
    t.pass('peer2 negotiated')
    peer2.negotiate()
    peer2.once('negotiated', function () {
      t.pass('peer2 negotiated again')
      peer1.negotiate()
      peer1.once('negotiated', function () {
        t.pass('peer1 negotiated again')
      })
    })
  })
})

test('renegotiation after addStream', function (t) {
  if (common.isBrowser('ios')) {
    t.pass('Skip on iOS which does not support this reliably')
    t.end()
    return
  }
  t.plan(4)

  const peer1 = new Peer({ config, initiator: true, wrtc: common.wrtc })
  const peer2 = new Peer({ config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', function () {
    t.pass('peer1 connect')
    peer1.addStream(common.getMediaStream())
  })
  peer2.on('connect', function () {
    t.pass('peer2 connect')
    peer2.addStream(common.getMediaStream())
  })
  peer1.on('stream', function () {
    t.pass('peer1 got stream')
  })
  peer2.on('stream', function () {
    t.pass('peer2 got stream')
  })
})

test('add stream on non-initiator only', function (t) {
  t.plan(3)

  const peer1 = new Peer({
    config,
    initiator: true,
    wrtc: common.wrtc
  })
  const peer2 = new Peer({
    config,
    wrtc: common.wrtc,
    stream: common.getMediaStream()
  })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', function () {
    t.pass('peer1 connect')
  })
  peer2.on('connect', function () {
    t.pass('peer2 connect')
  })
  peer1.on('stream', function () {
    t.pass('peer1 got stream')
  })
})

test('negotiated channels', function (t) {
  t.plan(2)

  const peer1 = new Peer({
    config,
    initiator: true,
    wrtc: common.wrtc,
    channelConfig: {
      id: 1,
      negotiated: true
    }
  })
  const peer2 = new Peer({
    config,
    wrtc: common.wrtc,
    channelConfig: {
      id: 1,
      negotiated: true
    }
  })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', function () {
    t.pass('peer1 connect')
  })
  peer2.on('connect', function () {
    t.pass('peer2 connect')
  })
})

test('renegotiation after restart', function (t) {
  t.plan(4)

  const peer1 = new Peer({ config, initiator: true, wrtc: common.wrtc })
  const peer2 = new Peer({ config, wrtc: common.wrtc })

  peer1.on('signal', function (data) {
    if (!peer2.destroyed) peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    if (!peer1.destroyed) peer1.signal(data)
  })

  peer1.on('connect', function () {
    peer1.addStream(common.getMediaStream())
  })
  peer2.on('connect', function () {
    peer2.addStream(common.getMediaStream())
  })

  peer1.on('stream', function () {
    t.pass('got peer1 stream')
  })

  peer2.on('stream', function () {
    t.pass('got peer2 stream')
    peer1.restart()
  })

  let tracks = 1
  peer2.on('track', function () {
    t.pass(`got peer2 track ${tracks++}`)
  })
})
