#!/bin/sh
COFFEE_FILES="lib/*.coffee demo-src/*.coffee"
BROWSERIFY_FILES="graph div"
browserify=./node_modules/.bin/browserify
coffee=./node_modules/.bin/coffee

rm -rf tmp
for f in $COFFEE_FILES
do
  $coffee -o tmp -c $f
done

cp graph-data/*.json tmp/

for f in $BROWSERIFY_FILES
do
  $browserify tmp/$f.js > demo/$f-built.js
done
