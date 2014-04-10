fs = require 'fs'
Lame = require 'lame'
Speaker = require 'speaker'
through = require 'through'

{interpolate} = require('./resample')

CHANNELS = 2
BIT_DEPTH = 16
FRAME_SIZE = BIT_DEPTH / 8 * CHANNELS
RATE = 44100
BYTE_PER_SEC = RATE * FRAME_SIZE
BYTE_PER_MSEC = BYTE_PER_SEC / 1000
# Maximum accepted deviation from ideal timing
EPSILON_MS = 20
EPSILON_BYTES = EPSILON_MS * BYTE_PER_MSEC



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

    # Only correct the stream if we're out of the EPSILON region
    if -EPSILON_BYTES < diffBytes < EPSILON_BYTES
      correctedChunk = chunk
    else
      console.log('Epsilon exceeded! correcting')
      # The buffer size should be a multiple of 4
      diffBytes = diffBytes - (diffBytes % 4)
      correctedChunk = interpolate(chunk, chunk.length + diffBytes, CHANNELS)

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
