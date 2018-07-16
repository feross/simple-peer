var get = require('simple-get')
var thunky = require('thunky')

exports.getConfig = thunky(function (cb) {
  // Includes TURN -- needed for tests to pass on Sauce Labs
  // https://github.com/feross/simple-peer/issues/41
  // WARNING: This is *NOT* a public endpoint. Do not depend on it in your app.
  get.concat('https://instant.io/__rtcConfig__', function (err, res, data) {
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

// create a test MediaStream with two tracks
var audioContext
exports.getMediaStream = function () {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)()
  var oscillator = audioContext.createOscillator()
  var dst = audioContext.createMediaStreamDestination()
  oscillator.connect(dst)
  oscillator.start()

  var oscillator2 = audioContext.createOscillator()
  var dst2 = audioContext.createMediaStreamDestination()
  oscillator2.connect(dst2)
  oscillator2.start()

  var track = dst2.stream.getTracks()[0]
  dst.stream.addTrack(track)
  return dst.stream
}
