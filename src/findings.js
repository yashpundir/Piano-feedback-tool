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

  if (m.crossings) {
    for (const hand of ["RH", "LH"]) {
      const c = m.crossings[hand];
      const idx = m.crossings.indices[hand];
      if (!c || idx.length === 0) continue;
      const bits = [];
      if (Math.abs(c.bumpV) > 5) bits.push(`${Math.abs(c.bumpV).toFixed(0)} velocity units ${c.bumpV > 0 ? "louder" : "softer"}`);
      if (Math.abs(c.bumpT) > 10) bits.push(`about ${Math.abs(c.bumpT).toFixed(0)} ms ${c.bumpT > 0 ? "late" : "early"}`);
      if (bits.length === 0) continue;
      const label = hand === "RH" ? "right-hand" : "left-hand";
      candidates.push({
        severity: Math.max(Math.abs(c.bumpV) / 5, Math.abs(c.bumpT) / 10),
        text: `Your ${label} thumb crossings average ${bits.join(" and ")} than the rest of the scale.`,
      });
    }
  }

  for (const hand of ["L", "R"]) {
    const d = m.dynamics[hand];
    if (!d) continue;
    const label = hand === "L" ? "left" : "right";
    if (d.reversals.length > 0) {
      candidates.push({
        severity: d.reversals.length,
        text: `Your ${label}-hand crescendo dipped at note${d.reversals.length > 1 ? "s" : ""} ${d.reversals.map((i) => i + 1).join(", ")}.`,
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
    if (art > 0.3) {
      candidates.push({ severity: art * 3, text: `Your ${label}-hand notes are detached rather than legato.` });
    } else if (art < -0.2) {
      candidates.push({ severity: -art * 3, text: `Your ${label}-hand notes are overlapping — aim for clean legato.` });
    }
  }

  candidates.sort((a, b) => b.severity - a.severity);
  return candidates.slice(0, 3).map((c) => c.text);
}
