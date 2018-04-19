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

test('multistream', function (t) {
  if (common.wrtc) {
    t.pass('Skipping test, no MediaStream support on wrtc')
    t.end()
    return
  }
  t.plan(20)

  var peer1 = new Peer({
    config: config,
    initiator: true,
    wrtc: common.wrtc,
    streams: (new Array(10)).fill(null).map(function () { return common.getMediaStream() })
  })
  var peer2 = new Peer({
    config: config,
    wrtc: common.wrtc,
    streams: (new Array(10)).fill(null).map(function () { return common.getMediaStream() })
  })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var receivedIds = {}

  peer1.on('stream', function (stream) {
    t.pass('peer1 got stream')
    if (receivedIds[stream.id]) {
      t.fail('received one unique stream per event')
    } else {
      receivedIds[stream.id] = true
    }
  })
  peer2.on('stream', function (stream) {
    t.pass('peer2 got stream')
    if (receivedIds[stream.id]) {
      t.fail('received one unique stream per event')
    } else {
      receivedIds[stream.id] = true
    }
  })
})

test('incremental multistream', function (t) {
  if (common.wrtc) {
    t.pass('Skipping test, no MediaStream support on wrtc')
    t.end()
    return
  }
  t.plan(12)

  var peer1 = new Peer({
    config: config,
    initiator: true,
    wrtc: common.wrtc,
    streams: []
  })
  var peer2 = new Peer({
    config: config,
    wrtc: common.wrtc,
    streams: []
  })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', function () {
    t.pass('peer1 connected')
    peer1.addStream(common.getMediaStream())
  })
  peer2.on('connect', function () {
    t.pass('peer2 connected')
    peer2.addStream(common.getMediaStream())
  })

  var receivedIds = {}

  var count1 = 0
  peer1.on('stream', function (stream) {
    t.pass('peer1 got stream')
    if (receivedIds[stream.id]) {
      t.fail('received one unique stream per event')
    } else {
      receivedIds[stream.id] = true
    }
    count1++
    if (count1 < 5) {
      peer1.addStream(common.getMediaStream())
    }
  })

  var count2 = 0
  peer2.on('stream', function (stream) {
    t.pass('peer2 got stream')
    if (receivedIds[stream.id]) {
      t.fail('received one unique stream per event')
    } else {
      receivedIds[stream.id] = true
    }
    count2++
    if (count2 < 5) {
      peer2.addStream(common.getMediaStream())
    }
  })
})

test('removeTrack immediately', function (t) {
  if (common.wrtc) {
    t.pass('Skipping test, no MediaStream support on wrtc')
    t.end()
    return
  }
  t.plan(2)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var stream1 = common.getMediaStream()
  var stream2 = common.getMediaStream()

  peer1.addTrack(stream1.getTracks()[0], stream1)
  peer2.addTrack(stream2.getTracks()[0], stream2)

  peer1.removeTrack(stream1.getTracks()[0], stream1)
  peer2.removeTrack(stream2.getTracks()[0], stream2)

  peer1.on('track', function (track, stream) {
    t.fail('peer1 did not get track event')
  })
  peer2.on('track', function (track, stream) {
    t.fail('peer2 did not get track event')
  })

  peer1.on('connect', function () {
    t.pass('peer1 connected')
  })
  peer2.on('connect', function () {
    t.pass('peer2 connected')
  })
})
