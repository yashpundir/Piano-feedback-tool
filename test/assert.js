// Minimal test harness — no framework, no build step, runs by opening test/index.html
// in a browser. Kept deliberately tiny so it needs nothing this project doesn't already
// need. If a real test runner (Vitest/Jest) is ever set up, these functions can be
// swapped for the runner's assert without touching the test bodies below, since the
// modules under test (scale.js, metrics.js, stats.js, run.js) have no DOM or browser
// dependency at all.

const results = [];

export function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertClose(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${expected} ± ${tol}, got ${actual}`);
  }
}

export function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
}

export function getResults() {
  return results;
}
