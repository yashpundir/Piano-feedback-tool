import { pitchName } from "./run.js";
import { idealRamp } from "./metrics.js";

export function renderDeviceOptions(select, inputs) {
  select.innerHTML = "";
  if (inputs.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No MIDI devices found — check the USB cable";
    select.appendChild(opt);
    return;
  }
  inputs.forEach((input, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = input.name || `Device ${i + 1}`;
    select.appendChild(opt);
  });
}

export function appendRawLogLine(container, line) {
  const div = document.createElement("div");
  div.textContent = line;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  while (container.childElementCount > 200) {
    container.removeChild(container.firstChild);
  }
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function bar(label, valueText, closeness, explanation) {
  const row = document.createElement("div");
  row.className = "submetric-row";
  if (explanation) row.title = explanation;
  const labelEl = document.createElement("div");
  labelEl.textContent = label;
  const track = document.createElement("div");
  track.className = "bar-track";
  const fill = document.createElement("div");
  fill.className = "bar-fill";
  const pct = Math.round(clamp01(closeness) * 100);
  fill.style.width = `${pct}%`;
  fill.style.background = pct > 70 ? "var(--green)" : pct > 40 ? "var(--amber)" : "var(--red)";
  track.appendChild(fill);
  const valueEl = document.createElement("div");
  valueEl.textContent = valueText;
  row.appendChild(labelEl);
  row.appendChild(track);
  row.appendChild(valueEl);
  return row;
}

export function renderSubmetrics(container, run) {
  container.innerHTML = "";
  const m = run.metrics;

  container.appendChild(
    bar("Note accuracy", `${(m.correctness.accuracy * 100).toFixed(0)}%`, m.correctness.accuracy,
      "How many notes were the right ones. Wrong, extra and missed notes all count against it.")
  );

  if (m.timing) {
    container.appendChild(
      bar("Timing evenness", `${(m.timing.jitter * 100).toFixed(1)}% of a beat`, 1 - m.timing.jitter / 0.2,
        "How much individual notes landed early or late, measured against your own tempo. Smaller is steadier.")
    );
    container.appendChild(
      bar("Tempo", `${(m.timing.offset * 100).toFixed(1)}% ${m.timing.offset >= 0 ? "slow" : "fast"}`, 1 - Math.abs(m.timing.offset) / 0.2,
        "How far your average speed was from the tempo you set. Positive means you played slower than the target.")
    );
  }

  if (m.sync) {
    container.appendChild(
      bar("Hand sync", `${m.sync.error.toFixed(1)} ms apart`, 1 - m.sync.error / 50,
        "How far apart your hands struck notes that should have sounded together.")
    );
  }

  const shapes = [m.dynamics.L?.shape, m.dynamics.R?.shape].filter((x) => x !== undefined && x !== null);
  if (shapes.length) {
    const avgShape = shapes.reduce((a, b) => a + b, 0) / shapes.length;
    container.appendChild(
      bar("Dynamics shape", `${(avgShape * 100).toFixed(0)}%`, avgShape,
        "How closely your loudness traced the ideal shape: growing evenly to the top note, then back down.")
    );
  }

  if (m.legato) {
    // Scored on the unsigned mean, not the signed one: a run that overlaps as much as it
    // gaps is not legato, but its signed mean is ~0 and would have scored perfect here.
    const avgAbs = ((m.legato.absL ?? Math.abs(m.legato.L)) + (m.legato.absR ?? Math.abs(m.legato.R))) / 2;
    container.appendChild(
      bar("Note connection", `${(avgAbs * 100).toFixed(0)}% of a beat off`, 1 - avgAbs / 0.5,
        "How far your notes were from joining up cleanly — the typical gap or overlap between one note ending and the next starting, as a share of a beat. 0% is perfect legato.")
    );
    const avgVar = (m.legato.varL + m.legato.varR) / 2;
    container.appendChild(
      bar("Connection consistency", `varies ±${(avgVar * 100).toFixed(0)}% of a beat`, 1 - avgVar / 0.3,
        "Whether you join notes the same way every time. A small number means every note is connected alike; a large one means some run together while others are clipped short.")
    );
  }

  if (m.balance !== null && m.balance !== undefined) {
    const quieter = m.balance < 0 ? "left" : "right";
    container.appendChild(
      bar("Hand balance", `${quieter} softer by ${Math.abs(m.balance).toFixed(0)}`, 1 - Math.abs(m.balance) / 30,
        "Difference in average loudness between your hands, in MIDI velocity units. 0 means they are evenly matched.")
    );
  }
}

// Per-hand timing drill-down. Deliberately a table of raw numbers rather than bars:
// per-hand jitter is NOT comparable to the paired jitter above it (averaging two
// independent onsets halves the noise variance, so paired jitter reads ~1/√2 of
// per-hand jitter even when nothing is wrong). Bars side by side would invite exactly
// that false comparison.
export function renderPerHandTiming(container, run) {
  container.innerHTML = "";
  const ph = run.metrics.timingPerHand;
  if (!ph || (!ph.L && !ph.R)) {
    container.textContent = "Not enough notes in one hand to measure each hand separately.";
    return;
  }

  const table = document.createElement("table");
  table.className = "perhand-table";
  table.innerHTML = `
    <thead><tr><th></th><th>Tempo (offset)</th><th>Drift</th><th>Jitter</th></tr></thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  const signed = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
  for (const [key, label] of [["R", "Right hand"], ["L", "Left hand"]]) {
    const t = ph[key];
    const tr = document.createElement("tr");
    tr.innerHTML = t
      ? `<th>${label}</th><td>${signed(t.offset)}</td><td>${signed(t.drift)}</td><td>${(t.jitter * 100).toFixed(1)}%</td>`
      : `<th>${label}</th><td colspan="3">not enough notes</td>`;
    tbody.appendChild(tr);
  }
  container.appendChild(table);

  if (ph.driftDifference !== null) {
    const diff = ph.driftDifference;
    const note = document.createElement("p");
    note.className = "hint";
    if (Math.abs(diff) > 0.1) {
      const slowing = diff > 0 ? "left" : "right";
      note.textContent = `Drift difference ${signed(diff)} — your ${slowing} hand is losing tempo relative to the other over the run.`;
    } else {
      note.textContent = `Drift difference ${signed(diff)} — both hands are holding tempo about equally.`;
    }
    container.appendChild(note);
  }

  const caveat = document.createElement("p");
  caveat.className = "hint caveat";
  caveat.textContent =
    "These are each hand measured against its own pulse, so they don't line up with the combined jitter above — averaging two hands cancels some of the noise, which makes the combined figure read lower by design. Compare each hand to the other, not to the headline number.";
  container.appendChild(caveat);

  // On a mismatched run the hands were separated unreliably, so these per-hand streams
  // may contain notes attributed to the wrong hand. Reporting large drift/jitter without
  // saying so would present a separation failure as a playing fault.
  if (run.handMismatch) {
    const warn = document.createElement("p");
    warn.className = "hint caveat";
    warn.textContent =
      "Treat these with caution for this run: the two hands came out with different note counts, which usually means notes were assigned to the wrong hand. Large drift or jitter figures here are more likely a sign of that than of your playing.";
    container.appendChild(warn);
  }
}

function colorClass(value, greenMax, amberMax) {
  if (value === null || value === undefined || Number.isNaN(value)) return "na";
  const v = Math.abs(value);
  if (v < greenMax) return "g";
  if (v < amberMax) return "a";
  return "r";
}

export function renderNoteStrip(container, run) {
  container.innerHTML = "";
  const { expected, L, R, T } = run._detail;
  const timing = run._detail.timing;
  const N = expected.N;

  const grid = document.createElement("div");
  grid.className = "strip-grid";
  grid.style.gridTemplateColumns = `100px repeat(${N}, 22px)`;
  grid.style.display = "grid";

  const rows = [
    { name: "Note (RH)", cells: expected.RH.map((p) => pitchName(p)), isLabel: true },
    {
      name: "Timing",
      cells: Array.from({ length: N }, (_, i) => {
        if (!timing || i >= timing.residuals.length) return null;
        return Math.abs(timing.residuals[i]) / T;
      }),
      thresholds: [0.05, 0.15],
      title: (i, v) => (v === null ? "n/a" : `note ${i + 1}: timing off by ${(v * T).toFixed(0)} ms`),
    },
    {
      name: "Dynamics R",
      cells: Array.from({ length: N }, (_, i) => {
        if (!run._detail.dynamicsR || i >= R.length) return null;
        return R[i].velocity - run._detail.dynamicsR.idealVelocities[i];
      }),
      thresholds: [8, 20],
      title: (i, v) =>
        v === null
          ? "n/a"
          : `note ${i + 1}: played ${R[i].velocity}, ideal ${Math.round(run._detail.dynamicsR.idealVelocities[i])} (${v >= 0 ? "+" : ""}${v.toFixed(0)})`,
    },
    {
      name: "Dynamics L",
      cells: Array.from({ length: N }, (_, i) => {
        if (!run._detail.dynamicsL || i >= L.length) return null;
        return L[i].velocity - run._detail.dynamicsL.idealVelocities[i];
      }),
      thresholds: [8, 20],
      title: (i, v) =>
        v === null
          ? "n/a"
          : `note ${i + 1}: played ${L[i].velocity}, ideal ${Math.round(run._detail.dynamicsL.idealVelocities[i])} (${v >= 0 ? "+" : ""}${v.toFixed(0)})`,
    },
    {
      name: "Hand sync",
      cells: Array.from({ length: N }, (_, i) => {
        if (!run._detail.paired || i >= run._detail.paired.length) return null;
        return run._detail.paired[i].L.onset - run._detail.paired[i].R.onset;
      }),
      thresholds: [10, 25],
      title: (i, v) => (v === null ? "n/a" : `note ${i + 1}: L${v >= 0 ? "+" : ""}${v.toFixed(0)} ms vs R`),
    },
  ];

  for (const row of rows) {
    const label = document.createElement("div");
    label.className = "strip-label";
    label.textContent = row.name;
    grid.appendChild(label);
    row.cells.forEach((v, i) => {
      const cell = document.createElement("div");
      if (row.isLabel) {
        cell.className = "strip-label";
        cell.textContent = v;
        cell.style.fontSize = "0.65rem";
        cell.style.writingMode = "vertical-rl";
      } else {
        cell.className = `strip-cell ${colorClass(v, row.thresholds[0], row.thresholds[1])}`;
        cell.title = row.title(i, v);
      }
      grid.appendChild(cell);
    });
  }

  container.appendChild(grid);
}

export function renderVelocityChart(canvas, run) {
  const { expected, L, R } = run._detail;
  const N = expected.N;

  // Size to the container rather than a fixed 900px, which overflowed the card on any
  // screen narrower than the canvas. Backing store is scaled by devicePixelRatio so the
  // lines stay crisp rather than being stretched from a smaller bitmap.
  const cssWidth = Math.max(320, canvas.parentElement?.clientWidth || 680);
  const cssHeight = 260;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padL = 40;
  const padB = 24;
  const padT = 26;
  const padR = 12;
  const plotW = cssWidth - padL - padR;
  const plotH = cssHeight - padT - padB;

  const x = (i) => padL + (i / (N - 1)) * plotW;
  const y = (v) => padT + plotH - (v / 127) * plotH;

  ctx.strokeStyle = "#ddd8d0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();
  ctx.fillStyle = "#6b6b66";
  ctx.font = "11px sans-serif";
  ctx.fillText("127", 6, y(127) + 4);
  ctx.fillText("0", 6, y(0) + 4);

  // ONE ideal line, not one per hand. The target shape is identical for both hands —
  // two dashed lines only differed because each was rescaled to that hand's own range,
  // which reads as though the hands had different targets. Pooling both hands' min/max
  // puts the single reference where both can be judged against it.
  const allVelocities = [...R, ...L].map((e) => e.velocity);
  if (allVelocities.length > 1) {
    const minV = Math.min(...allVelocities);
    const maxV = Math.max(...allVelocities);
    const u = idealRamp(N, expected.k);
    ctx.strokeStyle = "#6b6b66";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    u.forEach((ui, i) => {
      const px = x(i);
      const py = y(minV + ui * (maxV - minV));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSeries(hand, color) {
    if (hand.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    hand.forEach((e, i) => {
      if (i >= N) return;
      const px = x(i);
      const py = y(e.velocity);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  drawSeries(R, "#2f5d50");
  drawSeries(L, "#b8402f");

  const legend = [
    { color: "#2f5d50", text: "Right hand" },
    { color: "#b8402f", text: "Left hand" },
    { color: "#6b6b66", text: "Ideal shape", dashed: true },
  ];
  let lx = padL;
  ctx.font = "11px sans-serif";
  for (const item of legend) {
    if (item.dashed) {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, 9);
      ctx.lineTo(lx + 14, 9);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, 4, 14, 4);
    }
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(item.text, lx + 19, 12);
    lx += 19 + ctx.measureText(item.text).width + 18;
  }
}

export function renderFindings(container, findings) {
  container.innerHTML = "";
  if (findings.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No standout issues this run — nice and even.";
    container.appendChild(li);
    return;
  }
  findings.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    container.appendChild(li);
  });
}

export function renderFlags(container, run) {
  container.innerHTML = "";
  if (run.pedalDetected) {
    const div = document.createElement("div");
    div.className = "flag pedal";
    div.textContent = "Sustain pedal detected — articulation and evenness scores are unreliable for this run.";
    container.appendChild(div);
  }
  if (run.handMismatch) {
    const div = document.createElement("div");
    div.className = "flag mismatch";
    div.textContent = "Left and right hand note counts didn't match, so timing and hand-sync scores were skipped for this run.";
    container.appendChild(div);
  }
}

export function renderHistorySparkline(container, history) {
  container.innerHTML = "";
  if (history.length === 0) return;
  const jitters = history.map((r) => r.metrics?.timing?.jitter ?? null).filter((x) => x !== null);
  if (jitters.length === 0) return;
  const max = Math.max(...jitters, 0.01);
  jitters.forEach((j) => {
    const bar = document.createElement("div");
    bar.className = "spark-bar";
    bar.style.height = `${Math.max(4, (j / max) * 60)}px`;
    bar.title = `jitter ${(j * 100).toFixed(1)}%`;
    container.appendChild(bar);
  });
}
