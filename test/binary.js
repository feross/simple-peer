const common = require("./common");
const WebRTCPeer = require("../");
const test = require("tape");

const { config } = common;

test("data send/receive Buffer", function (t) {
  t.plan(6);

  const peer1 = new WebRTCPeer({ config, initiator: true, wrtc: common.wrtc });
  const peer2 = new WebRTCPeer({ config, wrtc: common.wrtc });
  peer1.on("signal", function (data) {
    peer2.signal(data);
  });
  peer2.on("signal", function (data) {
    peer1.signal(data);
  });
  peer1.on("connect", tryTest);
  peer2.on("connect", tryTest);

  function tryTest() {
    if (!peer1.connected || !peer2.connected) return;

    peer1.send(Buffer.from([0, 1, 2]));
    peer2.on("data", function (data) {
      t.ok(Buffer.isBuffer(data), "data is Buffer");
      t.deepEqual(data, Buffer.from([0, 1, 2]), "got correct message");

      peer2.send(Buffer.from([0, 2, 4]));
      peer1.on("data", function (data) {
        t.ok(Buffer.isBuffer(data), "data is Buffer");
        t.deepEqual(data, Buffer.from([0, 2, 4]), "got correct message");

        peer1.on("close", function () {
          t.pass("peer1 destroyed");
        });
        peer1.destroy();
        peer2.on("close", function () {
          t.pass("peer2 destroyed");
        });
        peer2.destroy();
      });
    });
  }
});

test("data send/receive Uint8Array", function (t) {
  t.plan(6);

  const peer1 = new WebRTCPeer({ config, initiator: true, wrtc: common.wrtc });
  const peer2 = new WebRTCPeer({ config, wrtc: common.wrtc });
  peer1.on("signal", function (data) {
    peer2.signal(data);
  });
  peer2.on("signal", function (data) {
    peer1.signal(data);
  });
  peer1.on("connect", tryTest);
  peer2.on("connect", tryTest);

  function tryTest() {
    if (!peer1.connected || !peer2.connected) return;

    peer1.send(new Uint8Array([0, 1, 2]));
    peer2.on("data", function (data) {
      // binary types always get converted to Buffer
      // See: https://github.com/feross/simple-peer/issues/138#issuecomment-278240571
      t.ok(Buffer.isBuffer(data), "data is Buffer");
      t.deepEqual(data, Buffer.from([0, 1, 2]), "got correct message");

      peer2.send(new Uint8Array([0, 2, 4]));
      peer1.on("data", function (data) {
        t.ok(Buffer.isBuffer(data), "data is Buffer");
        t.deepEqual(data, Buffer.from([0, 2, 4]), "got correct message");

        peer1.on("close", function () {
          t.pass("peer1 destroyed");
        });
        peer1.destroy();
        peer2.on("close", function () {
          t.pass("peer2 destroyed");
        });
        peer2.destroy();
      });
    });
  }
});

test("data send/receive ArrayBuffer", function (t) {
  t.plan(6);

  const peer1 = new WebRTCPeer({ config, initiator: true, wrtc: common.wrtc });
  const peer2 = new WebRTCPeer({ config, wrtc: common.wrtc });
  peer1.on("signal", function (data) {
    peer2.signal(data);
  });
  peer2.on("signal", function (data) {
    peer1.signal(data);
  });
  peer1.on("connect", tryTest);
  peer2.on("connect", tryTest);

  function tryTest() {
    if (!peer1.connected || !peer2.connected) return;

    peer1.send(new Uint8Array([0, 1, 2]).buffer);
    peer2.on("data", function (data) {
      t.ok(Buffer.isBuffer(data), "data is Buffer");
      t.deepEqual(data, Buffer.from([0, 1, 2]), "got correct message");

      peer2.send(new Uint8Array([0, 2, 4]).buffer);
      peer1.on("data", function (data) {
        t.ok(Buffer.isBuffer(data), "data is Buffer");
        t.deepEqual(data, Buffer.from([0, 2, 4]), "got correct message");

        peer1.on("close", function () {
          t.pass("peer1 destroyed");
        });
        peer1.destroy();
        peer2.on("close", function () {
          t.pass("peer2 destroyed");
        });
        peer2.destroy();
      });
    });
  }
});
