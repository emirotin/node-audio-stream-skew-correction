module.exports.id = (chunk, newLength, CHANNELS) ->
  # 1 — do not change
  return chunk

module.exports.zeropad = (chunk, newLength, CHANNELS) ->
  #2 - original method, pad / drop
  correctedChunk = new Buffer(newLength)
  correctedChunk.fill(0)
  chunk.copy(correctedChunk)
  return correctedChunk

module.exports.interpolate = (chunk, newLength, CHANNELS) ->
  # 3 - linear interpolation

  if newLength <= 0
    return new Buffer(0)

  chunkLength = chunk.length

  n = chunkLength / 4 - 1
  m = newLength / 4 - 1
  newChunk = new Buffer(newLength)
  z = 0
  for i in [0...m]
    t = i / m
    k = t * n | 0
    mu = t * n - k
    for c in [0...CHANNELS]
      xPrev = chunk.readInt16LE((k * 2 + c) * 2)
      xNext = chunk.readInt16LE(((k + 1) * 2 + c) * 2)
      interpolated = xNext * mu + xPrev * (1 - mu) | 0
      newChunk.writeInt16LE(interpolated, z)
      z += 2
  chunk.copy(newChunk, newLength - 4, chunkLength - 4)

  newChunk
