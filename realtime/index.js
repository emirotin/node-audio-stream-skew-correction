(function () {
  'use strict';

  var eio = require("engine.io-client");
  var Rickshaw = require('./rickshaw');

  // helper

  function $(id) { return document.getElementById(id); }

  // chart

  var data = [{ x: 0, y: 0 }];

  var graph = new Rickshaw.Graph({
    element: $("chart"),
    width: 1200,
    height: 400,
    renderer: 'line',
    min: 'auto',
    //max: 700,
    x_min: -1000,
    x_max: 120000,
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
