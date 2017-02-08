// run in a browser, with:
//   beefy perf/send.js

var Peer = require('simple-peer')
var stream = require('readable-stream')

var buf = Buffer.alloc(10000)

var endless = new stream.Readable({
  read: function () {
    this.push(buf)
  }
})

var peer

var socket = new window.WebSocket('ws://localhost:8080')

socket.addEventListener('message', onMessage)

function onMessage (event) {
  var message = event.data
  if (message === 'ready') {
    if (peer) return
    peer = new Peer({ initiator: true })
    peer.on('signal', function (signal) {
      socket.send(JSON.stringify(signal))
    })
    peer.on('connect', function () {
      endless.pipe(peer)
    })
  } else {
    peer.signal(JSON.parse(message))
  }
}
