# Scale Practice Feedback

A browser tool that listens to a digital piano over MIDI, scores a two-hand scale
exercise, and tells you **where** in the run each fault happened — note by note.

No install, no account, no backend. Plain HTML/CSS/JS with ES modules and zero
dependencies; it serves as-is from any static host.

## Why

Three things go wrong in scale practice that you cannot hear from the bench:

- **Hand synchronisation.** A consistent 10–15 ms lag between the hands is inaudible as a
  discrete event, but it is exactly what makes a scale sound smeared rather than clean.
- **A consistently heavy finger.** The thumb is heavier than the others and tends to
  thump on crossings, but any finger can be the culprit — a weak fourth is just as common.
  Because the crescendo is *supposed* to be rising, one finger landing harder than its
  neighbours sounds plausible and passes unnoticed.
- **Dynamic shape.** "Start soft, grow to the top, come back symmetrically" is easy to say
  and hard to verify. Players routinely believe they played a smooth crescendo when they
  played three jumps and a dip.

MIDI reports every onset, release and key velocity to the millisecond, so all three are
directly measurable even though none are audible.

## What you need

- A digital piano connected by USB
- **Chrome, Edge or Opera.** Safari has never shipped Web MIDI; iOS and iPadOS are
  unsupported in every browser, since they all use WebKit underneath. Firefox works with
  the site-permission add-on.

## Run it locally

Web MIDI needs a secure context, but `localhost` is exempt from the HTTPS requirement, so
any static file server works:

```bash
ruby -run -e httpd . -p 8000     # ships with macOS
npx serve .                      # if you have Node
python3 -m http.server 8000      # if you have Python
```

- App: <http://localhost:8000>
- Tests: <http://localhost:8000/test/>

## Deploy

Push to a GitHub repo and enable GitHub Pages, or drag the folder into Netlify. There is
no build step and nothing to configure. HTTPS is the only hard requirement — Web MIDI
refuses to run without it.

## Status

Working today: MIDI capture and device picking, C major in 1–4 octaves, and the full
metric set — timing (tempo offset, drift, jitter, per hand and combined), note accuracy
by edit-distance alignment, dynamics (shape, range, reversals, lumpiness), hand
synchronisation, per-note velocity and timing residuals, legato, hand balance and
sustain-pedal detection. The report gives sub-metric bars, a per-note strip, a velocity chart against
the ideal shape, prioritised plain-English findings, and `localStorage` history with JSON
export.

Deliberately **not** built yet: scales other than C major, Needleman–Wunsch alignment,
and a calibrated 0–100 composite score. The last one is blocked on data, not code —
converting metrics in different units onto one scale needs anchor points, and those are a
judgement about what counts as good playing that needs real runs from real players.

Honest caveats, with more in `DOCUMENTATION.md` §13 and §15:

- The metrics' colour thresholds are informed guesses, not calibrated against real players.
- Hand separation by onset clustering has not been validated against a player whose hands
  are badly out of sync — the case it is most likely to get wrong.
- The metronome setting exists in the UI but produces no sound yet.

## Documentation

| File | What's in it |
|---|---|
| `DOCUMENTATION.md` | The main reference: objective, architecture, **every metric written out in full maths**, the report UI, data model, code map, status and roadmap |
| `QA.md` | A running log of questions asked about the design and the answers, including several bugs found by asking them |
| `CONTRIBUTING.md` | How to run it, the one rule about keeping docs in step with code, and how to add a scale |

Start with `DOCUMENTATION.md` §7 if you want to understand the scoring; start with
`CONTRIBUTING.md` if you want to change something.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Adding a new scale is the
most self-contained starting point and needs no code changes, only two data entries.

Please run the test suite (`test/index.html`, look for `ALL PASS`) before opening a PR.
