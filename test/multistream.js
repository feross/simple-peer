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
    renegotiation: true,
    wrtc: common.wrtc,
    streams: (new Array(10)).fill(null).map(function () { return common.getMediaStream() })
  })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('stream', function () {
    t.pass('peer1 got stream')
  })
  peer2.on('stream', function () {
    t.pass('peer2 got stream')
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
    peer1.renegotiate()
  })
  peer2.on('connect', function () {
    t.pass('peer2 connected')
    peer2.addStream(common.getMediaStream())
    peer2.renegotiate()
  })

  var count1 = 0
  peer1.on('stream', function () {
    t.pass('peer1 got stream')
    count1++
    if (count1 < 5) {
      peer1.addStream(common.getMediaStream())
      peer1.renegotiate()
    }
  })

  var count2 = 0
  peer2.on('stream', function () {
    t.pass('peer2 got stream')
    count2++
    if (count2 < 5) {
      peer2.addStream(common.getMediaStream())
      peer2.renegotiate()
    }
  })
})