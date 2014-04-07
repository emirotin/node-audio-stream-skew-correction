fs = require 'fs'
Lame = require 'lame'
Speaker = require 'speaker'
through2 = require 'through2'

CHANNELS = 2
BIT_DEPTH = 16
RATE = 44100
BYTE_PER_SEC = RATE * BIT_DEPTH / 8 * CHANNELS
BYTE_PER_MSEC = BYTE_PER_SEC / 1000
# Maximum accepted deviation from ideal timing
EPSILON_MS = 20
EPSILON_MS_SKIP = 1000

resample = (data, addValues)->
  correctedChunk = new Buffer(data.length + addValues)
  correctedChunk.fill(0)
  data.copy(correctedChunk)
  correctedChunk

timeKeeper = (start) ->
  # State variables
  actualBytes = 0

  initialSkip = true

  # The actual stream processing function
  return through2 (chunk, enc, callback) ->
    now = Date.now()
    # Initialise start at the first chunk of data
    if not start?
      start = now

    # Derive the bytes that should have been processed if there was no time skew
    td = now - start
    idealBytes = td * BYTE_PER_MSEC

    diffBytes = actualBytes - idealBytes
    diffMsec = diffBytes / BYTE_PER_MSEC
    console.log('Time deviation:', diffMsec.toFixed(2) + 'ms')

    diffMsec = Math.abs(diffMsec)

    # Only correct the stream if we're out of the EPSILON region
    if diffMsec < EPSILON_MS
      correctedChunk = chunk
      initialSkip = false
    else
      console.log('Epsilon exceeded! correcting')
      if initialSkip and diffMsec > EPSILON_MS_SKIP
        console.log 'INITIAL SKIP'
        correctedChunk = new Buffer(0)
      else
        initialSkip = false
        # we only fix a proportional part of divergence
        if actualBytes
          diffBytes *= chunk.length / actualBytes
        # The buffer size should be a multiple of 4
        diffBytes = diffBytes - (diffBytes % 4)
        console.log 'Fixing', (diffBytes / BYTE_PER_MSEC).toFixed(2), 'ms'
        correctedChunk = resample(chunk, diffBytes)

    @push(correctedChunk)
    callback()

    actualBytes += chunk.length


# Play a demo song
speaker = new Speaker
  channels: CHANNELS
  bitDepth: BIT_DEPTH
  sampleRate: RATE

fs.createReadStream(__dirname + '/utopia.mp3')
  .pipe(new Lame.Decoder())
  .pipe(timeKeeper(Date.now())) #
  .pipe(speaker)
