// Turns the metrics object into at most three prioritised, plain-English findings (§6, Layer 3).
// Pedal and hand-mismatch flags are surfaced separately by the caller — they are reliability
// warnings, not findings to rank against the rest.
export function generateFindings(run) {
  const m = run.metrics;
  const candidates = [];

  if (m.sync && Math.abs(m.sync.bias) > 5) {
    // e_i = L.onset - R.onset, so bias < 0 means L fires first on average (L is ahead).
    const aheadHand = m.sync.bias < 0 ? "left" : "right";
    const behindHand = aheadHand === "left" ? "right" : "left";
    candidates.push({
      severity: Math.abs(m.sync.bias) / 5,
      text: `Your ${aheadHand} hand is consistently ${Math.abs(m.sync.bias).toFixed(1)} ms ahead of your ${behindHand}.`,
    });
  }


  for (const hand of ["L", "R"]) {
    const d = m.dynamics[hand];
    if (!d) continue;
    const label = hand === "L" ? "left" : "right";

    // `reversals` holds STEP indices: step i is the move from note i to note i+1, so the
    // note that is out of line is note i+1 (0-based), displayed 1-based as i+2.
    // Steps before the peak are crescendo dips; steps at or after it are diminuendo
    // swells — opposite faults, so they can't share one sentence.
    const k = run.sequence?.k;
    // Builds the complete location phrase, including the preposition, so the summary
    // form doesn't end up with "notes" bolted onto the front of it. Listing a dozen note
    // numbers is unusable, so past a handful it says how many instead — at that point
    // the fault is the shape of the whole run, not particular notes.
    const locationPhrase = (steps) => {
      const notes = steps.map((i) => i + 2);
      if (notes.length === 1) return `at note ${notes[0]}`;
      if (notes.length <= 4) {
        return `at notes ${notes.slice(0, -1).join(", ")} and ${notes[notes.length - 1]}`;
      }
      return `at ${notes.length} points through the run, starting at note ${notes[0]}`;
    };
    const dips = k === undefined ? d.reversals : d.reversals.filter((i) => i < k);
    const swells = k === undefined ? [] : d.reversals.filter((i) => i >= k);

    if (dips.length > 0) {
      candidates.push({
        severity: dips.length,
        text: `Your ${label}-hand crescendo dipped ${locationPhrase(dips)}.`,
      });
    }
    if (swells.length > 0) {
      candidates.push({
        severity: swells.length,
        text: `Your ${label}-hand diminuendo got louder instead of softer ${locationPhrase(swells)}.`,
      });
    }
    if (d.range < 30) {
      candidates.push({
        severity: (30 - d.range) / 10,
        text: `Your ${label}-hand dynamic range is only ${d.range.toFixed(0)} — grow more from soft to loud.`,
      });
    }
  }

  if (m.timing) {
    if (Math.abs(m.timing.offset) > 0.05) {
      candidates.push({
        severity: Math.abs(m.timing.offset) * 10,
        text: `You're ${m.timing.offset > 0 ? "dragging" : "rushing"} the whole run, about ${(Math.abs(m.timing.offset) * 100).toFixed(0)}% off tempo.`,
      });
    }
    if (Math.abs(m.timing.drift) > 0.1) {
      candidates.push({
        severity: Math.abs(m.timing.drift) * 5,
        text: `You ${m.timing.drift > 0 ? "slow down" : "speed up"} noticeably over the course of the run.`,
      });
    }
    if (m.timing.jitter > 0.08) {
      candidates.push({
        severity: m.timing.jitter * 8,
        text: `Individual notes land unevenly — timing jitter is ${(m.timing.jitter * 100).toFixed(0)}% of a beat.`,
      });
    }
  }

  // One hand changing tempo relative to the other. Without this the fault is split
  // between a halved `drift` and an inflated `sync_error`, and the report never names
  // the hand responsible.
  if (m.timingPerHand && m.timingPerHand.driftDifference !== null && Math.abs(m.timingPerHand.driftDifference) > 0.1) {
    const diff = m.timingPerHand.driftDifference;
    const slowing = diff > 0 ? "left" : "right";
    const other = slowing === "left" ? "right" : "left";
    candidates.push({
      severity: Math.abs(diff) * 5,
      text: `Your ${slowing} hand is losing tempo relative to your ${other} hand over the run.`,
    });
  }

  if (m.balance !== null && Math.abs(m.balance) > 10) {
    const weak = m.balance < 0 ? "left" : "right";
    candidates.push({
      severity: Math.abs(m.balance) / 10,
      text: `Your ${weak} hand is systematically softer than your ${weak === "left" ? "right" : "left"} by ${Math.abs(m.balance).toFixed(0)} velocity units.`,
    });
  }

  for (const hand of ["L", "R"]) {
    const artKey = hand === "L" ? "L" : "R";
    if (!m.legato) continue;
    const art = m.legato[artKey];
    const label = hand === "L" ? "left" : "right";
    const variance = m.legato[hand === "L" ? "varL" : "varR"];
    if (art > 0.3) {
      candidates.push({ severity: art * 3, text: `Your ${label}-hand notes are detached rather than legato.` });
    } else if (art < -0.2) {
      candidates.push({ severity: -art * 3, text: `Your ${label}-hand notes are overlapping — aim for clean legato.` });
    }
    // The fault the signed mean cannot see: overlaps and gaps cancelling to ~0. When the
    // spread exceeds the tendency, inconsistency is the real problem.
    if (variance !== undefined && variance > 0.15 && variance > Math.abs(art)) {
      candidates.push({
        severity: variance * 3,
        text: `Your ${label}-hand articulation is uneven — some notes run together while others are clipped short.`,
      });
    }
  }

  candidates.sort((a, b) => b.severity - a.severity);
  return candidates.slice(0, 3).map((c) => c.text);
}
