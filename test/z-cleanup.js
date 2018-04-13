// This test file runs after all the others. This is where we can run the cleanup
// code that is required for the electron-webrtc

var test = require('tape')

test('cleanup', function (t) {
  // Shut down the process and any daemons
  t.end()
  if (process && process.exit) {
    process.exit(0)
  }
})
