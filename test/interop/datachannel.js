const common = require('../common')
const Peer = require('../..')
const DataChannel = require('../../datachannel')
const str = require('string-to-stream')
const test = require('twintap/tape')

let config
test('get config', (t) => {
  common.getConfig((err, _config) => {
    if (err) return t.fail(err)
    config = _config
    t.end()
  })
})

test('create multiple DataChannels', [(t) => {
  t.plan(5)
  const peer1 = new Peer({ config, initiator: true, wrtc: common.wrtc })

  peer1.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer1.signal(data) })

  const dc1 = peer1.createDataChannel('1', {}, {})
  const dc2 = peer1.createDataChannel('2', {})
  const dc3 = peer1.createDataChannel('3')

  t.assert(peer1 instanceof DataChannel)
  t.assert(dc1 instanceof DataChannel)
  t.assert(dc2 instanceof DataChannel)
  t.assert(dc3 instanceof DataChannel)
  t.equals(peer1._channels.length, 4, 'peer1 has correct number of datachannels')
}, (t) => {
  t.plan(2)
  const peer2 = new Peer({ config, initiator: false, wrtc: common.wrtc })

  peer2.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer2.signal(data) })

  t.assert(peer2 instanceof DataChannel)

  let count = 0
  peer2.on('datachannel', () => {
    count++
    if (count >= 3) {
      t.equals(peer2._channels.length, 4, 'peer2 has correct number of datachannels')
    }
  })
}])

test('datachannel event', [(t) => {
  t.plan(5)

  const peer = new Peer({ config, initiator: true, wrtc: common.wrtc })
  t.equals(peer.channelName, 'default', 'default channelName is correct')
  t.assert(peer instanceof DataChannel, 'peer1 is instance of DataChannel')

  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  peer.createDataChannel(t.instance.toString())

  peer.on('connect', () => {
    t.equals(peer.channelName, 'default', 'default channelName is correct')
  })

  peer.on('datachannel', (dc) => {
    t.equals(dc.channelName, ((t.instance + 1) % 2).toString(), 'channelName 2 is correct')
    t.assert(dc instanceof DataChannel, 'dc is instance of DataChannel')
  })
}, (t) => {
  t.plan(5)

  const peer = new Peer({ config, initiator: false, wrtc: common.wrtc })
  t.equals(peer.channelName, 'default', 'default channelName is correct')
  t.assert(peer instanceof DataChannel, 'peer2 is instance of DataChannel')

  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  peer.createDataChannel(t.instance.toString())

  peer.on('connect', () => {
    t.equals(peer.channelName, 'default', 'default channelName is correct')
  })

  peer.on('datachannel', (dc) => {
    t.equals(dc.channelName, ((t.instance + 1) % 2).toString(), 'channelName 1 is correct')
    t.assert(dc instanceof DataChannel, 'dc is instance of DataChannel')
  })
}])

function assertChannel (t, channel, testData, isCloser, onEnd) {
  str(testData).pipe(channel, { end: false })

  channel.on('data', async (chunk) => {
    t.equal(chunk.toString(), testData, channel.channelName + ' got correct message')
    await t.barrier('got data - ' + channel.channelName)
    if (isCloser) {
      channel.end()
    }
  })
  channel.on('finish', () => {
    t.pass(channel.channelName + ' got "finish"')
    t.ok(channel._writableState.finished)
  })
  channel.on('end', () => {
    t.pass(channel.channelName + ' got "end"')
    t.ok(channel._readableState.ended)
    onEnd()
  })
}

test('data sends on seperate channels', (t) => {
  t.plan(16)

  const peer = new Peer({ config, initiator: !!t.instance, wrtc: common.wrtc })

  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  const dc1 = peer.createDataChannel(t.instance ? '1' : '2')

  let ended = 0
  async function onEnd () {
    ended++
    if (ended === 2) {
      await t.barrier('ready to end')
      peer.end()
    } else if (ended === 3) {
      peer.destroy()
      t.end()
    }
  }

  assertChannel(t, peer, 'abc', false, onEnd)
  assertChannel(t, dc1, '123', peer.initiator, onEnd)
  peer.on('datachannel', (dc2) => {
    t.pass('got "datachannel" event on peer1')
    assertChannel(t, dc2, '123', peer.initiator, onEnd)
  })
})

test('data sends on seperate channels, async creation', (t) => {
  t.plan(16)

  const peer = new Peer({ config, initiator: !!t.instance, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  let ended = 0
  async function onEnd () {
    ended++
    if (ended === 2) {
      await t.barrier('ready to end')
      peer.end()
    } else if (ended === 3) {
      peer.destroy()
      t.end()
    }
  }

  assertChannel(t, peer, 'abc', false, onEnd)
  peer.on('datachannel', (dc2) => {
    t.pass('got "datachannel" event on peer1')
    assertChannel(t, dc2, '123', peer.initiator, onEnd)
  })

  setTimeout(() => {
    const dc1 = peer.createDataChannel(t.instance ? '1' : '2')
    assertChannel(t, dc1, '123', peer.initiator, onEnd)
  }, 2000)
})

test('closing channels from creator side', (t) => {
  t.plan(2)

  const peer = new Peer({ config, initiator: !!t.instance, wrtc: common.wrtc })

  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  const dc1 = peer.createDataChannel('1')

  t.receive('dcDestroy', () => {
    dc1.destroy()
    t.barrier('dcDestroyed')
  })

  peer.on('datachannel', (dc2) => {
    t.pass('peer got datachannel event')
    dc2.on('open', async () => {
      t.send('dcDestroy')
      await t.barrier('dcDestroyed')
      try {
        dc1.send('123')
      } catch (err) { }
    })
    dc2.on('close', () => {
      t.pass('dc closed')
    })
  })

  dc1.on('data', () => {
    t.fail('received data after destruction')
  })
})

test('closing channels from non-creator side', (t) => {
  t.plan(2)

  const peer = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  const dc1 = peer.createDataChannel('1')

  t.receive('dcDestroyed', () => {
    try {
      dc1.send('123')
    } catch (err) { }
  })

  peer.on('datachannel', (dc2) => {
    t.pass('peer got datachannel event')

    dc2.on('data', () => {
      t.fail('received data after destruction')
    })
    dc2.on('open', () => {
      dc2.close()
      t.send('dcDestroyed')
    })
  })

  dc1.on('close', () => {
    t.pass('dc1 closed')
  })
})

test('open new channel after closing one', async (t) => {
  if (common.isBrowser('firefox')) {
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1513107
    t.pass('Skip on Firefox which does not support this reliably')
    t.send('skipTest')
    await t.barrier('maybeSkip')
    t.end()
    return
  } else {
    let skipTest = false
    t.receive('skipTest', () => {
      skipTest = true
    })
    await t.barrier('maybeSkip')
    if (skipTest) {
      t.pass('Skip on Firefox which does not support this reliably')
      t.end()
    }
  }
  t.plan(6)

  const peer = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  const dc1 = peer.createDataChannel(t.instance + '-1')
  dc1.on('close', () => {
    t.pass('created channel')
    const dc2 = peer.createDataChannel(t.instance + '-2')
    str('123').pipe(dc2, { end: false })
  })

  peer.once('datachannel', (dc) => {
    t.pass('got datachannel')
    t.equals(dc.channelName, ((t.instance + 1) % 2) + '-1', 'channel has correct name')

    dc.on('close', () => {
      t.pass('channel instance closed')
    })
    dc.on('data', () => {
      t.fail('received data on closed channel')
    })
    dc.on('open', () => {
      dc.destroy()
    })

    peer.once('datachannel', (dc) => {
      t.equals(dc.channelName, ((t.instance + 1) % 2) + '-2', 'channel has correct name')
      dc.on('data', async (data) => {
        t.equal(data.toString(), '123', 'received correct message on #4 channel')
        await t.barrier('awaitingDestroy')
        peer.destroy()
        t.end()
      })
    })
  })
})

test('reusing channelNames of closed channels', async (t) => {
  if (common.isBrowser('firefox')) {
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1513107
    t.pass('Skip on Firefox which does not support this reliably')
    t.send('skipTest')
    await t.barrier('maybeSkip')
    t.end()
    return
  } else {
    let skipTest = false
    t.receive('skipTest', () => {
      skipTest = true
    })
    await t.barrier('maybeSkip')
    if (skipTest) {
      t.pass('Skip on Firefox which does not support this reliably')
      t.end()
    }
  }
  t.plan(5)

  const peer = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  const dc1 = peer.createDataChannel(t.instance.toString())
  dc1.on('close', () => {
    t.pass('dc closed')
    const dc12 = peer.createDataChannel(t.instance.toString())
    dc12.write('123')
  })

  peer.once('datachannel', (dc) => {
    dc.on('open', () => {
      t.pass('first channel instance closed')
      dc.destroy()
    })
    dc.on('close', () => {
      t.pass('first channel instance closed')
    })
    dc.on('data', () => {
      t.fail('received data on closed channel')
    })

    peer.once('datachannel', (dc) => {
      t.equals(dc.channelName, ((t.instance + 1) % 2).toString(), 'second channel has same channelName')
      dc.on('data', async (data) => {
        t.equal(data.toString(), '123', 'received correct message on channel')
        await t.barrier('awaitingDestroy')
        peer.destroy()
        t.end()
      })
    })
  })
})

test('channelName should be exposed as channel.channelName', [async (t) => {
  const peer = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  const stream1 = peer.createDataChannel('5')
  t.equal(stream1.channelName, '5')
  stream1.write(Buffer.from('hello'))
  stream1.end()

  await t.barrier('awaitingDestroy')
  peer.destroy()
  t.end()
}, (t) => {
  const peer = new Peer({ config: config, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  peer.on('datachannel', async (stream) => {
    t.equal(stream.channelName, '5')

    await t.barrier('awaitingDestroy')
    peer.destroy()
    t.end()
  })
}])

test('channelName can be a long string', [async (t) => {
  const peer = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  var stream1 = peer.createDataChannel('hello-yes-this-is-dog')
  t.equal(stream1.channelName, 'hello-yes-this-is-dog')

  stream1.write(Buffer.from('hello'))
  stream1.end()

  await t.barrier('awaitingDestroy')
  peer.destroy()
  t.end()
}, (t) => {
  const peer = new Peer({ config: config, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  peer.on('datachannel', async (stream) => {
    t.equal(stream.channelName, 'hello-yes-this-is-dog')

    await t.barrier('awaitingDestroy')
    peer.destroy()
    t.end()
  })
}])

test('destroy', [(t) => {
  const peer = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  const stream1 = peer.createDataChannel('1')

  // we listen on the local stream instead of the remote stream here:
  // there's no way to propagate error messages across datachannels like multiplex does
  stream1.on('error', async (err) => {
    t.equal(err.message, '0 had an error')

    await t.barrier('awaitingDestroy')
    peer.destroy()
    t.end()
  })

  stream1.write(Buffer.from('hello'))
  stream1.destroy(new Error('0 had an error'))
}, async (t) => {
  const peer = new Peer({ config: config, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  await t.barrier('awaitingDestroy')
  peer.destroy()
  t.end()
}])

test('quick message', [async (t) => {
  const peer = new Peer({ config: config, initiator: true, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  peer.on('datachannel', (stream) => {
    stream.write('hello world')
  })

  await t.barrier('awaitingDestroy')
  peer.destroy()
  t.end()
}, (t) => {
  const peer = new Peer({ config: config, wrtc: common.wrtc })
  peer.on('signal', (data) => { t.send('signal', data) })
  t.receive('signal', (data) => { peer.signal(data) })

  setTimeout(() => {
    const stream = peer.createDataChannel()
    stream.on('data', async (data) => {
      t.same(data, Buffer.from('hello world'))

      await t.barrier('awaitingDestroy')
      peer.destroy()
      t.end()
    })
  }, 100)
}])
