var Peer = require('../')
var test = require('tape')

test('data send/receive text', function (t) {
  var peer1 = new Peer({ initiator: true })
  var peer2 = new Peer()

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

  peer1.on('ready', tryTest)
  peer2.on('ready', tryTest)

  function tryTest () {
    if (peer1.ready && peer2.ready) {
      console.log(numSignal1)
      t.ok(numSignal1 >= 1)
      t.ok(numSignal2 >= 1)
      t.equal(peer1.initiator, true, 'peer1 is initiator')
      t.equal(peer2.initiator, false, 'peer2 is not initiator')

      peer1.send('sup peer2')
      peer2.on('message', function (data) {
        t.equal(data, 'sup peer2', 'got correct message')

        peer2.send('sup peer1')
        peer1.on('message', function (data) {
          t.equal(data, 'sup peer1', 'got correct message')

          peer1.close(tryDone)
          peer2.close(tryDone)

          function tryDone () {
            if (!peer1.ready && !peer2.ready) {
              t.pass('both peers closed')
              t.end()
            }
          }
        })
      })
    }
  }
})
