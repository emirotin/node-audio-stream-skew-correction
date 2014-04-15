# Playground to try different algorithms

## Test interpolation formula
1) run `./build.sh` packages client-side code (`demo-src/graph.coffee`) and shared code (`lib/resample.coffee`)
into `demo/graph-built.js`
2) open `demo/graph.html`

## Static divergence data snapshot
1) run `./gen-data.sh` - runs the program with different time keeping strategies, saves data to `graph-data/`
2) run `./build.sh` packages client-side code (`demo-src/div.coffee`), shared code (`lib/resample.coffee`) and data JSON files
into `demo/div-built.js`
3) open `demo/div.html`

If you change algorithms, re-run steps 1-2. If you change only client-side code, re-run step 2.

## Real-Time Graph

It's a way to quickly check how the new algorithm works.

Run `node index [M]`, it opens the browser, watch.

`M` can be
- _(empty)_ — for running without changing the stream
- `z` — for original zero padding / chunk dropping algorithm
- `i` — for linear interpolation
- whatever you add to, see `index.coffee` and `lib/*.coffee`.
