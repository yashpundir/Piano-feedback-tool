# Contributing

This is currently a one-person project; this file exists so that if someone else picks
it up later, they don't have to guess at the ground rules.

## Before changing anything

Read `DOCUMENTATION.md` first, not just `README.md`. The README tells you how to run
it; the documentation tells you why every metric is shaped the way it is. Several
things that look like bugs on first read are deliberate — e.g. the turnaround note is
scored like every other note on purpose (§7.1), and a flat velocity step counts as a
dynamics reversal on purpose (§7.3). If something looks wrong, check there before
"fixing" it.

## Running the app and the tests

No build step, no dependency install. Serve the directory with any static file server
and open it in Chrome:

```bash
ruby -run -e httpd . -p 8000      # ships with macOS
```

- App: `http://localhost:8000/`
- Tests: `http://localhost:8000/test/`

The test suite (`test/`) is plain HTML + ES modules, no test runner installed — it's
built to run the same way the app does. Open `test/index.html`, look for `ALL PASS` at
the top.

## The one rule

**If you change a metric's formula, a threshold, or how hands are separated, update
`DOCUMENTATION.md` in the same change.** That file is the spec now — if it drifts from
the code, the next person (possibly you, in six months) trusts the wrong thing.

Concretely: if you touch `src/metrics.js`, `src/scale.js`, or the thresholds in
`src/ui.js`/`src/findings.js`, check whether the corresponding section of
`DOCUMENTATION.md` (§7 for metrics, §8/§9 for thresholds) still describes what the code
does.

## Adding a test

`test/tests.js` uses a tiny local harness (`test/assert.js`) — no framework to learn.
Follow the existing pattern: build synthetic MIDI events with known properties, run them
through `analyzeRun` (or a lower-level function directly), assert the numbers that come
back match what you calculated by hand. Every module under test
(`stats.js`, `scale.js`, `metrics.js`, `run.js`) is pure — no DOM, no MIDI — specifically
so it can be tested this way without a browser doing anything except running JS.

## Adding a scale

The data structures are already general — see `DOCUMENTATION.md` §14 ("v2.3 — More
scales"). You need exactly two additions to `src/scale.js`: an interval array and a
one-octave fingering array per hand. Everything else — sequence folding, fingering
tiling, crossing derivation, every metric — is derived from those.

## Commit style

Descriptive messages, no fixed format enforced. If a commit changes behavior a player
would notice, say what changed and why in the body, not just the summary line.
