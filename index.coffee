fs = require 'fs'
Lame = require 'lame'
Speaker = require 'speaker'
through2 = require 'through2'
through2Map = require("through2-map")
Throttle = require('throttle')

CHANNELS = 2
BIT_DEPTH = 16
FRAME_SIZE = BIT_DEPTH / 8 * CHANNELS
RATE = 44100
BYTE_PER_SEC = RATE * FRAME_SIZE
BYTE_PER_MSEC = RATE / 1000
# Maximum accepted deviation from ideal timing
EPSILON_MS = 20
EPSILON_BYTES = EPSILON_MS * BYTE_PER_MSEC

resample = (chunk, newLength) ->
  correctedChunk = new Buffer(newLength)
  correctedChunk.fill(0)
  chunk.copy(correctedChunk)
  return correctedChunk

  if newLength <= 0
    return new Buffer(0)

  chunkLength = chunk.length
  ###
  # separate channels and convert bytes to ints
  channels = (new Int16Array(chunkLength / 4) for i in [0...CHANNELS])
  for j in [0...chunkLength / 4]
    for i in [0...CHANNELS]
      channels[i][j] = chunk.readInt16LE((j * 2 + i) * 2)

  # recombine
  newChunk = new Buffer(chunkLength)
  for j in [0...chunkLength / 4]
    for i in [0...CHANNELS]
      newChunk.writeInt16LE(channels[i][j], (j * 2 + i) * 2)

  newChunk
  ###

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
  # State variables
  actualBytes = 0

  # The actual stream processing function
  return through2 (chunk, enc, callback) ->
    now = Date.now()
    # Initialise start at the first chunk of data
    start or= now

    # Derive the bytes that should have been processed if there was no time skew
    idealBytes = (now - start) * BYTE_PER_MSEC

    diffBytes = actualBytes - idealBytes

    diffMsec = diffBytes / BYTE_PER_MSEC
    console.log('Time deviation:', diffMsec.toFixed(2) + 'ms')

    # Only correct the stream if we're out of the EPSILON region
    if Math.abs(diffMsec) < EPSILON_MS
      correctedChunk = chunk
    else
      console.log('Epsilon exceeded! correcting')
      diffBytes = diffBytes - (diffBytes % 4)
      correctedChunk = resample(chunk, chunk.length + diffBytes)
      console.log chunk.length, correctedChunk.length

    @push(correctedChunk)
    callback()

    actualBytes += chunk.length

# Play a demo song
speaker = new Speaker
  channels: CHANNELS
  bitDepth: BIT_DEPTH
  sampleRate: RATE


start = Date.now() - 10000
fs.createReadStream(__dirname + '/utopia.mp3')
  .pipe(new Lame.Decoder())
  .pipe(timeKeeper(start))
  .pipe(speaker)
