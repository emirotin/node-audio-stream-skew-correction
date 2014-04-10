#!/bin/sh
COFFEE_FILES="lib/*.coffee demo-src/*.coffee"
BROWSERIFY_FILES="graph"
browserify=./node_modules/.bin/browserify

rm -rf tmp
for f in $COFFEE_FILES
do
  coffee -o tmp -c $f
done

for f in $BROWSERIFY_FILES
do
  $browserify tmp/$f.js > demo/$f-built.js
done
