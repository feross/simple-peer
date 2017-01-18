var get = require('simple-get')
var thunky = require('thunky')

exports.getConfig = thunky(function (cb) {
  // Includes TURN -- needed for tests to pass on Sauce Labs
  // https://github.com/feross/simple-peer/issues/41
  get.concat('https://instant.io/_rtcConfig', function (err, res, data) {
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

// For testing on node, we must provide a WebRTC implementation
if (process.env.WRTC === 'wrtc') {
  exports.wrtc = require('wrtc')
} else if (process.env.WRTC === 'electron-webrtc') {
  exports.wrtc = require('electron-webrtc')()

  exports.wrtc.on('error', function (err, source) {
    if (err.message !== 'Daemon already closed') {
      console.error(err, source)
    }
  })
}
