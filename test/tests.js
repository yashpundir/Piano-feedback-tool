import { test, assert, assertEqual, assertClose } from "./assert.js";
import { generateSequence, generateFingering, deriveCrossings } from "../src/scale.js";
import { analyzeRun } from "../src/run.js";
import { linreg, mean } from "../src/stats.js";
import { idealRamp, alignGreedy } from "../src/metrics.js";

// ---------------------------------------------------------------------------
// Scale generation (§3 / DOCUMENTATION.md §3)
// ---------------------------------------------------------------------------

test("sequence generation: note count and peak index for 2 octaves", () => {
  const seq = generateSequence({ octaves: 2 });
  assertEqual(seq.N, 29, "N = 14n+1");
  assertEqual(seq.k, 14, "k = 7n");
  assertEqual(seq.RH.length, 29);
  assertEqual(seq.LH.length, 29);
});

test("sequence generation: top note is struck once, not twice", () => {
  const seq = generateSequence({ octaves: 2 });
  // index k is the top note; it should not repeat at k+1
  assert(seq.RH[seq.k] !== seq.RH[seq.k + 1], "top note repeated ascending into descending");
  assertEqual(seq.RH[seq.k], seq.RH[0] + 24, "top note is two octaves above root");
});

test("sequence generation: descending is the mirror of ascending", () => {
  const seq = generateSequence({ octaves: 2 });
  // note 1 step below the peak, ascending vs descending, should match
  assertEqual(seq.RH[seq.k - 1], seq.RH[seq.k + 1], "descending doesn't mirror ascending");
});

test("sequence generation: left hand is right hand minus the hand interval", () => {
  const seq = generateSequence({ octaves: 2, handInterval: 12 });
  for (let i = 0; i < seq.N; i++) {
    assertEqual(seq.LH[i], seq.RH[i] - 12, `note ${i}`);
  }
});

// ---------------------------------------------------------------------------
// Fingering and thumb crossings (§3)
// ---------------------------------------------------------------------------

test("fingering: RH crossings for 1 octave are the thumb-under (asc) and 3rd-over (desc)", () => {
  const fingerRH = generateFingering({ octaves: 1, hand: "RH" });
  const crossings = deriveCrossings(fingerRH);
  assertEqual(crossings.length, 2);
  assertEqual(crossings[0], 3, "ascending thumb crossing at F");
  assertEqual(crossings[1], 12, "descending crossing mirrors the ascending one");
});

test("fingering: LH and RH cross at different indices (they must be computed per hand)", () => {
  const crossRH = deriveCrossings(generateFingering({ octaves: 1, hand: "RH" }));
  const crossLH = deriveCrossings(generateFingering({ octaves: 1, hand: "LH" }));
  assert(JSON.stringify(crossRH) !== JSON.stringify(crossLH), "hands should not cross at the same notes");
});

// ---------------------------------------------------------------------------
// Pure math helpers (§7.1, §7.3)
// ---------------------------------------------------------------------------

test("linreg: recovers a known slope and intercept exactly", () => {
  const a = 10;
  const b = 0.5;
  const y = Array.from({ length: 20 }, (_, i) => a + b * i);
  const fit = linreg(y);
  assertClose(fit.a, a, 1e-9);
  assertClose(fit.b, b, 1e-9);
  assert(fit.residuals.every((r) => Math.abs(r) < 1e-9), "a perfect line should have ~0 residuals");
});

test("idealRamp: rises to exactly 1 at the peak and falls back to 0 at the end", () => {
  const u = idealRamp(29, 14);
  assertEqual(u.length, 29);
  assertClose(u[0], 0, 1e-9, "starts at 0");
  assertClose(u[14], 1, 1e-9, "peaks at 1");
  assertClose(u[28], 0, 1e-9, "ends at 0");
});

// ---------------------------------------------------------------------------
// Note-correctness alignment (§7.2) — the "one wrong note shouldn't tank the score" guarantee
// ---------------------------------------------------------------------------

test("alignGreedy: exact match scores 100%", () => {
  const r = alignGreedy([60, 62, 64], [60, 62, 64]);
  assertEqual(r.M, 3);
  assertEqual(r.S + r.I + r.D, 0);
});

test("alignGreedy: one inserted note is an insertion, not a cascade of substitutions", () => {
  // this is the exact failure mode §4.2 warns about: index-by-index comparison would
  // score every note after the insertion as wrong.
  const r = alignGreedy([60, 62, 64], [60, 61, 62, 64]);
  assertEqual(r.M, 3, "the three real notes should still match");
  assertEqual(r.I, 1);
  assertEqual(r.S, 0, "must not be reported as substitutions");
});

test("alignGreedy: one missed note is a deletion", () => {
  const r = alignGreedy([60, 62, 64, 65], [60, 64, 65]);
  assertEqual(r.M, 3);
  assertEqual(r.D, 1);
  assertEqual(r.S, 0);
});

test("alignGreedy: one wrong note is a substitution", () => {
  const r = alignGreedy([60, 62, 64], [60, 63, 64]);
  assertEqual(r.M, 2);
  assertEqual(r.S, 1);
  assertEqual(r.I, 0);
  assertEqual(r.D, 0);
});

// ---------------------------------------------------------------------------
// Full pipeline via analyzeRun — synthetic MIDI events in, metrics object out.
// See DOCUMENTATION.md §16 for how these numbers were derived by hand.
// ---------------------------------------------------------------------------

function buildCleanRunEvents(config, expected, syncOffsetMs = 3, balanceOffset = 5) {
  const T = 60000 / (config.bpm * config.notesPerBeat);
  const events = [];
  for (let i = 0; i < expected.N; i++) {
    const onsetBase = i * T;
    const u = i <= expected.k ? i / expected.k : (expected.N - 1 - i) / (expected.N - 1 - expected.k);
    const vel = Math.round(40 + u * 60);
    events.push({ pitch: expected.RH[i], velocity: vel, onset: onsetBase, offset: onsetBase + T * 0.9 });
    events.push({
      pitch: expected.LH[i],
      velocity: vel - balanceOffset,
      onset: onsetBase + syncOffsetMs,
      offset: onsetBase + syncOffsetMs + T * 0.9,
    });
  }
  return { events, T };
}

const CONFIG = { root: "C", mode: "major", octaves: 2, bpm: 80, notesPerBeat: 2, handInterval: 12, metronome: false };

test("analyzeRun: a clean, correct run scores as clean across every metric", () => {
  const expected = generateSequence(CONFIG);
  const { events } = buildCleanRunEvents(CONFIG, expected);
  const run = analyzeRun(CONFIG, events, false);

  assertEqual(run.handMismatch, false);
  assertClose(run.metrics.correctness.accuracy, 1, 1e-9);
  assertClose(run.metrics.timing.offset, 0, 1e-6);
  assertClose(run.metrics.timing.drift, 0, 1e-6);
  assertClose(run.metrics.timing.jitter, 0, 1e-6);
  assertClose(run.metrics.sync.bias, 3, 0.5, "L onsets were 3ms after R");
  assertClose(run.metrics.dynamics.R.shape, 1, 0.05);
  assertClose(run.metrics.dynamics.R.range, 60, 0.1);
  assertClose(run.metrics.balance, -5, 0.1, "L was 5 velocity units quieter");
});

test("analyzeRun: hand-pitch-range overlap does not break separation (the §6 regression)", () => {
  // At this config the left hand climbs to MIDI 72 while the right hand starts at 60 —
  // their ranges overlap by a full octave. A fixed pitch-threshold split (the literal
  // §3 algorithm) misclassifies every LH note at or above the threshold. This test
  // exists specifically to catch a regression back to that approach: if someone
  // "simplifies" splitHandsByOnset back to splitHands, this drops from 1.0 to ~0.72.
  const expected = generateSequence(CONFIG);
  const { events } = buildCleanRunEvents(CONFIG, expected);
  const run = analyzeRun(CONFIG, events, false);
  assertClose(run.metrics.correctness.accuracy, 1, 1e-9, "hand overlap should not cause misclassification");
});

test("analyzeRun: an inserted wrong note is counted as an insertion, full run still scores near 1", () => {
  const expected = generateSequence(CONFIG);
  const { events, T } = buildCleanRunEvents(CONFIG, expected);
  const withExtra = events.slice();
  withExtra.push({ pitch: expected.RH[5] + 1, velocity: 50, onset: 5 * T + T / 2, offset: 5 * T + T / 2 + 50 });
  withExtra.sort((a, b) => a.onset - b.onset);

  const run = analyzeRun(CONFIG, withExtra, false);
  assert(run.metrics.correctness.I >= 1, "extra note should be an insertion");
  assert(run.metrics.correctness.accuracy > 0.9, "one wrong note shouldn't tank the whole score");
});

test("analyzeRun: mismatched hand note-counts flags the run and skips timing/sync, not dynamics", () => {
  const expected = generateSequence(CONFIG);
  const T = 60000 / (CONFIG.bpm * CONFIG.notesPerBeat);
  const events = [];
  for (let i = 0; i < expected.N; i++) {
    const onsetBase = i * T;
    events.push({ pitch: expected.LH[i], velocity: 60, onset: onsetBase + 3, offset: onsetBase + 3 + T * 0.9 });
    if (i < expected.N - 3) {
      events.push({ pitch: expected.RH[i], velocity: 60, onset: onsetBase, offset: onsetBase + T * 0.9 });
    }
  }
  const run = analyzeRun(CONFIG, events, false);
  assertEqual(run.handMismatch, true);
  assertEqual(run.metrics.timing, null);
  assertEqual(run.metrics.sync, null);
  assert(run.metrics.dynamics.L !== null, "dynamics should still be computed per-hand on a mismatched run");
});

test("analyzeRun: sustain pedal flag propagates through to the stored run", () => {
  const expected = generateSequence(CONFIG);
  const { events } = buildCleanRunEvents(CONFIG, expected);
  const run = analyzeRun(CONFIG, events, true);
  assertEqual(run.pedalDetected, true);
});

test("analyzeRun: a run with no crescendo (flat velocity) is reported, not crashed", () => {
  // §12's zero-range guard: span = max-min = 0, so normalised velocity defaults to 0
  // rather than dividing by zero. Every step is flat (d_i = 0), and per §7.3 a flat
  // step never matches the expected non-zero sign, so every index counts as a reversal.
  const expected = generateSequence(CONFIG);
  const T = 60000 / (CONFIG.bpm * CONFIG.notesPerBeat);
  const events = [];
  for (let i = 0; i < expected.N; i++) {
    const onsetBase = i * T;
    events.push({ pitch: expected.RH[i], velocity: 64, onset: onsetBase, offset: onsetBase + T * 0.9 });
    events.push({ pitch: expected.LH[i], velocity: 64, onset: onsetBase + 3, offset: onsetBase + 3 + T * 0.9 });
  }
  const run = analyzeRun(CONFIG, events, false);
  assertEqual(run.metrics.dynamics.R.range, 0, "flat velocity means zero range");
  assert(!Number.isNaN(run.metrics.dynamics.R.shape), "the span=0 guard must prevent NaN, not just avoid throwing");
  assertEqual(run.metrics.dynamics.R.reversals.length, expected.N - 1, "every flat step counts as a reversal");
});
