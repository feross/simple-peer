// This test file runs after all the others. This is where we can run the cleanup
// code that is required for the electron-webrtc

var common = require('./common')
var test = require('tape')

test('cleanup', function (t) {
  // Shut down the electron-webrtc daemon
  if (process.env.WRTC === 'electron-webrtc') {
    common.wrtc.close()
  }
  t.end()
})
