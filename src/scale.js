// Scale definitions, expected note sequences, fingering and thumb-crossing derivation.
// v1 ships C major only; adding a scale means adding one entry to SCALES and FINGERINGS.

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
};

export const ROOT_PITCH = {
  C: 60,
};

// One octave ascending, root to root, 8 notes: standard fingering.
export const FINGERINGS = {
  C: {
    major: {
      RH: [1, 2, 3, 1, 2, 3, 4, 5],
      LH: [5, 4, 3, 2, 1, 3, 2, 1],
    },
  },
};

function tileFingering(oneOctave, octaves) {
  const out = oneOctave.slice();
  for (let o = 1; o < octaves; o++) {
    out.push(...oneOctave.slice(1));
  }
  return out;
}

export function noteCount(octaves) {
  return 14 * octaves + 1;
}

export function peakIndex(octaves) {
  return 7 * octaves;
}

// Ascending right-hand pitch sequence: 7n+1 notes, root to root n octaves up.
function ascendingPitches(rootPitch, mode, octaves) {
  const intervals = SCALES[mode];
  const out = [];
  for (let o = 0; o < octaves; o++) {
    for (let d = 0; d < intervals.length; d++) {
      out.push(rootPitch + 12 * o + intervals[d]);
    }
  }
  out.push(rootPitch + 12 * octaves);
  return out;
}

// Full up-and-down pitch sequence, top note played once. Length 14n+1.
export function generateSequence({ root = "C", mode = "major", octaves = 2, handInterval = 12 } = {}) {
  const rootPitch = ROOT_PITCH[root];
  if (rootPitch === undefined) throw new Error(`Unknown root: ${root}`);
  if (!SCALES[mode]) throw new Error(`Unknown mode: ${mode}`);

  const asc = ascendingPitches(rootPitch, mode, octaves);
  const desc = asc.slice(0, asc.length - 1).reverse();
  const rh = asc.concat(desc);
  const lh = rh.map((p) => p - handInterval);

  const N = noteCount(octaves);
  if (rh.length !== N) throw new Error(`Sequence length mismatch: got ${rh.length}, expected ${N}`);

  return { RH: rh, LH: lh, N, k: peakIndex(octaves) };
}

// Full up-and-down fingering sequence for one hand, mirroring generateSequence's pitch layout.
export function generateFingering({ root = "C", mode = "major", octaves = 2, hand = "RH" } = {}) {
  const table = FINGERINGS[root]?.[mode]?.[hand];
  if (!table) throw new Error(`No fingering table for ${root} ${mode} ${hand}`);

  const ascFull = tileFingering(table, octaves); // length 7n+1
  const descFull = ascFull.slice(0, ascFull.length - 1).reverse(); // length 7n
  return ascFull.concat(descFull); // length 14n+1
}

// Indices where the fingering pattern is not a simple step — i.e. a thumb crossing.
export function deriveCrossings(fingers) {
  const crossings = [];
  for (let i = 1; i < fingers.length; i++) {
    if (Math.abs(fingers[i] - fingers[i - 1]) !== 1) crossings.push(i);
  }
  return crossings;
}

export function splitPoint({ root = "C", handInterval = 12 } = {}) {
  const rh = ROOT_PITCH[root];
  const lh = rh - handInterval;
  return (rh + lh) / 2;
}
