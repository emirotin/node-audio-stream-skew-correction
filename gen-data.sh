#!/bin/sh
MODES="id zero interpolate"
coffee=./node_modules/.bin/coffee

rm tmp/*.json
rm -rf graph-data
for m in $MODES
do
  $coffee index.coffee $m
done

mkdir graph-data
cp tmp/*.json graph-data/
