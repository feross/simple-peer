var get = require('simple-get')
var thunky = require('thunky')
var Peer = require('../')

exports.getConfig = thunky(function (cb) {
  // Includes TURN -- needed for tests to pass on Sauce Labs
  // https://github.com/feross/simple-peer/issues/41
  get.concat('https://instant.io/rtcConfig', function (err, data) {
    if (err) return cb(err)
    data = data.toString()
    try {
      data = JSON.parse(data)
    } catch (err) {
      cb(err)
      return
    }
    cb(null, data)
  })
})

// For testing on node, you'll need a WebRTC implementation
// Feel free to substitute in another implementation
if (Peer.USING_WRTC) {
  exports.wrtc = require('wrtc')
}
