# simple-peer [![travis](https://img.shields.io/travis/feross/simple-peer.svg)](https://travis-ci.org/feross/simple-peer) [![npm](https://img.shields.io/npm/v/simple-peer.svg)](https://npmjs.org/package/simple-peer) [![gittip](https://img.shields.io/gittip/feross.svg)](https://www.gittip.com/feross/)

### Simple one-to-one WebRTC video/audio and data channels

[![Sauce Test Status](https://saucelabs.com/browser-matrix/feross-simple-peer.svg)](https://saucelabs.com/u/feross-simple-peer)

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

## usage

TODO. For now, take a look at `test/basic.js` or [lxjs-chat](https://github.com/feross/lxjs-chat) for usage examples.

## Turns this:

![before](https://raw.githubusercontent.com/feross/simple-peer/master/slide1.png)

#### (^ and that's video/audio only. Data channels methods/events not shown...)

## Into this:

![after](https://raw.githubusercontent.com/feross/simple-peer/master/slide2.png)

#### Much nicer, right?

## license

MIT. Copyright (c) [Feross Aboukhadijeh](http://feross.org).
