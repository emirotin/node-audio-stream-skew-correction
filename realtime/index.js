(function () {
  'use strict';

  var eio = require("engine.io-client");

  // helper

  function $(id) { return document.getElementById(id); }

  // chart

  var data = [];

  var graph = new Rickshaw.Graph({
    element: $("chart"),
    width: 1200,
    height: 400,
    renderer: 'line',
    //min: -300,
    //max: 500,
    series: [{
      data: data,
      color: 'red'
    }]
  });

  var xAxis = new Rickshaw.Graph.Axis.X({
    graph: graph
  });
  var yAxis = new Rickshaw.Graph.Axis.Y({
    graph: graph
  });
  graph.render();

  // socket
  var socket = eio();
  socket.on('message', function (msg) {
    data.push(JSON.parse(msg));
    graph.update();
  });
}());
