var common = require('./common')
var Peer = require('../')
var test = require('tape')

var getUserMedia = typeof navigator !== 'undefined' && (
  navigator.webkitGetUserMedia && function ( options, fulfill, reject ) {
    // Create a fake stream
    var stream = new webkitMediaStream()
    Object.defineProperty(stream, 'active', { value: true })

    fulfill( stream )
  } ||
  navigator.mozGetUserMedia && function ( options, fulfill, reject ) {
    options.fake = true
    navigator.mozGetUserMedia( options, fulfill, reject )
  } ||
  navigator.getUserMedia
)

var mediaStream
test('fetch fake media stream', function (t) {
  getUserMedia({ video: true, audio: true },
    function ( stream ) {
      mediaStream = stream
      t.end()
    },
    function ( err ) {
      t.fail( 'error fetching mediaStream' )
      t.end()
    }
  )
})

var config
test('get config', function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err)
    config = _config
    t.end()
  })
})

var debug = console.log.bind( console )

test('renegotiation with fake stream', function (t) {
  var peer1 = new Peer({ config: config, wrtc: common.wrtc, trickle: false, initiator: true })
  var peer2 = new Peer({ config: config, wrtc: common.wrtc, trickle: false })

  peer1.on('signal', function (data) {
    t.pass( 'signal from peer1' )
    peer2.signal(data)
  })

  peer2.on('signal', function (data) {
    t.pass( 'signal from peer2' )
    peer1.signal(data)
  })

  peer1.once( 'connect', bothConnected )
  peer2.once( 'connect', bothConnected )

  function bothConnected () {
    t.pass( 'peer connected' )

    if (
      ! peer1.connected ||
      ! peer2.connected
    ) return false

    t.pass( 'both connected' )

    peer1.once( 'negotiated', renegotiated )

    // Inject stream on peer1
    peer1.addStream( mediaStream )
  }

  function renegotiated () {
    t.pass( 'negotiated emited' )

    t.ok( peer1.connected )
    t.ok( peer2.connected )
    t.end()
  }

})
