var common = require('./common')
var Peer = require('../')
var DataChannel = require('../datachannel')
var str = require('string-to-stream')
var test = require('tape')
var bowser = require('bowser')

var config
test('get config', function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err)
    config = _config
    t.end()
  })
})

test('create multiple DataChannels', function (t) {
  if (process.env.WRTC) {
    t.pass('Skipping test, no support on electron-webrtc') // https://github.com/mappum/electron-webrtc/issues/127
    t.end()
    return
  }

  t.plan(7)
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var dc1 = peer1.createDataChannel('1', {}, {})
  var dc2 = peer1.createDataChannel('2', {})
  var dc3 = peer1.createDataChannel('3')

  t.assert(peer1 instanceof DataChannel)
  t.assert(peer2 instanceof DataChannel)
  t.assert(dc1 instanceof DataChannel)
  t.assert(dc2 instanceof DataChannel)
  t.assert(dc3 instanceof DataChannel)

  t.equals(peer1._channels.length, 4, 'peer1 has correct number of datachannels')

  var count = 0
  peer2.on('datachannel', function () {
    count++
    if (count >= 3) {
      t.equals(peer2._channels.length, 4, 'peer2 has correct number of datachannels')
    }
  })
})

test('datachannel event', function (t) {
  if (process.env.WRTC) {
    t.pass('Skipping test, no support on electron-webrtc') // https://github.com/mappum/electron-webrtc/issues/127
    t.end()
    return
  }
  t.plan(8)
  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  peer1.createDataChannel('1')
  peer2.createDataChannel('2')

  peer2.on('connect', function () {
    t.equals(peer2.channelName, 'default', 'default channelName is correct')
    t.equals(peer1.channelName, 'default', 'default channelName is correct')
    t.assert(peer2 instanceof DataChannel, 'peer1 is instance of DataChannel')
    t.assert(peer2 instanceof DataChannel, 'peer2 is instance of DataChannel')
  })

  peer2.on('datachannel', function (dc) {
    t.equals(dc.channelName, '1', 'channelName 1 is correct')
    t.assert(dc instanceof DataChannel, 'dc is instance of DataChannel')
  })

  peer1.on('datachannel', function (dc) {
    t.equals(dc.channelName, '2', 'channelName 2 is correct')
    t.assert(dc instanceof DataChannel, 'dc is instance of DataChannel')
  })
})

test('data sends on seperate channels', function (t) {
  if (process.env.WRTC) {
    t.pass('Skipping test, no support on electron-webrtc') // https://github.com/mappum/electron-webrtc/issues/127
    t.end()
    return
  }
  t.plan(15)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var dc1 = peer1.createDataChannel('1')
  var dc2 = peer2.createDataChannel('2')

  str('123').pipe(peer2)
  peer2.on('datachannel', function (dc) {
    str('456').pipe(dc)
  })
  peer1.on('datachannel', function (dc) {
    str('789').pipe(dc)
  })

  peer1.on('data', function (chunk) {
    t.equal(chunk.toString(), '123', 'got correct message')
  })
  peer1.on('finish', function () {
    t.pass('got peer2 "finish"')
    t.ok(peer1._writableState.finished)
  })
  peer1.on('end', function () {
    t.pass('got peer2 "end"')
    t.ok(peer1._readableState.ended)
  })

  dc1.on('data', function (chunk) {
    t.equal(chunk.toString(), '456', 'got correct message')
  })
  dc1.on('finish', function () {
    t.pass('got dc1 "finish"')
    t.ok(dc1._writableState.finished)
  })
  dc1.on('end', function () {
    t.pass('got dc1 "end"')
    t.ok(dc1._readableState.ended)
  })

  dc2.on('data', function (chunk) {
    t.equal(chunk.toString(), '789', 'got correct message')
  })
  dc2.on('finish', function () {
    t.pass('got dc2 "finish"')
    t.ok(dc2._writableState.finished)
  })
  dc2.on('end', function () {
    t.pass('got dc2 "end"')
    t.ok(dc2._readableState.ended)
  })
})

test('closing channels from creator side', function (t) {
  if (process.env.WRTC) {
    t.pass('Skipping test, no support on electron-webrtc') // https://github.com/mappum/electron-webrtc/issues/127
    t.end()
    return
  }
  if (bowser.safari || bowser.ios || bowser.chromium) {
    t.pass('Skipping test, no support on Chromium or Safari')
    t.end()
    return
  }
  t.plan(4)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var dc1 = peer1.createDataChannel('1')
  var dc2 = peer2.createDataChannel('2')

  peer1.on('datachannel', function (dc) {
    t.pass('peer1 got datachannel event')
    dc.on('open', function () {
      dc2.destroy()
      try {
        dc.send('123')
      } catch (err) {}
    })
    dc.on('close', function () {
      t.pass('dc2 closed')
    })
  })

  peer2.on('datachannel', function (dc) {
    t.pass('peer2 got datachannel event')
    dc.on('open', function () {
      dc1.destroy()
      try {
        dc.send('abc')
      } catch (err) {}
    })
    dc.on('close', function () {
      t.pass('dc1 closed')
    })
  })

  dc1.on('data', function () {
    t.fail('received data after destruction')
  })
  dc2.on('data', function () {
    t.fail('received data after destruction')
  })
})

test('closing channels from non-creator side', function (t) {
  if (process.env.WRTC) {
    t.pass('Skipping test, no support on electron-webrtc') // https://github.com/mappum/electron-webrtc/issues/127
    t.end()
    return
  }
  t.plan(2)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var dc1 = peer1.createDataChannel('1')
  var dc2 = peer2.createDataChannel('2')

  peer1.on('datachannel', function (dc) {
    dc.on('data', function () {
      t.fail('received data after destruction')
    })
    dc.on('open', function () {
      dc.destroy()
      try {
        dc2.send('123')
      } catch (err) {}
    })
  })
  peer2.on('datachannel', function (dc) {
    dc.on('data', function () {
      t.fail('received data after destruction')
    })
    dc.on('open', function () {
      dc.destroy()
      try {
        dc1.send('abc')
      } catch (err) {}
    })
  })

  dc1.on('close', function () {
    t.pass('dc1 closed')
  })
  dc2.on('close', function () {
    t.pass('dc2 closed')
  })
})

test('reusing channelNames of closed channels', function (t) {
  if (process.env.WRTC) {
    t.pass('Skipping test, no support on electron-webrtc') // https://github.com/mappum/electron-webrtc/issues/127
    t.end()
    return
  }
  if (bowser.safari || bowser.ios) {
    t.pass('Skip on Safari and iOS which do not support this')
    t.end()
    return
  }
  t.plan(6)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var dc1 = peer1.createDataChannel('1')
  var dc2 = peer2.createDataChannel('2')

  peer1.once('datachannel', function (dc) {
    dc.on('close', function (data) {
      t.pass('first channel instance closed')
    })
    dc.on('data', function (data) {
      t.fail('received data on closed channel')
    })
    dc.on('open', function () {
      dc.destroy()
      dc2 = peer2.createDataChannel('2')
      dc2.write('123')
    })

    peer1.once('datachannel', function (dc) {
      t.equals(dc.channelName, '2', 'second channel has same channelName')
      dc.on('data', function (data) {
        t.equal(data.toString(), '123', 'received correct message on second channel')
      })
    })
  })

  peer2.once('datachannel', function (dc) {
    dc.on('close', function (data) {
      t.pass('first channel instance closed')
    })
    dc.on('data', function (data) {
      t.fail('received data on closed channel')
    })
    dc.on('open', function () {
      dc.destroy()
      dc1 = peer1.createDataChannel('1')
      dc1.write('456')
    })

    peer2.once('datachannel', function (dc) {
      t.equals(dc.channelName, '1', 'second channel has same channelName')
      dc.on('data', function (data) {
        t.equal(data.toString(), '456', 'received correct message on second channel')
      })
    })
  })
})
