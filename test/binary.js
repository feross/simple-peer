var Peer = require('../')
var test = require('tape')

test('data send/receive Uint8Array', function (t) {
  var peer1 = new Peer({ initiator: true })
  var peer2 = new Peer()
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('ready', tryTest)
  peer2.on('ready', tryTest)

  function tryTest () {
    if (peer1.ready && peer2.ready) {
      peer1.send(new Uint8Array([1, 2, 3]))
      peer2.on('message', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is Buffer')
        t.deepEqual(data, new Buffer([1, 2, 3]), 'got correct message')

        peer2.send(new Uint8Array([2, 3, 4]))
        peer1.on('message', function (data) {
          t.ok(Buffer.isBuffer(data), 'data is Buffer')
          t.deepEqual(data, new Buffer([2, 3, 4]), 'got correct message')

          peer1.destroy(tryDone)
          peer2.destroy(tryDone)

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

test('data send/receive Buffer', function (t) {
  var peer1 = new Peer({ initiator: true })
  var peer2 = new Peer()
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('ready', tryTest)
  peer2.on('ready', tryTest)

  function tryTest () {
    if (peer1.ready && peer2.ready) {
      peer1.send(new Buffer([1, 2, 3]))
      peer2.on('message', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is Buffer')
        t.deepEqual(data, new Buffer([1, 2, 3]), 'got correct message')

        peer2.send(new Buffer([2, 3, 4]))
        peer1.on('message', function (data) {
          t.ok(Buffer.isBuffer(data), 'data is Buffer')
          t.deepEqual(data, new Buffer([2, 3, 4]), 'got correct message')

          peer1.destroy(tryDone)
          peer2.destroy(tryDone)

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

// TODO: re-enable when Chrome supports channel.send(Blob)
// test('data send/receive Blob', function (t) {
//   var peer1 = new Peer({ initiator: true })
//   var peer2 = new Peer()
//   peer1.on('signal', function (data) {
//     peer2.signal(data)
//   })
//   peer2.on('signal', function (data) {
//     peer1.signal(data)
//   })
//   peer1.on('ready', tryTest)
//   peer2.on('ready', tryTest)

//   function tryTest () {
//     if (peer1.ready && peer2.ready) {
//       peer1.send(new Blob([ new Buffer([1, 2, 3]) ]))
//       peer2.on('message', function (data) {
//         t.ok(Buffer.isBuffer(data), 'data is Buffer')
//         t.deepEqual(data, new Buffer([1, 2, 3]), 'got correct message')

//         peer2.send(new Blob([ new Buffer([2, 3, 4]) ]))
//         peer1.on('message', function (data) {
//           t.ok(Buffer.isBuffer(data), 'data is Buffer')
//           t.deepEqual(data, new Buffer([2, 3, 4]), 'got correct message')

//           peer1.destroy(tryDone)
//           peer2.destroy(tryDone)

//           function tryDone () {
//             if (!peer1.ready && !peer2.ready) {
//               t.pass('both peers closed')
//               t.end()
//             }
//           }
//         })
//       })
//     }
//   }
// })

test('data send/receive ArrayBuffer', function (t) {
  var peer1 = new Peer({ initiator: true })
  var peer2 = new Peer()
  peer1.on('signal', function (data) {
    peer2.signal(data)
  })
  peer2.on('signal', function (data) {
    peer1.signal(data)
  })
  peer1.on('ready', tryTest)
  peer2.on('ready', tryTest)

  function tryTest () {
    if (peer1.ready && peer2.ready) {
      peer1.send(new Buffer([1, 2, 3]).toArrayBuffer())
      peer2.on('message', function (data) {
        t.ok(Buffer.isBuffer(data), 'data is Buffer')
        t.deepEqual(data, new Buffer([1, 2, 3]), 'got correct message')

        peer2.send(new Buffer([2, 3, 4]).toArrayBuffer())
        peer1.on('message', function (data) {
          t.ok(Buffer.isBuffer(data), 'data is Buffer')
          t.deepEqual(data, new Buffer([2, 3, 4]), 'got correct message')

          peer1.destroy(tryDone)
          peer2.destroy(tryDone)

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
