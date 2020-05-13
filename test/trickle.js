var common = require('./common')
var Peer = require('../')
var test = require('tape')

var config
test('get config', function (t) {
  common.getConfig(function (err, _config) {
    if (err) return t.fail(err)
    config = _config
    t.end()
  })
})

test('disable trickle', function (t) {
  t.plan(8)

  var peer1 = new Peer({ config, initiator: true, trickle: false, wrtc: common.wrtc })
  var peer2 = new Peer({ config, trickle: false, wrtc: common.wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    peer2.signal(data)
  })

  var numSignal2 = 0
  peer2.on('signal', function (data) {
    numSignal2 += 1
    peer1.signal(data)
  })

  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    t.equal(numSignal1, 1, 'only one `signal` event')
    t.equal(numSignal2, 1, 'only one `signal` event')
    t.equal(peer1.initiator, true, 'peer1 is initiator')
    t.equal(peer2.initiator, false, 'peer2 is not initiator')

    peer1.send('sup peer2')
    peer2.on('data', function (data) {
      t.equal(data.toString(), 'sup peer2', 'got correct message')

      peer2.send('sup peer1')
      peer1.on('data', function (data) {
        t.equal(data.toString(), 'sup peer1', 'got correct message')

        peer1.on('close', function () { t.pass('peer1 destroyed') })
        peer1.destroy()
        peer2.on('close', function () { t.pass('peer2 destroyed') })
        peer2.destroy()
      })
    })
  }
})

test('disable trickle (only initiator)', function (t) {
  t.plan(8)

  var peer1 = new Peer({ config, initiator: true, trickle: false, wrtc: common.wrtc })
  var peer2 = new Peer({ config, wrtc: common.wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    peer2.signal(data)
  })

  var numSignal2 = 0
  peer2.on('signal', function (data) {
    numSignal2 += 1
    peer1.signal(data)
  })

  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    t.equal(numSignal1, 1, 'only one `signal` event for initiator')
    t.ok(numSignal2 >= 1, 'at least one `signal` event for receiver')
    t.equal(peer1.initiator, true, 'peer1 is initiator')
    t.equal(peer2.initiator, false, 'peer2 is not initiator')

    peer1.send('sup peer2')
    peer2.on('data', function (data) {
      t.equal(data.toString(), 'sup peer2', 'got correct message')

      peer2.send('sup peer1')
      peer1.on('data', function (data) {
        t.equal(data.toString(), 'sup peer1', 'got correct message')

        peer1.on('close', function () { t.pass('peer1 destroyed') })
        peer1.destroy()
        peer2.on('close', function () { t.pass('peer2 destroyed') })
        peer2.destroy()
      })
    })
  }
})

test('disable trickle (only receiver)', function (t) {
  t.plan(8)

  var peer1 = new Peer({ config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config, trickle: false, wrtc: common.wrtc })

  var numSignal1 = 0
  peer1.on('signal', function (data) {
    numSignal1 += 1
    peer2.signal(data)
  })

  var numSignal2 = 0
  peer2.on('signal', function (data) {
    numSignal2 += 1
    peer1.signal(data)
  })

  peer1.on('connect', tryTest)
  peer2.on('connect', tryTest)

  function tryTest () {
    if (!peer1.connected || !peer2.connected) return

    t.ok(numSignal1 >= 1, 'at least one `signal` event for initiator')
    t.equal(numSignal2, 1, 'only one `signal` event for receiver')
    t.equal(peer1.initiator, true, 'peer1 is initiator')
    t.equal(peer2.initiator, false, 'peer2 is not initiator')

    peer1.send('sup peer2')
    peer2.on('data', function (data) {
      t.equal(data.toString(), 'sup peer2', 'got correct message')

      peer2.send('sup peer1')
      peer1.on('data', function (data) {
        t.equal(data.toString(), 'sup peer1', 'got correct message')

        peer1.on('close', function () { t.pass('peer1 destroyed') })
        peer1.destroy()
        peer2.on('close', function () { t.pass('peer2 destroyed') })
        peer2.destroy()
      })
    })
  }
})

test('null end candidate does not throw', function (t) {
  const peer1 = new Peer({ trickle: true, config, initiator: true, wrtc: common.wrtc })
  const peer2 = new Peer({ trickle: true, config, wrtc: common.wrtc })

  // translate all falsey candidates to null
  let endCandidateSent = false
  function endToNull (data) {
    if (data.candidate && !data.candidate.candidate) {
      data.candidate.candidate = null
      endCandidateSent = true
    }
    return data
  }

  peer1.on('error', () => t.fail('peer1 threw error'))
  peer2.on('error', () => t.fail('peer2 threw error'))

  peer1.on('signal', data => peer2.signal(endToNull(data)))
  peer2.on('signal', data => peer1.signal(endToNull(data)))

  peer1.on('connect', () => {
    if (!endCandidateSent) { // force an end candidate to browsers that don't send them
      peer1.signal({ candidate: { candidate: null, sdpMLineIndex: 0, sdpMid: '0' } })
      peer2.signal({ candidate: { candidate: null, sdpMLineIndex: 0, sdpMid: '0' } })
    }
    t.pass('connected')
    t.end()
  })
})

test('empty-string end candidate does not throw', function (t) {
  var peer1 = new Peer({ trickle: true, config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ trickle: true, config, wrtc: common.wrtc })

  // translate all falsey candidates to null
  let endCandidateSent = false
  function endToEmptyString (data) {
    if (data.candidate && !data.candidate.candidate) {
      data.candidate.candidate = ''
      endCandidateSent = true
    }
    return data
  }

  peer1.on('error', () => t.fail('peer1 threw error'))
  peer2.on('error', () => t.fail('peer2 threw error'))

  peer1.on('signal', data => peer2.signal(endToEmptyString(data)))
  peer2.on('signal', data => peer1.signal(endToEmptyString(data)))

  peer1.on('connect', () => {
    if (!endCandidateSent) { // force an end candidate to browsers that don't send them
      peer1.signal({ candidate: { candidate: '', sdpMLineIndex: 0, sdpMid: '0' } })
      peer2.signal({ candidate: { candidate: '', sdpMLineIndex: 0, sdpMid: '0' } })
    }
    t.pass('connected')
    t.end()
  })
})

test('mDNS candidate does not throw', function (t) {
  var peer1 = new Peer({ trickle: true, config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ trickle: true, config, wrtc: common.wrtc })

  peer1.on('error', () => t.fail('peer1 threw error'))
  peer2.on('error', () => t.fail('peer2 threw error'))

  peer1.on('signal', data => peer2.signal(data))
  peer2.on('signal', data => peer1.signal(data))

  peer1.on('connect', () => {
    // force an mDNS candidate to browsers that don't send them
    const candidate = 'candidate:2053030672 1 udp 2113937151 ede93942-fbc5-4323-9b73-169de626e467.local 55741 typ host generation 0 ufrag HNmH network-cost 999'
    peer1.signal({ candidate: { candidate, sdpMLineIndex: 0, sdpMid: '0' } })
    peer2.signal({ candidate: { candidate, sdpMLineIndex: 0, sdpMid: '0' } })
    t.pass('connected')
    t.end()
  })
})

test('ice candidates received before description', function (t) {
  t.plan(3)

  var peer1 = new Peer({ config, initiator: true, wrtc: common.wrtc })
  var peer2 = new Peer({ config, wrtc: common.wrtc })

  var signalQueue1 = []
  peer1.on('signal', function (data) {
    signalQueue1.push(data)
    if (data.candidate) {
      while (signalQueue1[0]) peer2.signal(signalQueue1.pop())
    }
  })

  var signalQueue2 = []
  peer2.on('signal', function (data) {
    signalQueue2.push(data)
    if (data.candidate) {
      while (signalQueue2[0]) peer1.signal(signalQueue2.pop())
    }
  })

  peer1.on('connect', function () {
    t.pass('peers connected')

    peer2.on('connect', function () {
      peer1.on('close', function () { t.pass('peer1 destroyed') })
      peer1.destroy()
      peer2.on('close', function () { t.pass('peer2 destroyed') })
      peer2.destroy()
    })
  })
})
