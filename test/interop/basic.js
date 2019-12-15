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

test('data send/receive text', function (t) {
  t.plan(5)

  var peer = new Peer({ config: config, initiator: !!t.instance, wrtc: common.wrtc })

  var numSignal = 0
  peer.on('signal', function (data) {
    numSignal += 1
    t.send('signal', data)
  })
  t.receive('signal', (data) => {
    peer.signal(data)
  })
  peer.on('connect', tryTest)

  async function tryTest () {
    await t.barrier('connected')

    t.ok(numSignal >= 1)
    t.equal(peer.initiator, !!t.instance, 'peer.initiator is correct')

    peer.send('sup peer' + ((t.instance + 1) % 2))
    peer.on('data', async function (data) {
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.equal(data.toString(), 'sup peer' + (t.instance), 'got correct message')

      await t.barrier('waitingToClose')
      peer.on('close', function () { t.pass('peer destroyed') })
      peer.destroy()
    })
  }
})
