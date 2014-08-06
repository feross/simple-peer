# simple-peer [![travis](https://img.shields.io/travis/feross/simple-peer.svg)](https://travis-ci.org/feross/simple-peer) [![npm](https://img.shields.io/npm/v/simple-peer.svg)](https://npmjs.org/package/simple-peer) [![gittip](https://img.shields.io/gittip/feross.svg)](https://www.gittip.com/feross/) [![Sauce Test Status](https://saucelabs.com/browser-matrix/feross-simple-peer.svg)](https://saucelabs.com/u/feross-simple-peer)

#### Simple one-to-one WebRTC video/audio and data channels

## features

- simple API for working with [WebRTC](https://en.wikipedia.org/wiki/WebRTC)
  - vastly simpler signaling process!
    1. handle the `peer.on('signal')` event
    2. send data to remote peer
    3. call `peer.signal(data)`
  - you're done!
- supports video/voice streams
- supports data channel
  - can treat data channel as a [node.js stream](http://nodejs.org/api/stream.html)
- supports advanced options like:
  - enable/disable [trickle ICE candidates](http://webrtchacks.com/trickle-ice/)
  - manually set config and constraints options

## install

```
npm install simple-peer
```

## example

This example creates two peers in the same page.

In a real-world application, the sender and receiver Peer objects would exist in separate browsers. A "signaling server" that can exchange messages between a WebRTC client running in one browser and a client in another browser would be used to help the peers get connected.

```js
var peer1 = new Peer({ initiator: true })
var peer2 = new Peer()

peer1.on('signal', function (data) {
  peer2.signal(data)
})

peer2.on('signal', function (data) {
  peer1.signal(data)
})

peer1.on('ready', function () {
  peer1.send('hey peer2, how is it going?')
  // wait for 'ready' event before using the data channel
})

peer2.on('message', function (data) {
  console.log('got a message from peer1: ' + data)
})
```

Video/voice is also super simple!

In this example, peer1 sends video to peer2.

```js
// get video/voice stream
navigator.getUserMedia({ video: true, audio: true }, gotMedia, function () {})

function gotMedia (stream) {
  var peer1 = new Peer({ initiator: true, stream: stream })
  var peer2 = new Peer()

  peer1.on('signal', function (data) {
    peer2.signal(data)
  })

  peer2.on('signal', function (data) {
    peer1.signal(data)
  })

  peer2.on('stream', function (stream) {
    // got remote video stream, show it in the page
    var video = document.querySelector('video')
    video.src = window.URL.createObjectURL(stream)
    video.play()
  })
}

For two-way video, simply pass a `stream` option into both `Peer` constructors. Simple!

```

## usage

### `peer = new Peer(opts)`

Create a new WebRTC peer connection.

A data channel for text/binary data communication will always be established. To establish video/voice communication, pass the `stream` option.

If `opts` is specified, then the default options (shown below) will be overridden.

```
{
  initiator: false,
  stream: false,
  config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
  constraints: {},
  channelName: 'simple-peer-<random string>',
  trickle: true
}
```

The options do the following:

- `initiator` - set to true if this is the initiating peer
- `stream` - if video/voice is desired, pass stream returned from `getUserMedia`
- `config` - custom webrtc configuration
- `constraints` - custom webrtc video/voice constaints
- `channelName` - custom webrtc data channel name
- `trickle` - set to `false` to disable [trickle ICE](http://webrtchacks.com/trickle-ice/) and get a single 'signal' event (slower)

### `peer.signal(data)`

Call this method whenever the remote peer emits a `peer.on('signal')` event.

The `data` will be a `String` that encapsulates a webrtc offer, answer, or ice candidate. These messages help the peers to eventually establish a direct connection to each other. The contents of these strings are an implementation detail that can be ignored by the user of this module; simply pass the data from 'signal' events to the remote peer, call `peer.signal(data)`, and everything will just work.

### `peer.send(data)`

Send text/binary data to the remote peer. `data` can be any of several types: `String`, `Buffer` (see [buffer](https://github.com/feross/buffer)), TypedArrayView (Uint8Array, etc.), or ArrayBuffer.

Note: this method should not be called until the `peer.on('ready')` event has fired.

### `peer.destroy([onclose])`

Destroy and cleanup this peer connection.

If the optional `onclose` paramter is passed, then it will be registered as a listener on the 'close' event.

### `stream = peer.getDataStream()`

Returns a duplex stream which reads/writes to the data channel.

Very handy for treating the data channel just like any other node.js stream!


## events

### `peer.on('ready', function () {})`

Fired when the peer connection and data channel are ready to use.

### `peer.on('signal', function (data) {})`

Fired when the peer wants to send signaling data to the remote peer.

**It is the responsibility of the application developer (that's you!) to get this data to the other peer.** This usually entails using a websocket signaling server. Then, simply call `peer.signal(data)` on the remote peer.

### `peer.on('message', function (data) {})`

Received a message from the remote peer (via the data channel).

`data` will be either a `String` or a `Buffer` (see [buffer](https://github.com/feross/buffer)).

### `peer.on('close', function () {})

Called when the peer connection has closed.

### `peer.on('error', function (err) {})

Fired when a fatal error occurs. Usually, this means bad signaling data was received from the remote peer.

`err` is an `Error` object.

## real-world usage

- [lxjs-chat](https://github.com/feross/lxjs-chat) - Omegle chat clone
- [instant.io](https://github.com/feross/instant.io) - Secure, anonymous, streaming file transfer
- add your application here! send a PR!

## license

MIT. Copyright (c) [Feross Aboukhadijeh](http://feross.org).
