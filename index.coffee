fs = require 'fs'
Lame = require 'lame'
Speaker = require 'speaker'
through = require 'through'

CHANNELS = 2
BIT_DEPTH = 16
FRAME_SIZE = BIT_DEPTH / 8 * CHANNELS
RATE = 44100
BYTE_PER_SEC = RATE * FRAME_SIZE
BYTE_PER_MSEC = BYTE_PER_SEC / 1000
# Maximum accepted deviation from ideal timing
EPSILON_MS = 20
EPSILON_BYTES = EPSILON_MS * BYTE_PER_MSEC

resample = (chunk, newLength) ->
  # 1 — do not change
  # return chunk

  #2 - original method, pad / drop
  # correctedChunk = new Buffer(newLength)
  # correctedChunk.fill(0)
  # chunk.copy(correctedChunk)
  # return correctedChunk


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


timeKeeper = (start) ->
  actualBytes = 0
  chunkCount = 0

  return through (chunk) ->
    now = Date.now()
    # Initialise start at the first chunk of data
    if not start?
      start = now

    # Derive the bytes that should have been processed if there was no time skew
    idealBytes = (now - start) * BYTE_PER_MSEC

    chunkCount += 1
    console.log "#{chunkCount * 1000 / (now - start)} chunks / sec"

    diffBytes = actualBytes - idealBytes
    chunkLength = chunk.length
    actualBytes += chunkLength
    console.log('Time deviation:', (diffBytes / BYTE_PER_MSEC).toFixed(2) + 'ms')

    # The buffer size should be a multiple of 4
    diffBytes = diffBytes - (diffBytes % 4)

    # Only correct the stream if we're out of the EPSILON region
    if -EPSILON_BYTES < diffBytes < EPSILON_BYTES
      correctedChunk = chunk
    else
      console.log('Epsilon exceeded! correcting')
      correctedChunk = resample(chunk, chunk.length + diffBytes)

    @queue(correctedChunk)


# Play a demo song
speaker = new Speaker
  channels: CHANNELS
  bitDepth: BIT_DEPTH
  sampleRate: RATE

start = Date.now() - 10000
fs.createReadStream(__dirname + '/utopia.mp3')
  .pipe(new Lame.Decoder())
  .pipe(timeKeeper())
  .pipe(speaker)
