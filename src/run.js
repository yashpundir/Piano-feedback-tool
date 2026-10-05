import { generateSequence, generateFingering, deriveCrossings, splitPoint } from "./scale.js";
import {
  splitHandsByOnset,
  pairHands,
  computeTiming,
  alignGreedy,
  computeDynamics,
  computeSync,
  computeCrossingBump,
  computeLegato,
  computeBalance,
} from "./metrics.js";
import { uuid } from "./storage.js";

// Ties together the raw MIDI events for one run with the config that produced them,
// running every §4 metric and producing both the machine-readable metrics object (§7)
// and a per-note table the report UI (§6) can render directly.
export function analyzeRun(config, rawEvents, pedalDetected) {
  const { root, mode = "major", octaves, bpm, notesPerBeat, handInterval, metronome } = config;
  const expected = generateSequence({ root, mode, octaves, handInterval });
  const splitPt = splitPoint({ root, handInterval });
  const T = 60000 / (bpm * notesPerBeat);

  const { L, R } = splitHandsByOnset(rawEvents, T, splitPt);
  L.forEach((e) => {
    e.hand = "L";
  });
  R.forEach((e) => {
    e.hand = "R";
  });
  const events = rawEvents.slice().sort((a, b) => a.onset - b.onset);

  const { paired, mismatched } = pairHands(L, R);

  const alignL = alignGreedy(expected.LH, L.map((e) => e.pitch));
  const alignR = alignGreedy(expected.RH, R.map((e) => e.pitch));
  const correctness = {
    M: alignL.M + alignR.M,
    S: alignL.S + alignR.S,
    I: alignL.I + alignR.I,
    D: alignL.D + alignR.D,
  };
  correctness.accuracy =
    correctness.M / (correctness.M + correctness.S + correctness.I + correctness.D || 1);

  const kFor = (len) => Math.min(expected.k, Math.max(len - 1, 0));
  const dynamicsL = L.length > 1 ? computeDynamics(L.map((e) => e.velocity), kFor(L.length)) : null;
  const dynamicsR = R.length > 1 ? computeDynamics(R.map((e) => e.velocity), kFor(R.length)) : null;
  const balance =
    L.length && R.length ? computeBalance(L.map((e) => e.velocity), R.map((e) => e.velocity)) : null;
  const legatoL = L.length > 1 ? computeLegato(L, T) : null;
  const legatoR = R.length > 1 ? computeLegato(R, T) : null;

  // Per-hand timing needs only one hand's own onsets, so unlike the paired timeline it
  // survives a hand-count mismatch. Scalars only — the IOI/residual arrays stay in
  // _detail so the stored run matches the schema in DOCUMENTATION.md §10.
  const timingScalars = (t) => (t ? { offset: t.offset, drift: t.drift, jitter: t.jitter } : null);
  const timingLFull = L.length > 1 ? computeTiming(L.map((e) => e.onset), T) : null;
  const timingRFull = R.length > 1 ? computeTiming(R.map((e) => e.onset), T) : null;
  const timingPerHand =
    timingLFull || timingRFull
      ? {
          L: timingScalars(timingLFull),
          R: timingScalars(timingRFull),
          // The "one hand is slowing relative to the other" fault, as a single number.
          driftDifference: timingLFull && timingRFull ? timingLFull.drift - timingRFull.drift : null,
        }
      : null;

  let timingFull = null;
  let sync = null;
  let crossings = null;

  if (!mismatched && paired.length > 1) {
    const tau = paired.map((p) => (p.L.onset + p.R.onset) / 2);
    timingFull = computeTiming(tau, T);
    sync = computeSync(paired);

    if (dynamicsL && dynamicsR) {
      const fingerRH = generateFingering({ root, mode, octaves, hand: "RH" });
      const fingerLH = generateFingering({ root, mode, octaves, hand: "LH" });
      const crossRH = deriveCrossings(fingerRH.slice(0, R.length));
      const crossLH = deriveCrossings(fingerLH.slice(0, L.length));
      const velResR = R.map((e, i) => e.velocity - dynamicsR.idealVelocities[i]);
      const velResL = L.map((e, i) => e.velocity - dynamicsL.idealVelocities[i]);
      const bumpRH = computeCrossingBump(crossRH, velResR, timingFull.residuals);
      const bumpLH = computeCrossingBump(crossLH, velResL, timingFull.residuals);
      crossings = {
        indices: { RH: crossRH, LH: crossLH },
        RH: bumpRH,
        LH: bumpLH,
      };
    }
  }

  const run = {
    runId: uuid(),
    timestamp: Date.now(),
    config: { root, mode, octaves, bpm, notesPerBeat, handInterval, metronome },
    // Expected note count and peak index. Derivable from config, but stored so that a
    // consumer of a saved run can interpret reversal indices without re-deriving them.
    sequence: { N: expected.N, k: expected.k },
    events,
    pedalDetected,
    handMismatch: mismatched,
    metrics: {
      timing: timingScalars(timingFull),
      timingPerHand,
      correctness,
      dynamics: { L: dynamicsL, R: dynamicsR },
      sync,
      crossings,
      legato: legatoL && legatoR
        ? { R: legatoR.articulation, L: legatoL.articulation, varR: legatoR.articulation_var, varL: legatoL.articulation_var }
        : null,
      balance,
    },
  };

  run._detail = { expected, L, R, paired, T, splitPt, dynamicsL, dynamicsR, timing: timingFull };
  return run;
}

export function pitchName(pitch) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}
