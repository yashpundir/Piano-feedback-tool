// Scale definitions, expected note sequences, fingering and thumb-crossing derivation.
// v1 ships C major only; adding a scale means adding one entry to SCALES and FINGERINGS.

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
};

export const ROOT_PITCH = {
  C: 60,
};

// Fingering is stored as a 7-note repeating cycle plus the two notes that break it.
//
// A one-octave array can't be tiled directly: the finger on the root changes depending
// on where in the run it falls. Ascending RH C major is 1,2,3,1,2,3,4 per octave with
// the thumb landing on every octave boundary, and only the FINAL note takes 5 —
// 2 octaves is 1,2,3,1,2,3,4,1,2,3,1,2,3,4,5, not ...4,5,2,3... The LH mirrors this:
// 5 appears only on the very first note, and the thumb lands on each octave boundary.
//
//   cycle — finger per scale degree when passing THROUGH that degree mid-run
//   first — finger on the lowest note of the run (differs from cycle[0] for LH)
//   last  — finger on the highest note of the run (differs from cycle[0] for RH)
//
// This generalises to other scales, which break the pattern at different degrees:
// F major RH needs cycle [1,2,3,4,1,2,3] (thumb after the B flat), B major LH needs
// first = 4. Both fit without changing any code below.
export const FINGERINGS = {
  C: {
    major: {
      RH: { cycle: [1, 2, 3, 1, 2, 3, 4], first: 1, last: 5 },
      LH: { cycle: [1, 4, 3, 2, 1, 3, 2], first: 5, last: 1 },
    },
  },
};

// Degrees per octave comes from the interval table rather than being hardcoded to 7,
// so a non-diatonic scale (pentatonic, whole-tone) doesn't silently produce a sequence
// whose length disagrees with its own fingering.
export function degreesPerOctave(mode = "major") {
  const intervals = SCALES[mode];
  if (!intervals) throw new Error(`Unknown mode: ${mode}`);
  return intervals.length;
}

export function noteCount(octaves, degrees = 7) {
  return 2 * degrees * octaves + 1;
}

export function peakIndex(octaves, degrees = 7) {
  return degrees * octaves;
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

  const degrees = degreesPerOctave(mode);
  const asc = ascendingPitches(rootPitch, mode, octaves);
  const desc = asc.slice(0, asc.length - 1).reverse();
  const rh = asc.concat(desc);
  const lh = rh.map((p) => p - handInterval);

  const N = noteCount(octaves, degrees);
  if (rh.length !== N) throw new Error(`Sequence length mismatch: got ${rh.length}, expected ${N}`);

  return { RH: rh, LH: lh, N, k: peakIndex(octaves, degrees) };
}

// Full up-and-down fingering sequence for one hand, mirroring generateSequence's pitch layout.
export function generateFingering({ root = "C", mode = "major", octaves = 2, hand = "RH" } = {}) {
  const table = FINGERINGS[root]?.[mode]?.[hand];
  if (!table) throw new Error(`No fingering table for ${root} ${mode} ${hand}`);
  const { cycle, first, last } = table;
  const degrees = degreesPerOctave(mode);
  if (cycle.length !== degrees) {
    throw new Error(`${root} ${mode} ${hand}: cycle has ${cycle.length} fingers, scale has ${degrees} degrees`);
  }

  const top = degrees * octaves;
  const ascFull = []; // length (degrees * n) + 1
  for (let j = 0; j <= top; j++) {
    if (j === 0) ascFull.push(first);
    else if (j === top) ascFull.push(last);
    else ascFull.push(cycle[j % degrees]);
  }

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
