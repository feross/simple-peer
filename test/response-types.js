const common = require("./common");
const getMediaStream = require("./common").getMediaStream;
const Peer = require("../");
const test = require("tape");

let config;
test("get config", function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err);
    config = _config;
    t.end();
  });
});

test("adds sender and replace promise", function (t) {
  t.plan(5);

  const peer1 = new Peer({
    config,
    initiator: true,
    wrtc: common.wrtc,
  });
  const peer2 = new Peer({
    config,
    wrtc: common.wrtc,
  });

  peer1.on("signal", function (data) {
    if (data.renegotiate) t.fail("got unexpected request to renegotiate");
    if (!peer2.destroyed) peer2.signal(data);
  });
  peer2.on("signal", function (data) {
    if (data.renegotiate) t.fail("got unexpected request to renegotiate");
    if (!peer1.destroyed) peer1.signal(data);
  });

  peer1.on("connect", function () {
    const stream = getMediaStream();
    const track = stream.getTracks()[0];

    // Test with stream object
    const sender = peer1.addTrack(track, stream);

    t.equal(
      Object.prototype.toString.call(sender),
      "[object RTCRtpSender]",
      "sender is of RTCRtpSender type"
    );

    const track2 = track.clone();

    // Test without required parameter
    t.throws(
      () => {
        peer1.addTrack(track2);
      },
      {
        message: "Stream is a required parameter",
      }
    );

    const replacePromise = peer1.replaceTrack(track, track2, stream);

    t.equal(
      Object.prototype.toString.call(replacePromise),
      "[object Promise]",
      "replacePromise is of Promise type"
    );

    // Test without required parameter
    t.throws(
      () => {
        peer1.removeTrack(track2);
      },
      {
        message: "Stream is a required parameter",
      }
    );

    t.equal(
      peer1.removeTrack(track, stream),
      undefined,
      "removeTrack returns nothing"
    );
  });
});
