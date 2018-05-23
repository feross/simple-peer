module.exports = function (size) {
  var array = new Uint8Array(size)
  window.crypto.getRandomValues(array)
  return array
}
