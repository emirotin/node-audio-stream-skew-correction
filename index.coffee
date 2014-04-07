fs = require 'fs'
Lame = require 'lame'
Speaker = require 'speaker'
through2 = require 'through2'
dsp = require('digitalsignals')

CHANNELS = 2
BIT_DEPTH = 16
RATE = 44100
BYTE_PER_SEC = RATE * BIT_DEPTH / 8 * CHANNELS
BYTE_PER_MSEC = BYTE_PER_SEC / 1000
# Maximum accepted deviation from ideal timing
EPSILON_MS = 100
EPSILON_BYTES = EPSILON_MS * BYTE_PER_MSEC


resample = (originalData, newLength) ->
  if newLength <= 0
    return new Buffer(0)

  newData = new Buffer(newLength)
  n = originalData.length - 1
  m = newLength - 1

  for i in [1...m]
    t = i / m
    k = ~~(t * n)
    mu = t * n - k

    # linear interpolation
    #newData[i] = originalData[k] * (1 - mu) + originalData[k + 1] * mu

    # cosine interpolation
    mu2 = (1 - Math.cos(mu * Math.PI)) / 2
    newData[i] = originalData[k] * (1 - mu2) + originalData[k + 1] * mu2

  newData[0] = originalData[0]
  newData[m] = originalData[n]
  return newData


timeKeeper = (start) ->
  # State variables
  actualBytes = 0

  # The actual stream processing function
  return through2 (chunk, enc, callback) ->
    now = Date.now()
    # Initialise start at the first chunk of data
    if not start?
      start = now

    # Derive the bytes that should have been processed if there was no time skew
    idealBytes = (now - start) * BYTE_PER_MSEC

    diffBytes = actualBytes - idealBytes
    actualBytes += chunk.length
    setImmediate ->
      console.log('Time deviation:', (diffBytes / BYTE_PER_MSEC).toFixed(2) + 'ms')


    # Only correct the stream if we're out of the EPSILON region
    if -EPSILON_BYTES < diffBytes < EPSILON_BYTES
      correctedChunk = chunk
    else
      # we only fix a proportional part of divergence
      diffBytes = diffBytes * chunk.length / actualBytes
      # The buffer size should be a multiple of 4
      diffBytes = diffBytes - (diffBytes % 4)
      setImmediate ->
        console.log('Epsilon exceeded! correcting')
      correctedChunk = new Buffer(chunk.length + diffBytes)
      chunk.copy(correctedChunk)
      #correctedChunk = resample(chunk, chunk.length + diffBytes)

    @push(correctedChunk)
    callback()

# Play a demo song
speaker = new Speaker
  channels: CHANNELS
  bitDepth: BIT_DEPTH
  sampleRate: RATE

fs.createReadStream(__dirname + '/utopia.mp3')
  .pipe(new Lame.Decoder())
  .pipe(timeKeeper()) # Date.now() - 10000
  .pipe(speaker)
