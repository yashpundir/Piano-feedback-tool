import { mean, stdev, linreg } from "./stats.js";

// ---- Hand separation & pairing (§3) ----
//
// §3 specifies a single fixed pitch threshold (the midpoint between the lowest expected
// LH and RH pitch). That works for a one-octave exercise, but for the default config
// (2 octaves, 12-semitone hand interval) the hands' pitch ranges overlap: LH climbs from
// root-12 up to root+12, RH climbs from root up to root+24, so the top octave of LH sits
// above the fixed threshold and would be misclassified as RH. §9.1 flags exactly this —
// "the pitch-split logic must be verified against the user's actual playing before
// hardcoding" — so instead of the fixed threshold, hands are separated by clustering
// near-simultaneous note-ons (hands-together play puts one LH and one RH onset within a
// fraction of a beat of each other) and taking the lower pitch in each pair as LH. The
// fixed threshold is kept as a fallback for the rare cluster that isn't a clean pair.

export function splitHandsByOnset(events, targetIOI, fallbackSplitPt) {
  const sorted = events.slice().sort((a, b) => a.onset - b.onset);
  const window = Math.min(Math.max(targetIOI * 0.5, 40), 200);

  const clusters = [];
  let current = [];
  for (const e of sorted) {
    if (current.length === 0 || e.onset - current[0].onset <= window) {
      current.push(e);
    } else {
      clusters.push(current);
      current = [e];
    }
  }
  if (current.length) clusters.push(current);

  const L = [];
  const R = [];
  for (const cluster of clusters) {
    if (cluster.length === 2) {
      const [lo, hi] = cluster.slice().sort((a, b) => a.pitch - b.pitch);
      L.push(lo);
      R.push(hi);
    } else if (cluster.length === 1) {
      const e = cluster[0];
      (e.pitch < fallbackSplitPt ? L : R).push(e);
    } else {
      const byPitch = cluster.slice().sort((a, b) => a.pitch - b.pitch);
      L.push(byPitch[0]);
      R.push(byPitch[byPitch.length - 1]);
      for (const e of byPitch.slice(1, -1)) {
        (e.pitch < fallbackSplitPt ? L : R).push(e);
      }
    }
  }
  L.sort((a, b) => a.onset - b.onset);
  R.sort((a, b) => a.onset - b.onset);
  return { L, R };
}

// Kept for reference / as the fallback classifier above — the literal §3 algorithm.
export function splitHands(events, splitPt) {
  const L = events.filter((e) => e.pitch < splitPt).sort((a, b) => a.onset - b.onset);
  const R = events.filter((e) => e.pitch >= splitPt).sort((a, b) => a.onset - b.onset);
  return { L, R };
}

// Pairs L[i] with R[i]. If lengths differ, pairing is unsafe (spec §3): flag and return null.
export function pairHands(L, R) {
  if (L.length !== R.length) return { paired: null, mismatched: true };
  const paired = L.map((l, i) => ({ L: l, R: R[i] }));
  return { paired, mismatched: false };
}

// ---- 4.1 Timing ----

export function computeTiming(tau, T) {
  const N = tau.length;
  const IOI = [];
  for (let i = 0; i < N - 1; i++) IOI.push(tau[i + 1] - tau[i]);
  const { a, b, residuals } = linreg(IOI);
  const meanIOI = mean(IOI);
  const offset = (meanIOI - T) / T;
  const drift = (b * (N - 1)) / T;
  const jitter = Math.sqrt(mean(residuals.map((r) => r * r))) / T;
  return { offset, drift, jitter, IOI, residuals, a, b };
}

// ---- 4.2 Note correctness ----
// v1 greedy left-to-right aligner with one-step lookahead (§4.2).
export function alignGreedy(expected, played) {
  let ei = 0;
  let pi = 0;
  let M = 0;
  let S = 0;
  let I = 0;
  let D = 0;

  while (ei < expected.length && pi < played.length) {
    if (expected[ei] === played[pi]) {
      M++;
      ei++;
      pi++;
      continue;
    }
    const deletionLooksRight = expected[ei + 1] === played[pi]; // played[pi] matches what comes after the skipped expected note
    const insertionLooksRight = expected[ei] === played[pi + 1]; // expected[ei] matches what comes after the skipped played note
    if (insertionLooksRight && !deletionLooksRight) {
      I++;
      pi++;
    } else if (deletionLooksRight && !insertionLooksRight) {
      D++;
      ei++;
    } else {
      S++;
      ei++;
      pi++;
    }
  }
  D += expected.length - ei;
  I += played.length - pi;
  const denom = M + S + I + D;
  return { M, S, I, D, accuracy: denom === 0 ? 0 : M / denom };
}

// ---- 4.3 Dynamics ----

export function idealRamp(n, k) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(i <= k ? i / k : (n - 1 - i) / (n - 1 - k));
  }
  return out;
}

export function computeDynamics(velocities, k) {
  const n = velocities.length;
  const u = idealRamp(n, k);
  const minV = Math.min(...velocities);
  const maxV = Math.max(...velocities);
  const span = maxV - minV;
  const vtilde = velocities.map((v) => (span === 0 ? 0 : (v - minV) / span));
  const shape = 1 - mean(vtilde.map((vt, i) => Math.abs(vt - u[i])));
  const range = span;

  const d = [];
  for (let i = 0; i < n - 1; i++) d.push(velocities[i + 1] - velocities[i]);
  const expectedSign = d.map((_, i) => (i < k ? 1 : -1));
  const reversals = [];
  d.forEach((di, i) => {
    if (Math.sign(di) !== expectedSign[i]) reversals.push(i);
  });
  const absD = d.map(Math.abs);
  const muD = mean(absD);
  const lumpiness = muD === 0 ? 0 : mean(absD.map((a) => Math.abs(a - muD))) / muD;

  const idealVelocities = u.map((ui) => minV + ui * span);
  return { shape, range, reversals, lumpiness, u, idealVelocities };
}

// ---- 4.4 Hand synchronisation ----

export function computeSync(paired) {
  const e = paired.map((p) => p.L.onset - p.R.onset);
  const bias = mean(e);
  const error = Math.sqrt(mean(e.map((x) => x * x)));
  return { bias, error, e };
}


// ---- 4.6 Legato / articulation ----

export function computeLegato(eventsSortedByOnset, T) {
  const g = [];
  for (let i = 0; i < eventsSortedByOnset.length - 1; i++) {
    g.push(eventsSortedByOnset[i + 1].onset - eventsSortedByOnset[i].offset);
  }
  const gtilde = g.map((x) => x / T);
  return {
    articulation: mean(gtilde), // signed: net tendency, opposite faults cancel
    articulation_abs: mean(gtilde.map(Math.abs)), // unsigned: total distance from legato
    articulation_var: stdev(gtilde), // consistency
    gtilde,
  };
}

// ---- 4.7 Hand balance ----

export function computeBalance(velocitiesL, velocitiesR) {
  return mean(velocitiesL) - mean(velocitiesR);
}
