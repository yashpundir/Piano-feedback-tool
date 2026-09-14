# Scale Practice Feedback

Browser MIDI scale-practice scorer. Plain HTML/CSS/JS, ES modules, no build step,
no dependencies — matches the spec's "zero install, static site" requirement.

## Run it locally

Web MIDI requires a secure context, but `localhost` is exempt from the HTTPS
requirement, so any static file server works. This machine has no Node or
working Python, so pick whichever of these you have:

```bash
# Ruby (present on stock macOS)
ruby -run -e httpd . -p 8000

# Node, if you install it
npx serve .

# Python, if you install it
python3 -m http.server 8000
```

Then open `http://localhost:8000` in Chrome.

## Deploy

Push this directory to a GitHub repo and enable GitHub Pages (or drag the
folder into Netlify). No build step — it serves as-is.

## What's implemented

All of §1–§4 and §6–§7, and all of build order phases 1–4 plus most of phase 5:

- MIDI connection, device picker, live raw event log (`src/midi.js`, run screen)
- Expected-sequence generation for C major, 1–4 octaves (`src/scale.js`)
- Hand separation — see note below (`src/metrics.js`)
- All §4 metrics: timing decomposition, note correctness (greedy aligner),
  dynamics shape/range/reversals/lumpiness, hand sync, thumb-crossing bumps,
  legato, hand balance, pedal detection (`src/metrics.js`, `src/run.js`)
- Report UI: sub-metric bars, per-note strip, velocity chart with ideal
  overlay, prioritised plain-English findings (`src/ui.js`, `src/findings.js`)
- `localStorage` history, JSON export, jitter sparkline (`src/storage.js`)

Deliberately not implemented, per spec: other scales/modes, calibrated
composite score, Needleman–Wunsch alignment — all explicitly marked v2,
and the composite score explicitly needs real player data to calibrate
before it can mean anything.

## One deviation from the spec worth flagging

§3 specifies hand separation by a single fixed pitch threshold (midpoint
between the lowest expected LH and RH note). §9.1 flags this as unverified
and asks to check it against real playing before hardcoding it — and it
doesn't hold up: at the default config (2 octaves, 12-semitone hand
interval), the right hand's range is root..root+24 and the left hand's is
root-12..root+12, so the top octave of the left hand's climb (up to
root+12) overlaps the bottom of the right hand's (from root). A fixed
threshold misclassifies every note in that overlap.

Instead, `splitHandsByOnset` in `src/metrics.js` clusters near-simultaneous
note-ons (hands play together, so each beat produces one LH and one RH onset
within a fraction of a beat of each other) and takes the lower pitch in each
pair as the left hand. The fixed threshold is kept as the fallback for the
rare cluster that isn't a clean pair. Verified against a synthetic run
spanning the full overlapping range — correctness came back at 100%, where
the fixed threshold would have misclassified 21 of the 29 left-hand notes
(every one at or above MIDI 54), leaving a left stream of 8 events against a
right stream of 50.

Full derivation in [DOCUMENTATION.md](DOCUMENTATION.md#6-hand-separation).

## Testing

`test/index.html` is a persisted test suite (no framework, runs the same way the app
does — open it via the local server above). It covers scale generation, fingering,
note alignment, and the full `analyzeRun` pipeline against synthetic MIDI events,
including a regression guard for the hand-overlap issue above. See
[DOCUMENTATION.md §16](DOCUMENTATION.md#16-testing) for the full list of cases.

No physical MIDI keyboard was available in this environment, so nothing here has been
verified against real hardware or a real player. Worth doing a hands-on-keyboard pass
before trusting this for practice — especially the hand-separation clustering window
(currently `clamp(T × 0.5, 40ms, 200ms)`), which synthetic data can't fully stress-test
against a real player's hand-sync spread.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
