var get = require('simple-get')
var thunky = require('thunky')

exports.getConfig = thunky(function (cb) {
  // Includes TURN -- needed for tests to pass on Sauce Labs
  // https://github.com/feross/simple-peer/issues/41
  get.concat('https://instant.io/rtcConfig', function (err, res, data) {
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
// exports.wrtc = require('wrtc')
