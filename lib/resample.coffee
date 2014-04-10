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

  SAMPLE_SIZE = 2 # bytes per Int16
  FRAME_SIZE = SAMPLE_SIZE * CHANNELS
  chunkLength = chunk.length

  n = chunkLength / FRAME_SIZE - 1
  m = newLength / FRAME_SIZE - 1
  newChunk = new Buffer(newLength)
  z = 0
  for i in [0...m]
    t = i / m
    k = t * n | 0
    mu = t * n - k
    for c in [0...CHANNELS]
      xPrev = chunk.readInt16LE(k * FRAME_SIZE + c * SAMPLE_SIZE)
      xNext = chunk.readInt16LE((k + 1) * FRAME_SIZE + c * SAMPLE_SIZE)
      interpolated = xNext * mu + xPrev * (1 - mu) | 0
      newChunk.writeInt16LE(interpolated, z)
      z += SAMPLE_SIZE
  chunk.copy(newChunk, newLength - FRAME_SIZE, chunkLength - FRAME_SIZE)

  newChunk
