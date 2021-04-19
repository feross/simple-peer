const get = require("simple-get");
const thunky = require("thunky");
const bowser = require("bowser");

exports.getConfig = thunky(function (cb) {
  // Includes TURN -- needed for tests to pass on Sauce Labs
  // https://github.com/feross/simple-peer/issues/41
  // WARNING: This is *NOT* a public endpoint. Do not depend on it in your app.
  get.concat("https://instant.io/__rtcConfig__", function (err, res, data) {
    /**
     * Example data:
     *
     * {
     *   "comment": "WARNING: This is *NOT* a public endpoint. Do not depend on it in your app",
     *   "rtcConfig": {
     *     "iceServers": [
     *       {
     *         "urls": [
     *           "stun:relay.socket.dev:443"
     *         ]
     *       },
     *       {
     *         "urls": [
     *           "turn:relay.socket.dev:443?transport=udp",
     *           "turn:relay.socket.dev:443?transport=tcp",
     *           "turns:relay.socket.dev:443?transport=tcp"
     *         ],
     *         "username": "relay.socket.dev",
     *         "credential": "tears-whiplash-overall-diction"
     *       }
     *     ],
     *     "sdpSemantics": "unified-plan",
     *     "bundlePolicy": "max-bundle",
     *     "iceCandidatePoolsize": 1
     *   }
     * }
     */

    if (err) return cb(err);
    data = data.toString();
    try {
      data = JSON.parse(data);
    } catch (err) {
      cb(err);
      return;
    }
    cb(null, data);
  });
});

// For testing on node, we must provide a WebRTC implementation
if (process.env.WRTC === "wrtc") {
  exports.wrtc = require("wrtc");
}

// create a test MediaStream with two tracks
let canvas;
exports.getMediaStream = function () {
  if (exports.wrtc) {
    const source = new exports.wrtc.nonstandard.RTCVideoSource();
    const tracks = [source.createTrack(), source.createTrack()];
    return new exports.wrtc.MediaStream(tracks);
  } else {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = canvas.height = 100;
      canvas.getContext("2d"); // initialize canvas
    }
    const stream = canvas.captureStream(30);
    stream.addTrack(stream.getTracks()[0].clone()); // should have 2 tracks
    return stream;
  }
};

exports.isBrowser = function (name) {
  if (typeof window === "undefined") return false;
  const satifyObject = {};
  if (name === "ios") {
    // bowser can't directly name iOS Safari
    satifyObject.mobile = { safari: ">=0" };
  } else {
    satifyObject[name] = ">=0";
  }
  return bowser.getParser(window.navigator.userAgent).satisfies(satifyObject);
};
