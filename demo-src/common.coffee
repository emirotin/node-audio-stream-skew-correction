exports.formatData = (buffer) ->
  n = buffer.length / 2 - 1
  res = new Array(n + 1)
  for i in [0..n]
    res[i] =
      x: i / n
      y: buffer.readInt16LE(i * 2)
  res

exports.createBuffer = (n, generator) ->
  res = new Buffer(n * 2)
  for i in [0...n]
    res.writeInt16LE(generator(i), i * 2)
  res
