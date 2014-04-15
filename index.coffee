express = require('express')
http = require('http')
enchilada = require('enchilada')
eio = require('engine.io')
freeport = require('freeport')
openurl = require('openurl')
Player = require('./lib/player')

PUBLIC_FOLDER = 'realtime'

expressContext = {}
socketClients = {}

expressApp = express()
httpServer = http.createServer(expressApp)
socketServer = eio.attach(httpServer)

expressApp.use(enchilada
  src: __dirname + '/' + PUBLIC_FOLDER
  debug: true
)
expressApp.set('views', PUBLIC_FOLDER)
#expressApp.set('view engine', 'ejs')
expressApp.use(express.static(__dirname + '/' + PUBLIC_FOLDER))
expressApp.get '/', (req, res, next) ->
  res.render('index.html')

socketServer.on 'connection', (socket) ->
  #socket.on('message', function(v){
  #  socket.send('pong');
  #});
  id = socket.id
  socketClients[id] = socket
  socket.on 'close', ->
    delete socketClients[id]

player = new Player()

freeport (err, port) ->
  if err
    console.error(err)
    process.exit(1)

  #expressContext.PORT = port
  addr = "http://localhost:#{port}"
  httpServer.listen port, ->
    console.log('listening on ' + addr)

  player.on 'data', (data) ->
    data = JSON.stringify(data)
    for id, socket of socketClients
      socket.send(data)

  setImmediate ->
    openurl.open(addr)

  setImmediate ->
    #start = Date.now() - 10000
    start = null
    player.play(process.argv[2], start)
