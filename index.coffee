#start = Date.now() - 10000
start = null
require('./lib/player').play(process.argv[2], start)
