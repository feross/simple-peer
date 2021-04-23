const bowser = require("bowser");

exports.config = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:global.stun.twilio.com:3478",
      ],
    },
  ],
  sdpSemantics: "unified-plan",
};

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
