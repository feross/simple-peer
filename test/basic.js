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

          function tryDone () {
            if (!peer1.ready && !peer2.ready) {
              t.pass('both peers closed')
              t.end()
            }
          }

          peer1.destroy(tryDone)
          peer2.destroy(tryDone)
        })
      })
    }
  }
})

test('disable trickle', function (t) {
  var peer1 = new Peer({ initiator: true, trickle: false })
  peer1.id = 1
  var peer2 = new Peer({ trickle: false })
  peer2.id = 2

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    console.log('1 signal %s', JSON.stringify(data))
    numSignal1 += 1
    peer2.signal(data)
  })

  var numSignal2 = 0
  peer2.on('signal', function (data) {
    console.log('2 signal %s', JSON.stringify(data))
    numSignal2 += 1
    peer1.signal(data)
  })

  peer1.on('ready', tryTest)
  peer2.on('ready', tryTest)

  function tryTest () {
    if (peer1.ready && peer2.ready) {
      t.equal(numSignal1, 1, 'only one `signal` event')
      t.equal(numSignal2, 1, 'only one `signal` event')
      t.equal(peer1.initiator, true, 'peer1 is initiator')
      t.equal(peer2.initiator, false, 'peer2 is not initiator')

      peer1.send('sup peer2')
      peer2.on('message', function (data) {
        t.equal(data, 'sup peer2', 'got correct message')

        peer2.send('sup peer1')
        peer1.on('message', function (data) {
          t.equal(data, 'sup peer1', 'got correct message')

          function tryDone () {
            if (!peer1.ready && !peer2.ready) {
              t.pass('both peers closed')
              t.end()
            }
          }

          peer1.destroy(tryDone)
          peer2.destroy(tryDone)
        })
      })
    }
  }
})
