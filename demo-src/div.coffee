resample = require('./resample')

graph = new Rickshaw.Graph
  element: document.querySelector("#chart")
  width: 1200
  height: 400
  renderer: 'line'
  series: [{
    data: require('./id.json')
    color: 'red'
  }, {
    data: require('./zero.json')
    color: 'green'
  }, {
    data: require('./interpolate.json')
    color: 'blue'
  }]


xAxis = new Rickshaw.Graph.Axis.X
  graph: graph
yAxis = new Rickshaw.Graph.Axis.Y
  graph: graph

graph.render()
#xAxis.render()
