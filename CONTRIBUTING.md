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

The data structures are already general — see `DOCUMENTATION.md` §3 (storage model) and
§14 ("v2.3 — More scales"). Adding a scale is data only, with no code changes: two
additions to `src/scale.js`.

**1. The interval pattern**, as semitone offsets from the root, in `SCALES`:

```js
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],   // for example
};
```

(And a root pitch in `ROOT_PITCH` if the scale starts on a new note.)

**2. A fingering entry per hand** in `FINGERINGS`. Note that this is **not** a
one-octave array — a one-octave array cannot be tiled, because the finger on the root
changes depending on where in the run that root falls. Instead each hand stores a
repeating cycle plus the two notes that break it:

```js
export const FINGERINGS = {
  C: { major: {
    RH: { cycle: [1, 2, 3, 1, 2, 3, 4], first: 1, last: 5 },
    LH: { cycle: [1, 4, 3, 2, 1, 3, 2], first: 5, last: 1 },
  }},
};
```

| Field | Meaning |
|---|---|
| `cycle` | The finger used on each scale degree when passing **through** it mid-run. One entry per degree, so 7 for a diatonic scale. Index 0 is the root. |
| `first` | The finger on the lowest note of the whole run, where it differs from `cycle[0]` — as it does for LH (5, not the thumb). |
| `last` | The finger on the highest note of the whole run, where it differs from `cycle[0]` — as it does for RH (5, not the thumb). |

The thing to get right is `cycle[0]`: it is the finger for the root **at an octave
boundary mid-run**, which for both hands in C major is the thumb. Putting the terminal
finger there instead is the bug this model was introduced to fix — it silently erased a
real thumb crossing from the analysis. There are tests covering exactly this; run them.

Worked examples for scales that break the pattern differently, including B flat major
(whose root is a black key the thumb never plays, so `first`, `cycle[0]` and `last` are
three different values), are in `QA.md` batch 2.

Everything else — sequence folding, fingering expansion, crossing derivation, every
metric — is derived. Nothing else in the codebase needs to change.

Two limits of the model to know before you pick a scale, both recorded in
`DOCUMENTATION.md` §14: the descent is assumed to reuse the ascending fingering
reversed, and there is one cycle per hand per scale, so a fingering that changes between
octaves beyond the `first`/`last` overrides cannot be expressed yet.

## Commit style

Descriptive messages, no fixed format enforced. If a commit changes behavior a player
would notice, say what changed and why in the body, not just the summary line.
