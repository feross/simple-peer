[![ci][ci-image]][ci-url] [![coveralls][coveralls-image]][coveralls-url] [![virtual-device-testing][sauce-image]][sauce-url]

[ci-image]: https://img.shields.io/github/workflow/status/jzombie/webrtc-peer/ci/master
[ci-url]: https://github.com/jzombie/webrtc-peer/actions
[coveralls-image]: https://coveralls.io/repos/github/feross/simple-peer/badge.svg?branch=master
[coveralls-url]: https://coveralls.io/github/feross/simple-peer?branch=master
[sauce-image]: https://saucelabs.com/buildstatus/zenosmosis
[sauce-url]: https://saucelabs.com/u/zenosmosis

# webrtc-peer

*Simple WebRTC video, voice, and data channels.*

A fork of [simple-peer](https://github.com/feross/simple-peer), webrtc-peer tries to stay a little closer to mainline WebRTC spec by using the same return types as the WebRTC spec and also utilizes [webrtc-adapter](https://github.com/webrtcHacks/adapter) to help iron out some connection reliability issues.

It is also utilized in the reference application, [Speaker App](https://speaker.app).

## Features

- concise, **node.js style** API for [WebRTC](https://en.wikipedia.org/wiki/WebRTC)
- **works in node and the browser!**
- supports **video/voice streams**
- supports **data channel**
  - text and binary data
  - node.js [duplex stream](http://nodejs.org/api/stream.html) interface
- supports advanced options like:
  - enable/disable [trickle ICE candidates](http://webrtchacks.com/trickle-ice/)
  - manually set config options
  - transceivers and renegotiation

## Table of Contents
- [webrtc-peer](#webrtc-peer)
  - [Features](#features)
  - [Table of Contents](#table-of-contents)
  - [Install](#install)
  - [Testing](#testing)
  - [Usage](#usage)
    - [Data Channels](#data-channels)
    - [Video / Voice](#video--voice)
    - [Dynamic Video / Voice](#dynamic-video--voice)
    - [In Node](#in-node)
  - [API](#api)
    - [`peer = new Peer([opts])`](#peer--new-peeropts)
    - [`peer.signal(data)`](#peersignaldata)
    - [`peer.send(data)`](#peersenddata)
    - [`peer.addStream(stream)`](#peeraddstreamstream)
    - [`peer.removeStream(stream)`](#peerremovestreamstream)
    - [`peer.addTrack(track, stream)`](#peeraddtracktrack-stream)
    - [`peer.removeTrack(track, stream)`](#peerremovetracktrack-stream)
    - [`peer.replaceTrack(oldTrack, newTrack, stream)`](#peerreplacetrackoldtrack-newtrack-stream)
    - [`peer.addTransceiver(kind, init)`](#peeraddtransceiverkind-init)
    - [`peer.destroy([err])`](#peerdestroyerr)
    - [`Peer.WEBRTC_SUPPORT`](#peerwebrtc_support)
    - [Duplex Stream](#duplex-stream)
    - [`peer.on('signal', data => {})`](#peeronsignal-data--)
    - [`peer.on('connect', () => {})`](#peeronconnect---)
    - [`peer.on('data', data => {})`](#peerondata-data--)
    - [`peer.on('stream', stream => {})`](#peeronstream-stream--)
    - [`peer.on('track', (track, stream) => {})`](#peerontrack-track-stream--)
    - [`peer.on('close', () => {})`](#peeronclose---)
    - [`peer.on('error', (err) => {})`](#peeronerror-err--)
  - [Connecting more than 2 peers?](#connecting-more-than-2-peers)
      - [Peer 1](#peer-1)
      - [Peer 2](#peer-2)
      - [Peer 3](#peer-3)
  - [Troubleshooting](#troubleshooting)
    - [Memory Usage](#memory-usage)
    - [Connection does not work on some networks?](#connection-does-not-work-on-some-networks)
  - [License](#license)

## Install

TODO: Update

```
npm install simple-peer
```

This package works in the browser with [browserify](https://browserify.org). If
you do not use a bundler, you can use the `webrtc-peer.min.js` standalone script
directly in a `<script>` tag. This exports a `WebRTCPeer` constructor on
`window`. Wherever you see `Peer` in the examples below, substitute that with
`WebRTCPeer`.

## Testing

We're using [SauceLabs](https://saucelabs.com) to do testing across the latest major browsers and platforms.

[![Testing Powered By SauceLabs](https://opensource.saucelabs.com/images/opensauce/powered-by-saucelabs-badge-red.png?sanitize=true "Testing Powered By SauceLabs")](https://saucelabs.com)

Note, at this time, due to an apparent bug with airtap-sauce version 4.0.3 in that it runs Android 6.0 instead of the actual latest version, so we're using airtap 3.0.0 to get around it, which also requires the usage of Sauce Connect Proxy when on a private network.  Airtap-sauce is required for 4+ due to refactoring of airtap.

- [Download](https://wiki.saucelabs.com/display/DOCS/Sauce+Connect+Proxy) the correct version of Sauce Connect Proxy for your operating system
- Extract the contents
- Start the proxy and wait for it to notify that it is okay to start testing

```bash
$ cd {SAUCE_CONNECT_PROXY_DIR}/bin
$ ./sc -u {SAUCE_USERNAME} -k {SAUCE_ACCESS_KEY}
```

- Run remote tests

While the proxy is running in another terminal session, in another terminal session located at this project's root

```bash
$ npm run test-browser # Or npm run test
```

## Usage

### Data Channels

```js
var Peer = require('simple-peer')

var peer1 = new Peer({ initiator: true })
var peer2 = new Peer()

peer1.on('signal', data => {
  // when peer1 has signaling data, give it to peer2 somehow
  peer2.signal(data)
})

peer2.on('signal', data => {
  // when peer2 has signaling data, give it to peer1 somehow
  peer1.signal(data)
})

peer1.on('connect', () => {
  // wait for 'connect' event before using the data channel
  peer1.send('hey peer2, how is it going?')
})

peer2.on('data', data => {
  // got a data channel message
  console.log('got a message from peer1: ' + data)
})
```

### Video / Voice

Video/voice is also super simple! In this example, peer1 sends video to peer2.

```js
var Peer = require('simple-peer')

// get video/voice stream
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(gotMedia).catch(() => {})

function gotMedia (stream) {
  var peer1 = new Peer({ initiator: true, stream: stream })
  var peer2 = new Peer()

  peer1.on('signal', data => {
    peer2.signal(data)
  })

  peer2.on('signal', data => {
    peer1.signal(data)
  })

  peer2.on('stream', stream => {
    // got remote video stream, now let's show it in a video tag
    var video = document.querySelector('video')

    if ('srcObject' in video) {
      video.srcObject = stream
    } else {
      video.src = window.URL.createObjectURL(stream) // for older browsers
    }

    video.play()
  })
}
```

For two-way video, simply pass a `stream` option into both `Peer` constructors. Simple!

Please notice that `getUserMedia` only works in [pages loaded via **https**](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#Encryption_based_security).

### Dynamic Video / Voice

It is also possible to establish a data-only connection at first, and later add
a video/voice stream, if desired.

```js
var Peer = require('simple-peer') // create peer without waiting for media

var peer1 = new Peer({ initiator: true }) // you don't need streams here
var peer2 = new Peer()

peer1.on('signal', data => {
  peer2.signal(data)
})

peer2.on('signal', data => {
  peer1.signal(data)
})

peer2.on('stream', stream => {
  // got remote video stream, now let's show it in a video tag
  var video = document.querySelector('video')

  if ('srcObject' in video) {
    video.srcObject = stream
  } else {
    video.src = window.URL.createObjectURL(stream) // for older browsers
  }

  video.play()
})

function addMedia (stream) {
  peer1.addStream(stream) // <- add streams to peer dynamically
}

// then, anytime later...
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(addMedia).catch(() => {})
```

### In Node

TODO: Remove?

To use this library in node, pass in `opts.wrtc` as a parameter (see [the constructor options](#peer--new-peeropts)):

```js
var Peer = require('simple-peer')
var wrtc = require('wrtc')

var peer1 = new Peer({ initiator: true, wrtc: wrtc })
var peer2 = new Peer({ wrtc: wrtc })
```

## API

### `peer = new Peer([opts])`

Create a new WebRTC peer connection.

A "data channel" for text/binary communication is always established, because it's cheap and often useful. For video/voice communication, pass the `stream` option.

If `opts` is specified, then the default options (shown below) will be overridden.

```
{
  initiator: false,
  channelConfig: {},
  channelName: '<random string>',
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }] },
  offerOptions: {},
  answerOptions: {},
  sdpTransform: function (sdp) { return sdp },
  stream: false,
  streams: [],
  trickle: true,
  allowHalfTrickle: false,
  wrtc: {}, // RTCPeerConnection/RTCSessionDescription/RTCIceCandidate
  objectMode: false
}
```

The options do the following:

- `initiator` - set to `true` if this is the initiating peer
- `channelConfig` - custom webrtc data channel configuration (used by [`createDataChannel`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel))
- `channelName` - custom webrtc data channel name
- `config` - custom webrtc configuration (used by [`RTCPeerConnection`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection) constructor)
- `offerOptions` - custom offer options (used by [`createOffer`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer) method)
- `answerOptions` - custom answer options (used by [`createAnswer`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createAnswer) method)
- `sdpTransform` - function to transform the generated SDP signaling data (for advanced users)
- `stream` - if video/voice is desired, pass stream returned from [`getUserMedia`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- `streams` - an array of MediaStreams returned from [`getUserMedia`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- `trickle` - set to `false` to disable [trickle ICE](http://webrtchacks.com/trickle-ice/) and get a single 'signal' event (slower)
- `wrtc` - custom webrtc implementation, mainly useful in node to specify in the [wrtc](https://npmjs.com/package/wrtc) package. Contains an object with the properties:
  - [`RTCPeerConnection`](https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection)
  - [`RTCSessionDescription`](https://www.w3.org/TR/webrtc/#dom-rtcsessiondescription)
  - [`RTCIceCandidate`](https://www.w3.org/TR/webrtc/#dom-rtcicecandidate)

- `objectMode` - set to `true` to create the stream in [Object Mode](https://nodejs.org/api/stream.html#stream_object_mode). In this mode, incoming string data is not automatically converted to `Buffer` objects.

### `peer.signal(data)`

Call this method whenever the remote peer emits a `peer.on('signal')` event.

The `data` will encapsulate a webrtc offer, answer, or ice candidate. These messages help
the peers to eventually establish a direct connection to each other. The contents of these
strings are an implementation detail that can be ignored by the user of this module;
simply pass the data from 'signal' events to the remote peer and call `peer.signal(data)`
to get connected.

### `peer.send(data)`

Send text/binary data to the remote peer. `data` can be any of several types: `String`,
`Buffer` (see [buffer](https://github.com/feross/buffer)), `ArrayBufferView` (`Uint8Array`,
etc.), `ArrayBuffer`, or `Blob` (in browsers that support it).

Note: If this method is called before the `peer.on('connect')` event has fired, then an exception will be thrown. Use `peer.write(data)` (which is inherited from the node.js [duplex stream](http://nodejs.org/api/stream.html) interface) if you want this data to be buffered instead.

### `peer.addStream(stream)`

Add a `MediaStream` to the connection.

### `peer.removeStream(stream)`

Remove a `MediaStream` from the connection.

### `peer.addTrack(track, stream)`

Add a `MediaStreamTrack` to the connection. Must also pass the `MediaStream` you want to attach it to.

### `peer.removeTrack(track, stream)`

Remove a `MediaStreamTrack` from the connection. Must also pass the `MediaStream` that it was attached to.

### `peer.replaceTrack(oldTrack, newTrack, stream)`

Replace a `MediaStreamTrack` with another track. Must also pass the `MediaStream` that the old track was attached to.

### `peer.addTransceiver(kind, init)`

Add a `RTCRtpTransceiver` to the connection. Can be used to add transceivers before adding tracks. Automatically called as neccesary by `addTrack`.

### `peer.destroy([err])`

Destroy and cleanup this peer connection.

If the optional `err` parameter is passed, then it will be emitted as an `'error'`
event on the stream.

### `Peer.WEBRTC_SUPPORT`

Detect native WebRTC support in the javascript environment.

```js
var Peer = require('simple-peer')

if (Peer.WEBRTC_SUPPORT) {
  // webrtc support!
} else {
  // fallback
}
```

### Duplex Stream

`Peer` objects are instances of `stream.Duplex`. They behave very similarly to a
`net.Socket` from the node core `net` module. The duplex stream reads/writes to the data
channel.

```js
var peer = new Peer(opts)
// ... signaling ...
peer.write(new Buffer('hey'))
peer.on('data', function (chunk) {
  console.log('got a chunk', chunk)
})
```

### `peer.on('signal', data => {})`

Fired when the peer wants to send signaling data to the remote peer.

**It is the responsibility of the application developer (that's you!) to get this data to
the other peer.** This usually entails using a websocket signaling server. This data is an
`Object`, so  remember to call `JSON.stringify(data)` to serialize it first. Then, simply
call `peer.signal(data)` on the remote peer.

(Be sure to listen to this event immediately to avoid missing it. For `initiator: true`
peers, it fires right away. For `initatior: false` peers, it fires when the remote
offer is received.)

### `peer.on('connect', () => {})`

Fired when the peer connection and data channel are ready to use.

### `peer.on('data', data => {})`

Received a message from the remote peer (via the data channel).

`data` will be either a `String` or a `Buffer/Uint8Array` (see [buffer](https://github.com/feross/buffer)).

### `peer.on('stream', stream => {})`

Received a remote video stream, which can be displayed in a video tag:

```js
peer.on('stream', stream => {
  var video = document.querySelector('video')
  if ('srcObject' in video) {
    video.srcObject = stream
  } else {
    video.src = window.URL.createObjectURL(stream)
  }
  video.play()
})
```

### `peer.on('track', (track, stream) => {})`

Received a remote audio/video track. Streams may contain multiple tracks.

### `peer.on('close', () => {})`

Called when the peer connection has closed.

### `peer.on('error', (err) => {})`

Fired when a fatal error occurs. Usually, this means bad signaling data was received from the remote peer.

`err` is an `Error` object.

## Connecting more than 2 peers?

The simplest way to do that is to create a full-mesh topology. That means that every peer
opens a connection to every other peer. To illustrate:

![full mesh topology](img/full-mesh.png)

To broadcast a message, just iterate over all the peers and call `peer.send`.

So, say you have 3 peers. Then, when a peer wants to send some data it must send it 2
times, once to each of the other peers. So you're going to want to be a bit careful about
the size of the data you send.

Full mesh topologies don't scale well when the number of peers is very large. The total
number of edges in the network will be ![full mesh formula](img/full-mesh-formula.png)
where `n` is the number of peers.

For clarity, here is the code to connect 3 peers together:

#### Peer 1

```js
// These are peer1's connections to peer2 and peer3
var peer2 = new Peer({ initiator: true })
var peer3 = new Peer({ initiator: true })

peer2.on('signal', data => {
  // send this signaling data to peer2 somehow
})

peer2.on('connect', () => {
  peer2.send('hi peer2, this is peer1')
})

peer2.on('data', data => {
  console.log('got a message from peer2: ' + data)
})

peer3.on('signal', data => {
  // send this signaling data to peer3 somehow
})

peer3.on('connect', () => {
  peer3.send('hi peer3, this is peer1')
})

peer3.on('data', data => {
  console.log('got a message from peer3: ' + data)
})
```

#### Peer 2

```js
// These are peer2's connections to peer1 and peer3
var peer1 = new Peer()
var peer3 = new Peer({ initiator: true })

peer1.on('signal', data => {
  // send this signaling data to peer1 somehow
})

peer1.on('connect', () => {
  peer1.send('hi peer1, this is peer2')
})

peer1.on('data', data => {
  console.log('got a message from peer1: ' + data)
})

peer3.on('signal', data => {
  // send this signaling data to peer3 somehow
})

peer3.on('connect', () => {
  peer3.send('hi peer3, this is peer2')
})

peer3.on('data', data => {
  console.log('got a message from peer3: ' + data)
})
```

#### Peer 3

```js
// These are peer3's connections to peer1 and peer2
var peer1 = new Peer()
var peer2 = new Peer()

peer1.on('signal', data => {
  // send this signaling data to peer1 somehow
})

peer1.on('connect', () => {
  peer1.send('hi peer1, this is peer3')
})

peer1.on('data', data => {
  console.log('got a message from peer1: ' + data)
})

peer2.on('signal', data => {
  // send this signaling data to peer2 somehow
})

peer2.on('connect', () => {
  peer2.send('hi peer2, this is peer3')
})

peer2.on('data', data => {
  console.log('got a message from peer2: ' + data)
})
```

## Troubleshooting

### Memory Usage

If you call `peer.send(buf)`, `simple-peer` is not keeping a reference to `buf`
and sending the buffer at some later point in time. We immediately call
`channel.send()` on the data channel. So it should be fine to mutate the buffer
right afterward.

However, beware that `peer.write(buf)` (a writable stream method) does not have
the same contract. It will potentially buffer the data and call
`channel.send()` at a future point in time, so definitely don't assume it's
safe to mutate the buffer.


### Connection does not work on some networks?

If a direct connection fails, in particular, because of NAT traversal and/or firewalls,
WebRTC ICE uses an intermediary (relay) TURN server. In other words, ICE will first use
STUN with UDP to directly connect peers and, if that fails, will fall back to a TURN relay
server.

In order to use a TURN server, you must specify the `config` option to the `Peer`
constructor. See the API docs above.

## License

MIT. Copyright (c) [Feross Aboukhadijeh](http://feross.org).
