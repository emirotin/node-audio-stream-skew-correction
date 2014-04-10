#!/bin/sh
MODES="id zero interpolate"
coffee=./node_modules/.bin/coffee

rm tmp/*.json
for m in $MODES
do
  $coffee index.coffee $m
done

cp tmp/*.json graph-data/
