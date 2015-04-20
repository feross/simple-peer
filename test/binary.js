var Peer = require('../')
var test = require('tape')
var wrtc = typeof window === 'undefined' && require('wrtc')

test('data send/receive Uint8Array', function (t) {
  var peer1 = new Peer({ initiator: true, wrtc: wrtc })
  var peer2 = new Peer({ wrtc: wrtc })
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    peer1.send(new Uint8Array([1, 2, 3]))
    peer2.on('data', function (data) {
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.deepEqual(data, new Buffer([1, 2, 3]), 'got correct message')

      peer2.send(new Uint8Array([2, 3, 4]))
      peer1.on('data', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is Buffer')
        t.deepEqual(data, new Buffer([2, 3, 4]), 'got correct message')

        peer1.destroy(tryDone)
        peer2.destroy(tryDone)

        function tryDone () {
          if (!peer1.connected && !peer2.connected) {
            t.pass('both peers closed')
            t.end()
          }
        }
      })
    })
  }
})

test('data send/receive Buffer', function (t) {
  var peer1 = new Peer({ initiator: true, wrtc: wrtc })
  var peer2 = new Peer({ wrtc: wrtc })
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || peer2.connected) return

    peer1.send(new Buffer([1, 2, 3]))
    peer2.on('data', function (data) {
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.deepEqual(data, new Buffer([1, 2, 3]), 'got correct message')

      peer2.send(new Buffer([2, 3, 4]))
      peer1.on('data', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is Buffer')
        t.deepEqual(data, new Buffer([2, 3, 4]), 'got correct message')

        peer1.destroy(tryDone)
        peer2.destroy(tryDone)

        function tryDone () {
          if (!peer1.connected && !peer2.connected) {
            t.pass('both peers closed')
            t.end()
          }
        }
      })
    })
  }
})

// TODO: re-enable when Chrome supports channel.send(Blob)
// test('data send/receive Blob', function (t) {
//   var peer1 = new Peer({ initiator: true, wrtc: wrtc })
//   var peer2 = new Peer({ wrtc: wrtc })
//   peer1.on('signal', function (data) {
//     peer2.signal(data)
//   })
//   peer2.on('signal', function (data) {
//     peer1.signal(data)
//   })
//   peer1.on('connect', tryTest)
//   peer2.on('connect', tryTest)

//   function tryTest () {
//     if (!peer1.connected || !peer2.connected) return

//     peer1.send(new Blob([ new Buffer([1, 2, 3]) ]))
//     peer2.on('data', function (data) {
//       t.ok(Buffer.isBuffer(data), 'data is Buffer')
//       t.deepEqual(data, new Buffer([1, 2, 3]), 'got correct message')

//       peer2.send(new Blob([ new Buffer([2, 3, 4]) ]))
//       peer1.on('data', function (data) {
//         t.ok(Buffer.isBuffer(data), 'data is Buffer')
//         t.deepEqual(data, new Buffer([2, 3, 4]), 'got correct message')

//         peer1.destroy(tryDone)
//         peer2.destroy(tryDone)

//         function tryDone () {
//           if (!peer1.connected && !peer2.connected) {
//             t.pass('both peers closed')
//             t.end()
//           }
//         }
//       })
//     })
//   }
// })

test('data send/receive ArrayBuffer', function (t) {
  var peer1 = new Peer({ initiator: true, wrtc: wrtc })
  var peer2 = new Peer({ wrtc: wrtc })
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    peer1.send(new Uint8Array([1, 2, 3]).buffer)
    peer2.on('data', function (data) {
      t.ok(Buffer.isBuffer(data), 'data is Buffer')
      t.deepEqual(data, new Buffer([1, 2, 3]), 'got correct message')

      peer2.send(new Uint8Array([2, 3, 4]).buffer)
      peer1.on('data', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is Buffer')
        t.deepEqual(data, new Buffer([2, 3, 4]), 'got correct message')

        peer1.destroy(tryDone)
        peer2.destroy(tryDone)

        function tryDone () {
          if (!peer1.connected && !peer2.connected) {
            t.pass('both peers closed')
            t.end()
          }
        }
      })
    })
  }
})
