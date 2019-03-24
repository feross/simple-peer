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
  t.plan(32)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var dc1 = peer1.createDataChannel('1')
  var dc2 = peer2.createDataChannel('2')

  var ended = 0
  function assertChannel (channel, label, testData) {
    str(testData).pipe(channel)

    channel.on('data', function (chunk) {
      t.equal(chunk.toString(), testData, label + ' got correct message')
    })
    channel.on('finish', function () {
      t.pass(label + ' got "finish"')
      t.ok(channel._writableState.finished)
    })
    channel.on('end', function () {
      t.pass(label + ' got "end"')
      t.ok(channel._readableState.ended)
      ended++
      if (ended === 6) {
        peer1.destroy()
        peer2.destroy()
        t.end()
      }
    })
  }

  assertChannel(dc1, 'channel 1, creator side', '123')
  peer2.on('datachannel', function (dc1) {
    t.pass('got "datachannel" event on peer2')
    assertChannel(dc1, 'channel 1, receiver side', '123')
  })

  assertChannel(dc2, 'channel 2, creator side', '456')
  peer1.on('datachannel', function (dc2) {
    t.pass('got "datachannel" event on peer1')
    assertChannel(dc2, 'channel 2, receiver side', '456')
  })

  assertChannel(peer1, 'default, initiator', 'abc')
  assertChannel(peer2, 'default, non-initiator', 'abc')
})

test('data sends on seperate channels, async creation', function (t) {
  t.plan(32)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  setTimeout(function () {
    var dc1 = peer1.createDataChannel('1')
    var dc2 = peer2.createDataChannel('2')

    var ended = 0
    function assertChannel (channel, label, testData) {
      str(testData).pipe(channel)

      channel.on('data', function (chunk) {
        t.equal(chunk.toString(), testData, label + ' got correct message')
      })
      channel.on('finish', function () {
        t.pass(label + ' got "finish"')
        t.ok(channel._writableState.finished)
      })
      channel.on('end', function () {
        t.pass(label + ' got "end"')
        t.ok(channel._readableState.ended)
        ended++
        if (ended === 6) {
          peer1.destroy()
          peer2.destroy()
          t.end()
        }
      })
    }

    assertChannel(dc1, 'channel 1, creator side', '123')
    peer2.on('datachannel', function (dc1) {
      t.pass('got "datachannel" event on peer2')
      assertChannel(dc1, 'channel 1, receiver side', '123')
    })

    assertChannel(dc2, 'channel 2, creator side', '456')
    peer1.on('datachannel', function (dc2) {
      t.pass('got "datachannel" event on peer1')
      assertChannel(dc2, 'channel 2, receiver side', '456')
    })

    assertChannel(peer1, 'default, initiator', 'abc')
    assertChannel(peer2, 'default, non-initiator', 'abc')
  }, 2000)
})

test('closing channels from creator side', function (t) {
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

test('open new channel after closing one', function (t) {
  if (bowser.firefox) {
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1513107
    t.pass('Skip on Firefox which does not support this reliably')
    t.end()
    return
  }
  t.plan(10)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var count = 0

  const dc1 = peer1.createDataChannel('1')
  dc1.on('close', function () {
    t.pass('created channel #3')
    const dc12 = peer1.createDataChannel('3')
    str('456').pipe(dc12)
  })
  var dc2 = peer2.createDataChannel('2')
  dc2.on('close', function () {
    t.pass('created channel #4')
    const dc22 = peer2.createDataChannel('4')
    str('123').pipe(dc22)
  })

  peer1.once('datachannel', function (dc) {
    t.pass('got #2 datachannel')

    dc.on('close', function () {
      t.pass('#2 channel instance closed')
    })
    dc.on('data', function () {
      t.fail('received data on closed #2 channel')
    })
    dc.on('open', function () {
      dc.destroy()
    })

    peer1.once('datachannel', function (dc) {
      t.equals(dc.channelName, '4', '#4 channel has correct name')
      dc.on('data', function (data) {
        t.equal(data.toString(), '123', 'received correct message on #4 channel')
        count++
        if (count === 2) {
          peer1.destroy()
          peer2.destroy()
          t.end()
        }
      })
    })
  })

  peer2.once('datachannel', function (dc) {
    t.pass('got #1 datachannel')

    dc.on('close', function () {
      t.pass('#1 channel instance closed')
    })
    dc.on('data', function () {
      t.fail('received data on #1 closed channel')
    })
    dc.on('open', function () {
      dc.destroy()
    })

    peer2.once('datachannel', function (dc) {
      t.equals(dc.channelName, '3', '#3 channel has same channelName')
      dc.on('data', function (data) {
        t.equal(data.toString(), '456', 'received correct message on #3 channel')
        count++
        if (count === 2) {
          peer1.destroy()
          peer2.destroy()
          t.end()
        }
      })
    })
  })
})

test('reusing channelNames of closed channels', function (t) {
  if (bowser.firefox) {
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1513107
    t.pass('Skip on Firefox which does not support this reliably')
    t.end()
    return
  }
  t.plan(10)

  var peer1 = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc })

  peer1.on('signal', function (data) { if (!peer2.destroyed) peer2.signal(data) })
  peer2.on('signal', function (data) { if (!peer1.destroyed) peer1.signal(data) })

  var count = 0

  const dc1 = peer1.createDataChannel('1')
  dc1.on('close', function () {
    t.pass('dc1 closed')
    const dc12 = peer1.createDataChannel('1')
    dc12.write('456')
  })
  const dc2 = peer2.createDataChannel('2')
  dc2.on('close', function () {
    t.pass('dc2 closed')
    const dc22 = peer2.createDataChannel('2')
    dc22.write('123')
  })

  peer1.once('datachannel', function (dc) {
    dc.on('open', function () {
      t.pass('first channel instance closed #1')
      dc.destroy()
    })
    dc.on('close', function () {
      t.pass('first channel instance closed #1')
    })
    dc.on('data', function () {
      t.fail('received data on closed channel #1')
    })

    peer1.once('datachannel', function (dc) {
      t.equals(dc.channelName, '2', 'second channel has same channelName #1')
      dc.on('data', function (data) {
        t.equal(data.toString(), '123', 'received correct message on channel #1')
        count++
        if (count === 2) {
          peer1.destroy()
          peer2.destroy()
          t.end()
        }
      })
    })
  })

  peer2.once('datachannel', function (dc) {
    dc.on('open', function () {
      t.pass('first channel instance closed #2')
      dc.destroy()
    })
    dc.on('close', function () {
      t.pass('first channel instance closed #2')
    })
    dc.on('data', function () {
      t.fail('received data on closed channel #2')
    })

    peer2.once('datachannel', function (dc) {
      t.equals(dc.channelName, '1', 'second channel has same channelName #2')
      dc.on('data', function (data) {
        t.equal(data.toString(), '456', 'received correct message on second channel #2')
        count++
        if (count === 2) {
          peer1.destroy()
          peer2.destroy()
          t.end()
        }
      })
    })
  })
})
