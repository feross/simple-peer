const common = require("./common");
const getMediaStream = require("./common").getMediaStream;
const WebRTCPeer = require("../");
const test = require("tape");

let config;

test("get config", function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err);
    config = _config;
    t.end();
  });
});

test("tests various request / response types in the API calls", function (t) {
  t.plan(12);

  const peer1 = new WebRTCPeer({
    config,
    initiator: true,
    wrtc: common.wrtc,
  });

  const peer2 = new WebRTCPeer({
    config,
    wrtc: common.wrtc,
  });

  // TODO: Include a way to run these as a single function definition
  // (currently not able to because of other peer signaling)
  peer1.on("signal", function (data) {
    peer2.signal(data);
  });

  peer2.on("signal", function (data) {
    peer1.signal(data);
  });

  // Run the same tests on both peers
  [peer1, peer2].forEach(peer => {
    peer.on("connect", () => {
      const stream = getMediaStream();
      const track1 = stream.getTracks()[0];
      const track2 = stream.getTracks()[1];

      const sender = peer.addTrack(track1, stream);

      t.equal(
        Object.prototype.toString.call(sender),
        "[object RTCRtpSender]",
        "sender is of RTCRtpSender type"
      );

      // Missing stream should throw
      t.throws(
        () => {
          peer.addTrack(track2);
        },
        {
          message: "Stream is a required parameter",
        },
        "addTrack throws without stream parameter"
      );

      // Missing stream should throw
      peer
        .replaceTrack(track1, track2)
        .then(() => {
          // Not expected
          t.fail("replaceTrack should not succeed without a stream");
        })
        .catch(err => {
          // Expected
          t.ok(err, "replaceTrack throws without stream paramter");
        });

      const replacePromise = peer.replaceTrack(track1, track2, stream);

      t.equal(
        Object.prototype.toString.call(replacePromise),
        "[object Promise]",
        "replacePromise is of Promise type"
      );

      // Test without required parameter
      t.throws(
        () => {
          peer.removeTrack(track2);
        },
        {
          message: "Stream is a required parameter",
        },
        "removeTrack throws without stream parameter"
      );

      t.equal(
        peer.removeTrack(track2, stream),
        undefined,
        "removeTrack returns nothing"
      );
    });
  });
});
