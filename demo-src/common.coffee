exports.formatArray = (array) ->
  n = array.length
  res = new Array(n)
  for y, i in array
    res[i] =
      x: i / n
      y: array[i]
  res

exports.bufferToArray = (buffer) ->
  n = buffer.length / 2 - 1
  res = new Array(n + 1)
  for i in [0..n]
    res[i] = buffer.readInt16LE(i * 2)
  res

exports.createBuffer = (n, generator) ->
  res = new Buffer(n * 2)
  for i in [0...n]
    res.writeInt16LE(generator(i), i * 2)
  res
