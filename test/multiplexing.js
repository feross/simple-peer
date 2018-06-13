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

test('create multiple DataChannels', function (t) {
  t.plan(4)
  var peer = new Peer()

  var dc1 = peer.createDataChannel('1', {}, {})
  var dc2 = peer.createDataChannel('2', {})
  var dc3 = peer.createDataChannel('3')
  var dc4 = peer.createDataChannel()

  t.assert(dc1)
  t.assert(dc2)
  t.assert(dc3)
  t.assert(dc4)
})