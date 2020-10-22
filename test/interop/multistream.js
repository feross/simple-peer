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

test('multistream', function (t) {
  t.plan(10)

  const peer = new Peer({
    config: config,
    initiator: !!t.instance,
    wrtc: common.wrtc,
    streams: (new Array(10)).fill(null).map(function () { return common.getMediaStream() })
  })

  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer.destroyed) peer.signal(data) })

  const receivedIds = {}
  peer.on('stream', function (stream) {
    t.pass('peer1 got stream')
    if (receivedIds[stream.id]) {
      t.fail('received one unique stream per event')
    } else {
      receivedIds[stream.id] = true
    }
  })

  t.on('end', async () => {
    await t.barrier('ended')
    peer.destroy()
  })
})

test('multistream (track event)', function (t) {
  t.plan(10)

  const peer = new Peer({
    config: config,
    initiator: !!t.instance,
    wrtc: common.wrtc,
    streams: (new Array(5)).fill(null).map(function () { return common.getMediaStream() })
  })

  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer.destroyed) peer.signal(data) })

  const receivedIds = {}
  peer.on('track', function (track) {
    t.pass('peer1 got track')
    if (receivedIds[track.id]) {
      t.fail('received one unique track per event')
    } else {
      receivedIds[track.id] = true
    }
  })

  t.on('end', async () => {
    await t.barrier('ended')
    peer.destroy()
  })
})

test('multistream on non-initiator only', [
  (t) => {
    t.plan(10)

    var peer1 = new Peer({
      config: config,
      initiator: true,
      wrtc: common.wrtc,
      streams: []
    })
    peer1.on('signal', function (data) {
      if (data.transceiverRequest) t.fail('initiator should not send transceiverRequest')
      t.send('signal', data)
    })
    t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })
    var receivedIds = {}
    peer1.on('stream', function (stream) {
      t.pass('peer1 got stream')
      if (receivedIds[stream.id]) {
        t.fail('received one unique stream per event')
      } else {
        receivedIds[stream.id] = true
      }
    })
    t.on('end', async () => {
      await t.barrier('readyToClose')
      peer1.destroy()
    })
  }, (t) => {
    t.plan(20)
    var peer2 = new Peer({
      config: config,
      wrtc: common.wrtc,
      streams: (new Array(10)).fill(null).map(function () { return common.getMediaStream() })
    })
    peer2.on('signal', function (data) {
      if (data.transceiverRequest) t.pass('sent transceiverRequest')
      t.send('signal', data)
    })
    t.receive('signal', (data) => { if (!peer2.destroyed) peer2.signal(data) })
    peer2.on('stream', () => t.fail('peer2 should get no streams'))
    t.on('end', async () => {
      await t.barrier('readyToClose')
      peer2.destroy()
    })
  }
])

test('delayed stream on non-initiator', [
  (t) => {
    t.timeoutAfter(15000)
    t.plan(1)

    var peer1 = new Peer({
      config: config,
      trickle: true,
      initiator: true,
      wrtc: common.wrtc,
      streams: [common.getMediaStream()]
    })
    peer1.on('signal', function (data) { t.send('signal', data) })
    t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })
    peer1.on('stream', function () {
      t.pass('peer1 got stream')
    })
    t.on('end', async () => {
      await t.barrier('readyToClose')
      peer1.destroy()
    })
  }, (t) => {
    t.timeoutAfter(15000)
    t.plan(1)

    var peer2 = new Peer({
      config: config,
      trickle: true,
      wrtc: common.wrtc,
      streams: []
    })
    peer2.on('signal', function (data) { t.send('signal', data) })
    t.receive('signal', (data) => { if (!peer2.destroyed) peer2.signal(data) })
    setTimeout(() => {
      peer2.addStream(common.getMediaStream())
      t.pass('peer2 added stream')
    }, 10000)

    t.on('end', async () => {
      await t.barrier('readyToClose')
      peer2.destroy()
    })
  }
])

test('incremental multistream', (t) => {
  t.plan(6)

  var peer1 = new Peer({
    config: config,
    initiator: !!t.instance,
    wrtc: common.wrtc,
    streams: []
  })
  peer1.on('signal', function (data) { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', function () {
    t.pass('peer1 connected')
    peer1.addStream(common.getMediaStream())
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
  t.on('end', async () => {
    await t.barrier('readyToClose')
    peer1.destroy()
  })
})

test('incremental multistream (track event)', (t) => {
  t.plan(11)

  var peer1 = new Peer({
    config: config,
    initiator: !!t.instance,
    wrtc: common.wrtc,
    streams: []
  })
  peer1.on('signal', function (data) { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  peer1.on('connect', function () {
    t.pass('peer1 connected')
    peer1.addStream(common.getMediaStream())
  })
  var receivedIds = {}
  var count1 = 0
  peer1.on('track', function (track) {
    t.pass('peer1 got track')
    if (receivedIds[track.id]) {
      t.fail('received one unique track per event')
    } else {
      receivedIds[track.id] = true
    }
    count1++
    if (count1 < 5) {
      peer1.addStream(common.getMediaStream())
    }
  })
  t.on('end', async () => {
    await t.barrier('readyToClose')
    peer1.destroy()
  })
})

test('incremental multistream on non-initiator only', [
  (t) => {
    t.plan(6)

    var peer1 = new Peer({
      config: config,
      initiator: true,
      wrtc: common.wrtc,
      streams: []
    })
    peer1.on('signal', (data) => { t.send('signal', data) })
    t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

    peer1.on('connect', function () {
      t.pass('peer1 connected')
    })
    var receivedIds = {}
    peer1.on('stream', function (stream) {
      t.pass('peer1 got stream')
      if (receivedIds[stream.id]) {
        t.fail('received one unique stream per event')
      } else {
        receivedIds[stream.id] = true
      }
    })

    t.on('end', async () => {
      await t.barrier('readyToClose')
      peer1.destroy()
    })
  }, (t) => {
    t.plan(1)

    var peer2 = new Peer({
      config: config,
      wrtc: common.wrtc,
      streams: []
    })
    peer2.on('signal', (data) => { t.send('signal', data) })
    t.receive('signal', (data) => { if (!peer2.destroyed) peer2.signal(data) })

    peer2.on('connect', function () {
      t.pass('peer2 connected')
      addStream()
    })
    var count = 0
    function addStream () {
      if (count < 5) {
        peer2.addStream(common.getMediaStream())
        setTimeout(addStream, 1000)
      }
      count++
    }

    t.on('end', async () => {
      await t.barrier('readyToClose')
      peer2.destroy()
    })
  }
])

test('incremental multistream on non-initiator only (track event)', [
  (t) => {
    t.plan(11)

    var peer1 = new Peer({
      config: config,
      initiator: true,
      wrtc: common.wrtc,
      streams: []
    })
    peer1.on('signal', (data) => { t.send('signal', data) })
    t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

    peer1.on('connect', function () {
      t.pass('peer1 connected')
    })
    var receivedIds = {}
    peer1.on('track', function (track) {
      t.pass('peer1 got track')
      if (receivedIds[track.id]) {
        t.fail('received one unique track per event')
      } else {
        receivedIds[track.id] = true
      }
    })

    t.on('end', async () => {
      await t.barrier('readyToClose')
      peer1.destroy()
    })
  }, (t) => {
    t.plan(1)

    var peer2 = new Peer({
      config: config,
      wrtc: common.wrtc,
      streams: []
    })
    peer2.on('signal', (data) => { t.send('signal', data) })
    t.receive('signal', (data) => { if (!peer2.destroyed) peer2.signal(data) })

    peer2.on('connect', function () {
      t.pass('peer2 connected')
      addStream()
    })
    var count = 0
    function addStream () {
      if (count < 5) {
        peer2.addStream(common.getMediaStream())
        setTimeout(addStream, 1000)
      }
      count++
    }

    t.on('end', async () => {
      await t.barrier('readyToClose')
      peer2.destroy()
    })
  }
])

test('addStream after removeStream', (t) => {
  t.plan(2)

  var stream1 = common.getMediaStream()
  var stream2 = common.getMediaStream()
  var peer1 = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc, streams: t.instance ? [stream1] : [] })

  peer1.on('signal', function (data) { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  let first = true
  t.receive('gotStream', () => {
    t.pass('remote peer got stream')
    if (!first) return
    first = false

    peer1.removeStream(stream1)
    setTimeout(() => {
      peer1.addStream(stream2)
    }, 1000)
  })

  peer1.once('stream', () => {
    t.pass('peer1 got first stream')
    t.send('gotStream')
    peer1.once('stream', () => {
      t.pass('peer1 got second stream')
      t.send('gotStream')
    })
  })

  t.on('end', async () => {
    await t.barrier('readyToClose')
    peer1.destroy()
  })
})

test('removeTrack immediately', (t) => {
  t.plan(1)

  var peer1 = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })

  peer1.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  var stream1 = common.getMediaStream()
  peer1.addTrack(stream1.getTracks()[0], stream1)
  peer1.removeTrack(stream1.getTracks()[0], stream1)

  peer1.on('track', function (track, stream) {
    t.fail('peer1 should not get track event')
  })
  peer1.on('connect', function () {
    t.pass('peer1 connected')
  })

  t.on('end', async () => {
    await t.barrier('readyToClose')
    peer1.destroy()
  })
})

test('replaceTrack', (t) => {
  t.plan(2)

  var peer1 = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })

  peer1.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { if (!peer1.destroyed) peer1.signal(data) })

  var stream1 = common.getMediaStream()
  var stream2 = common.getMediaStream()

  peer1.addTrack(stream1.getTracks()[0], stream1)
  peer1.replaceTrack(stream1.getTracks()[0], stream2.getTracks()[0], stream1)

  t.receive('gotTrack', () => {
    peer1.replaceTrack(stream2.getTracks()[0], null, stream1)
  })

  peer1.on('track', function (track, stream) {
    t.pass('peer1 got track event')
    t.send('gotTrack')
  })

  peer1.on('connect', function () {
    t.pass('peer1 connected')
  })

  t.on('end', async () => {
    await t.barrier('readyToClose')
    peer1.destroy()
  })
})
