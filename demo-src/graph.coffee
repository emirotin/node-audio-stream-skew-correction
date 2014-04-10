resample = require('./resample')
common = require('./common')

originalLength = 100
newLength = 117

data1 = common.createBuffer originalLength, (i) ->
  Math.sqrt(i) + Math.cos(i * Math.PI / 20) | 0

data2 = resample.interpolate(data1, newLength * 2, 1)

graph = new Rickshaw.Graph
  element: document.querySelector("#chart")
  width: 800
  height: 400
  renderer: 'line'
  series: [{
    data: common.formatData(data1),
    color: 'red'
  }, {
    data: common.formatData(data2),
    color: '#9cc1e0'
  }]

graph.render()
