// run in a browser and look at console for speed
//   beefy perf/receive.js

// 7.6MB

const prettierBytes = require('prettier-bytes')
const speedometer = require('speedometer')
const Peer = require('simple-peer')

const speed = speedometer()

let peer

const socket = new window.WebSocket('ws://localhost:8080')

socket.addEventListener('message', onMessage)

function onMessage (event) {
  const message = event.data
  if (message === 'ready') {
    if (peer) return
    peer = new Peer()
    peer.on('signal', function (signal) {
      socket.send(JSON.stringify(signal))
    })
    peer.on('data', function (message) {
      speed(message.length)
    })
  } else {
    peer.signal(JSON.parse(message))
  }
}

setInterval(function () {
  console.log(prettierBytes(speed()))
}, 1000)
