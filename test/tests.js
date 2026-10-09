import { test, assert, assertEqual, assertClose, assertDeepEqual } from "./assert.js";
import { generateSequence, generateFingering, deriveCrossings } from "../src/scale.js";
import { analyzeRun } from "../src/run.js";
import { linreg } from "../src/stats.js";
import { idealRamp, alignGreedy } from "../src/metrics.js";
import { generateFindings } from "../src/findings.js";
import {
  renderSubmetrics,
  renderPerHandTiming,
  renderNoteStrip,
  renderVelocityChart,
  renderFindings,
  renderFlags,
  renderHistorySparkline,
} from "../src/ui.js";

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
//
// NOTE: this data is DORMANT — no metric uses it (see the banner in src/scale.js).
// These tests are kept because the tables are still correct and will be reused as an
// explanation layer later; they protect the data, not any live behaviour. Do not take
// their presence as licence to wire fingering back into the analysis path.
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

test("fingering: RH 2 octaves ascending puts the thumb on the octave join, not finger 5", () => {
  // The bug this guards: tiling a one-octave array [1,2,3,1,2,3,4,5] leaves 5 on the
  // joining C5 instead of the thumb. That note IS a thumb crossing, so the old version
  // silently hid a real crossing from the analysis.
  const asc = generateFingering({ octaves: 2, hand: "RH" }).slice(0, 15);
  assertDeepEqual(asc, [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5]);
  assertEqual(asc[7], 1, "the octave join must be the thumb");
});

test("fingering: LH 2 octaves ascending uses 5 only on the lowest note", () => {
  const asc = generateFingering({ octaves: 2, hand: "LH" }).slice(0, 15);
  assertDeepEqual(asc, [5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1]);
  assertEqual(asc.slice(1).includes(5), false, "5 should appear only on the first note");
});

test("fingering: 2-octave crossings include the octave joins", () => {
  const crossRH = deriveCrossings(generateFingering({ octaves: 2, hand: "RH" }));
  const crossLH = deriveCrossings(generateFingering({ octaves: 2, hand: "LH" }));
  assertDeepEqual(crossRH, [3, 7, 10, 19, 22, 26], "RH: thumb under at F4, C5, F5 then mirrored");
  assertDeepEqual(crossLH, [5, 8, 12, 17, 21, 24]);
  assert(crossRH.includes(7), "C5 (the octave join) must be detected as a crossing");
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

test("analyzeRun: per-hand timing is computed for both hands on a clean run", () => {
  const expected = generateSequence(CONFIG);
  const { events } = buildCleanRunEvents(CONFIG, expected);
  const run = analyzeRun(CONFIG, events, false);
  const ph = run.metrics.timingPerHand;
  assert(ph !== null, "per-hand timing should exist");
  assertClose(ph.L.jitter, 0, 1e-6, "LH played exactly on time");
  assertClose(ph.R.jitter, 0, 1e-6, "RH played exactly on time");
  assertClose(ph.driftDifference, 0, 1e-6, "neither hand drifts relative to the other");
});

test("analyzeRun: per-hand timing catches one hand slowing relative to the other", () => {
  // The §7.1 gap this was added to close: LH decelerates while RH holds steady.
  // Paired timing sees only half the drift and blames hand sync; per-hand timing
  // names the hand.
  const expected = generateSequence(CONFIG);
  const T = 60000 / (CONFIG.bpm * CONFIG.notesPerBeat);
  const events = [];
  let lhClock = 0;
  for (let i = 0; i < expected.N; i++) {
    const rhOnset = i * T; // steady
    lhClock += T + i * 1.5; // each LH gap a little longer than the last
    events.push({ pitch: expected.RH[i], velocity: 64, onset: rhOnset, offset: rhOnset + T * 0.5 });
    events.push({ pitch: expected.LH[i], velocity: 64, onset: lhClock, offset: lhClock + T * 0.5 });
  }
  const run = analyzeRun(CONFIG, events, false);
  const ph = run.metrics.timingPerHand;
  assertClose(ph.R.drift, 0, 1e-6, "RH held tempo");
  assert(ph.L.drift > 0.05, `LH should show positive drift (slowing), got ${ph.L.drift}`);
  assert(ph.driftDifference > 0.05, "drift difference should flag the left hand");
});

test("analyzeRun: per-hand timing survives a hand-count mismatch (it needs no pairing)", () => {
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
  assertEqual(run.metrics.timing, null, "paired timing is skipped");
  assert(run.metrics.timingPerHand !== null, "per-hand timing should still be available");
  assert(run.metrics.timingPerHand.L !== null && run.metrics.timingPerHand.R !== null);
});

test("stored metrics carry timing scalars only, not the IOI/residual arrays (§10 schema)", () => {
  const expected = generateSequence(CONFIG);
  const { events } = buildCleanRunEvents(CONFIG, expected);
  const run = analyzeRun(CONFIG, events, false);
  assertDeepEqual(Object.keys(run.metrics.timing).sort(), ["drift", "jitter", "offset"]);
  assert(run._detail.timing.residuals.length > 0, "residuals stay available in _detail for the UI");
});

test("analyzeRun: sustain pedal flag propagates through to the stored run", () => {
  const expected = generateSequence(CONFIG);
  const { events } = buildCleanRunEvents(CONFIG, expected);
  const run = analyzeRun(CONFIG, events, true);
  assertEqual(run.pedalDetected, true);
});

// ---------------------------------------------------------------------------
// Report rendering smoke tests. The pure-function tests above can't catch a typo in
// DOM code, so each renderer is called once against a real run object and checked for
// having produced something. Not assertions about layout — just "it runs and emits".
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The peak-step sign convention (§7.3). d_i is the step FROM note i TO note i+1, so
// the step INTO the peak (i = k-1) must expect +1 and the step OUT of it (i = k) must
// expect -1. These two tests pin that boundary from both sides.
// ---------------------------------------------------------------------------

test("dynamics: a correct triangle has no reversals at all, including at the peak", () => {
  const expected = generateSequence(CONFIG);
  const { events } = buildCleanRunEvents(CONFIG, expected);
  const run = analyzeRun(CONFIG, events, false);
  assertDeepEqual(run.metrics.dynamics.R.reversals, [], "an ideal triangle should flag nothing");
  assertDeepEqual(run.metrics.dynamics.L.reversals, []);
});

test("dynamics: still rising after the peak flags a reversal exactly at step k", () => {
  // Velocity keeps climbing past the top note instead of turning around. The step out
  // of the peak (i = k) is the first one that's wrong, so it must be the one flagged.
  const expected = generateSequence(CONFIG);
  const T = 60000 / (CONFIG.bpm * CONFIG.notesPerBeat);
  const events = [];
  for (let i = 0; i < expected.N; i++) {
    const onsetBase = i * T;
    // monotonically increasing the whole way through - no turnaround
    const vel = 40 + i * 2;
    events.push({ pitch: expected.RH[i], velocity: vel, onset: onsetBase, offset: onsetBase + T * 0.9 });
    events.push({ pitch: expected.LH[i], velocity: vel, onset: onsetBase + 3, offset: onsetBase + 3 + T * 0.9 });
  }
  const run = analyzeRun(CONFIG, events, false);
  const rev = run.metrics.dynamics.R.reversals;
  assert(rev.includes(expected.k), `step k=${expected.k} should be a reversal, got ${JSON.stringify(rev)}`);
  assert(!rev.includes(expected.k - 1), "the step INTO the peak was correctly rising and must not be flagged");
});

test("findings: a dip before the peak and a swell after it are reported as different faults", () => {
  const base = {
    sequence: { N: 29, k: 14 },
    metrics: {
      timing: null,
      timingPerHand: null,
      sync: null,
      legato: null,
      balance: null,
      correctness: { M: 1, S: 0, I: 0, D: 0, accuracy: 1 },
      dynamics: {
        R: { shape: 0.9, range: 60, reversals: [3, 20], lumpiness: 0.2 },
        L: null,
      },
    },
  };
  const findings = generateFindings(base);
  assert(
    findings.some((f) => f.includes("crescendo dipped") && f.includes("5")),
    `step 3 should be reported as a crescendo dip at note 5, got: ${JSON.stringify(findings)}`
  );
  assert(
    findings.some((f) => f.includes("diminuendo") && f.includes("22")),
    `step 20 should be reported as a diminuendo swell at note 22, got: ${JSON.stringify(findings)}`
  );
});

test("legato: alternating overlap and gap cancels in the mean but is caught by var and reported", () => {
  // The §7.6 blind spot: every odd note overlaps by 0.2T, every even note gaps by 0.2T.
  // Signed mean lands near 0 - textbook legato by that measure alone - while the run
  // actually alternates mush and chop.
  const expected = generateSequence(CONFIG);
  const T = 60000 / (CONFIG.bpm * CONFIG.notesPerBeat);
  const events = [];
  for (let i = 0; i < expected.N; i++) {
    const onsetBase = i * T;
    const hold = i % 2 === 0 ? T * 1.2 : T * 0.8; // overlap, then gap
    // proper triangle velocities, so dynamics findings stay quiet and legato is isolated
    const u = i <= expected.k ? i / expected.k : (expected.N - 1 - i) / (expected.N - 1 - expected.k);
    const vel = Math.round(40 + u * 60);
    events.push({ pitch: expected.RH[i], velocity: vel, onset: onsetBase, offset: onsetBase + hold });
    events.push({ pitch: expected.LH[i], velocity: vel, onset: onsetBase + 3, offset: onsetBase + 3 + hold });
  }
  const run = analyzeRun(CONFIG, events, false);

  assertClose(run.metrics.legato.R, 0, 0.05, "signed mean should cancel to about zero");
  assert(run.metrics.legato.varR > 0.15, `var should expose it, got ${run.metrics.legato.varR}`);
  assert(run.metrics.legato.absR > 0.15, `unsigned mean should expose it, got ${run.metrics.legato.absR}`);
  assert(
    generateFindings(run).some((f) => f.includes("articulation is uneven")),
    `the uneven-articulation finding should fire, got: ${JSON.stringify(generateFindings(run))}`
  );
});

test("findings: location phrases are grammatical at one, few and many reversals", () => {
  const makeRun = (reversals) => ({
    sequence: { N: 29, k: 14 },
    metrics: {
      timing: null, timingPerHand: null, sync: null, legato: null, balance: null,
      correctness: { M: 1, S: 0, I: 0, D: 0, accuracy: 1 },
      dynamics: { R: { shape: 0.9, range: 60, reversals, lumpiness: 0.2 }, L: null },
    },
  });

  const one = generateFindings(makeRun([3]))[0];
  assert(one.includes("at note 5."), `single: ${one}`);

  const few = generateFindings(makeRun([3, 5, 7]))[0];
  assert(few.includes("at notes 5, 7 and 9."), `few: ${few}`);

  const many = generateFindings(makeRun([3, 5, 7, 9, 11]))[0];
  assert(many.includes("at 5 points through the run, starting at note 5."), `many: ${many}`);
  // the bug this guards: "at notes 8 points through the run (first at note 16)"
  assert(!/notes \d+ points/.test(many), `"notes N points" is not English: ${many}`);
});

test("report renderers: all of them run against a real run object without throwing", () => {
  const expected = generateSequence(CONFIG);
  const { events } = buildCleanRunEvents(CONFIG, expected);
  const run = analyzeRun(CONFIG, events, false);

  const div = () => document.createElement("div");
  const bars = div();
  const perhand = div();
  const strip = div();
  const findingsEl = document.createElement("ul");
  const flags = div();
  const spark = div();
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 260;

  renderSubmetrics(bars, run);
  renderPerHandTiming(perhand, run);
  renderNoteStrip(strip, run);
  renderVelocityChart(canvas, run);
  renderFindings(findingsEl, generateFindings(run));
  renderFlags(flags, run);
  renderHistorySparkline(spark, [run]);

  assert(bars.childElementCount > 0, "sub-metric bars rendered nothing");
  assert(perhand.querySelector("table") !== null, "per-hand timing table missing");
  assert(strip.childElementCount > 0, "note strip rendered nothing");
  assert(findingsEl.childElementCount > 0, "findings list rendered nothing");
});

test("report renderers: per-hand panel degrades gracefully when a hand is too short", () => {
  const perhand = document.createElement("div");
  renderPerHandTiming(perhand, { metrics: { timingPerHand: null } });
  assert(perhand.textContent.length > 0, "should explain why it's empty, not render blank");
});

test("findings: names the hand when one hand loses tempo relative to the other", () => {
  const findings = generateFindings({
    metrics: {
      timing: null,
      timingPerHand: { L: null, R: null, driftDifference: 0.4 },
      dynamics: { L: null, R: null },
      sync: null,
      legato: null,
      balance: null,
      correctness: { M: 1, S: 0, I: 0, D: 0, accuracy: 1 },
    },
  });
  assert(
    findings.some((f) => f.includes("left") && f.includes("losing tempo")),
    `expected a left-hand tempo finding, got: ${JSON.stringify(findings)}`
  );
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

// ---------------------------------------------------------------------------
// Deployment shape. These catch faults that are invisible locally and only appear
// once the app is served from a subpath, as GitHub Pages does.
// ---------------------------------------------------------------------------

test("deployment: index.html uses relative asset paths, not absolute ones", async () => {
  // An absolute "/src/main.js" resolves against the DOMAIN root, so on
  // user.github.io/repo-name/ it 404s and the page renders as a bare title with no
  // styling and no JS. Works locally only because the dev server root is the project
  // folder. Relative paths work in both.
  const html = await fetch("../index.html").then((r) => r.text());
  const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  assertDeepEqual(absolute, [], "absolute asset paths break any non-root deploy");
});
