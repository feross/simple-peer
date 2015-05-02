var Peer = require('../')
var test = require('tape')
var wrtc = typeof window === 'undefined' && require('wrtc')

test('signal event gets emitted', function (t) {
  var peer = new Peer({ initiator: true, wrtc: wrtc })
  peer.once('signal', function () {
    t.pass('got signal event')
    peer.destroy()
    t.end()
  })
})

test('data send/receive text', function (t) {
  var peer1 = new Peer({ initiator: true, wrtc: wrtc })
  var peer2 = new Peer({ wrtc: wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    peer2.signal(data)
  })

  var numSignal2 = 0
  peer2.on('signal', function (data) {
    numSignal2 += 1
    peer1.signal(data)
  })

  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    t.ok(numSignal1 >= 1)
    t.ok(numSignal2 >= 1)
    t.equal(peer1.initiator, true, 'peer1 is initiator')
    t.equal(peer2.initiator, false, 'peer2 is not initiator')

    peer1.send('sup peer2')
    peer2.on('data', function (data) {
      t.equal(data, 'sup peer2', 'got correct message')

      peer2.send('sup peer1')
      peer1.on('data', function (data) {
        t.equal(data, 'sup peer1', 'got correct message')

        function tryDone () {
          if (!peer1.connected && !peer2.connected) {
            t.pass('both peers closed')
            t.end()
          }
        }

        peer1.destroy(tryDone)
        peer2.destroy(tryDone)
      })
    })
  }
})
