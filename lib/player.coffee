fs = require 'fs'
Lame = require 'lame'
Speaker = require 'speaker'
through = require 'through'

resample = require('./resample')

CHANNELS = 2
BIT_DEPTH = 16
FRAME_SIZE = BIT_DEPTH / 8 * CHANNELS
RATE = 44100
BYTE_PER_SEC = RATE * FRAME_SIZE
BYTE_PER_MSEC = BYTE_PER_SEC / 1000
# Maximum accepted deviation from ideal timing
EPSILON_MS = 20
EPSILON_BYTES = EPSILON_MS * BYTE_PER_MSEC

divergenceLog = []
divergenceFile = null
resampleFn = null

timeKeeper = (start) ->
  actualBytes = 0
  chunkCount = 0

  return through (chunk) ->
    now = Date.now()
    # Initialise start at the first chunk of data
    if not start?
      start = now# - 300

    # Derive the bytes that should have been processed if there was no time skew
    dt = now - start
    idealBytes = dt * BYTE_PER_MSEC

    chunkCount += 1
    console.log "#{(chunkCount * 1000 / dt).toFixed(2)} chunks / sec"

    diffBytes = actualBytes - idealBytes
    chunkLength = chunk.length
    actualBytes += chunkLength


    diffMsec = diffBytes / BYTE_PER_MSEC
    console.log('Time deviation:', diffMsec.toFixed(2) + 'ms')
    divergenceLog.push(x: dt, y: diffMsec)
    #diffMsec += 300
    #diffBytes = diffMsec * BYTE_PER_MSEC

    # Only correct the stream if we're out of the EPSILON region
    if -EPSILON_BYTES < diffBytes < EPSILON_BYTES
      correctedChunk = chunk
    else
      console.log('Epsilon exceeded! correcting')
      # The buffer size should be a multiple of 4
      diffBytes = diffBytes - (diffBytes % FRAME_SIZE)
      correctedChunk = resampleFn(chunk, chunkLength + diffBytes, CHANNELS)

    @queue(correctedChunk)

module.exports.play = (resampleType, start) ->
  # Play a demo song
  speaker = new Speaker
    channels: CHANNELS
    bitDepth: BIT_DEPTH
    sampleRate: RATE

  resampleType = (resampleType or '').toLowerCase()
  knownTypes =
    zeropad: ['z', 'zeropad']
    interpolate: ['i', 'interp', 'interp']
  isKnownType = false
  for k, v of knownTypes
    if resampleType == k or resampleType in v
      resampleType = k
      isKnownType = true
  if not isKnownType
    resampleType = 'id'
  divergenceFile = "../graph-data/#{resampleType}.json"
  resampleFn = resample[resampleType]

  fs.createReadStream(__dirname + '/../utopia.mp3')
    .pipe(new Lame.Decoder())
    .pipe(timeKeeper(start))
    .pipe(speaker)

  speaker.on 'close', ->
    fs.writeFileSync divergenceFile, JSON.stringify(divergenceLog)
