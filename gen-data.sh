#!/bin/sh
MODES="id zeropad interpolate"
coffee=./node_modules/.bin/coffee

mkdir graph-data
for m in $MODES
do
  rm graph-data/$m.json
  $coffee index.coffee $m
done
