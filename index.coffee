fs = require 'fs'
Lame = require 'lame'
Speaker = require 'speaker'
through2 = require 'through2'

CHANNELS = 2
BIT_DEPTH = 16
RATE = 44100
BYTE_PER_MSEC = RATE * BIT_DEPTH / 8 * CHANNELS / 1000

timeKeeper = (start) ->
  # Maximum accepted deviation from ideal timing
  EPSILON_MS = 20
  EPSILON_BYTES = EPSILON_MS * BYTE_PER_MSEC

  # State variables
  actualBytes = 0

  # The actual stream processing function
  return through2 (chunk, enc, callback) ->
    now = Date.now()
    # Initialise start the at the first chunk of data
    if not start?
      start = now

    # Derive the bytes that should have been processed if there was no time skew
    idealBytes = (now - start) * BYTE_PER_MSEC

    diffBytes = actualBytes - idealBytes
    actualBytes += chunk.length
    setImmediate ->
      console.log('Time deviation:', (diffBytes / BYTE_PER_MSEC).toFixed(2) + 'ms')

    # The buffer size should be a multiple of 4
    diffBytes = diffBytes - (diffBytes % 4)

    # Only correct the stream if we're out of the EPSILON region
    if -EPSILON_BYTES < diffBytes < EPSILON_BYTES
      correctedChunk = chunk
    else
      setImmediate ->
        console.log('Epsilon exceeded! correcting')
      correctedChunk = new Buffer(chunk.length + diffBytes)
      chunk.copy(correctedChunk)

    @push(correctedChunk)
    callback()

# Play a demo song
speaker = new Speaker
  channels: CHANNELS
  bitDepth: BIT_DEPTH
  sampleRate: RATE

fs.createReadStream(__dirname + '/utopia.mp3')
  .pipe(new Lame.Decoder())
  .pipe(timeKeeper(Date.now() - 10000))
  .pipe(speaker)
