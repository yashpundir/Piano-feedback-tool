import { pitchName } from "./run.js";

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

function bar(label, valueText, closeness) {
  const row = document.createElement("div");
  row.className = "submetric-row";
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

  container.appendChild(bar("Note accuracy", `${(m.correctness.accuracy * 100).toFixed(0)}%`, m.correctness.accuracy));

  if (m.timing) {
    container.appendChild(bar("Timing evenness", `jitter ${(m.timing.jitter * 100).toFixed(1)}%`, 1 - m.timing.jitter / 0.2));
    container.appendChild(bar("Tempo", `${m.timing.offset >= 0 ? "+" : ""}${(m.timing.offset * 100).toFixed(1)}%`, 1 - Math.abs(m.timing.offset) / 0.2));
  }

  if (m.sync) {
    container.appendChild(bar("Hand sync", `${m.sync.error.toFixed(1)} ms`, 1 - m.sync.error / 50));
  }

  const shapes = [m.dynamics.L?.shape, m.dynamics.R?.shape].filter((x) => x !== undefined && x !== null);
  if (shapes.length) {
    const avgShape = shapes.reduce((a, b) => a + b, 0) / shapes.length;
    container.appendChild(bar("Dynamics shape", `${(avgShape * 100).toFixed(0)}%`, avgShape));
  }

  if (m.legato) {
    // Scored on the unsigned mean, not the signed one: a run that overlaps as much as it
    // gaps is not legato, but its signed mean is ~0 and would have scored perfect here.
    const avgAbs = ((m.legato.absL ?? Math.abs(m.legato.L)) + (m.legato.absR ?? Math.abs(m.legato.R))) / 2;
    container.appendChild(bar("Legato", `${avgAbs.toFixed(2)}× beat off`, 1 - avgAbs / 0.5));
    const avgVar = (m.legato.varL + m.legato.varR) / 2;
    container.appendChild(bar("Legato consistency", `±${avgVar.toFixed(2)}`, 1 - avgVar / 0.3));
  }

  if (m.balance !== null && m.balance !== undefined) {
    container.appendChild(bar("Hand balance", `${m.balance >= 0 ? "+" : ""}${m.balance.toFixed(1)}`, 1 - Math.abs(m.balance) / 30));
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
      title: (i, v) => (v === null ? "n/a" : `note ${i + 1}: velocity ${v >= 0 ? "+" : ""}${v.toFixed(0)} vs ideal`),
    },
    {
      name: "Dynamics L",
      cells: Array.from({ length: N }, (_, i) => {
        if (!run._detail.dynamicsL || i >= L.length) return null;
        return L[i].velocity - run._detail.dynamicsL.idealVelocities[i];
      }),
      thresholds: [8, 20],
      title: (i, v) => (v === null ? "n/a" : `note ${i + 1}: velocity ${v >= 0 ? "+" : ""}${v.toFixed(0)} vs ideal`),
    },
    {
      // Legato per note, so cancelling overlaps and gaps are visible as a mix of
      // colours rather than hidden inside a mean of ~0. gtilde[i] is the gap AFTER
      // note i, so the last note has no cell.
      name: "Legato R",
      cells: Array.from({ length: N }, (_, i) => {
        const g = run._detail.legatoR?.gtilde;
        if (!g || i >= g.length) return null;
        return g[i];
      }),
      thresholds: [0.08, 0.2],
      title: (i, v) =>
        v === null ? "n/a" : `note ${i + 1}: ${v < 0 ? `${(-v * 100).toFixed(0)}% overlap` : `${(v * 100).toFixed(0)}% gap`}`,
    },
    {
      name: "Legato L",
      cells: Array.from({ length: N }, (_, i) => {
        const g = run._detail.legatoL?.gtilde;
        if (!g || i >= g.length) return null;
        return g[i];
      }),
      thresholds: [0.08, 0.2],
      title: (i, v) =>
        v === null ? "n/a" : `note ${i + 1}: ${v < 0 ? `${(-v * 100).toFixed(0)}% overlap` : `${(v * 100).toFixed(0)}% gap`}`,
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
  const ctx = canvas.getContext("2d");
  const { expected, L, R, dynamicsL, dynamicsR } = run._detail;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const padL = 40;
  const padB = 30;
  const padT = 10;
  const padR = 10;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const N = expected.N;

  const x = (i) => padL + (i / (N - 1)) * plotW;
  const y = (v) => padT + plotH - (v / 127) * plotH;

  ctx.strokeStyle = "#ddd8d0";
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();
  ctx.fillStyle = "#6b6b66";
  ctx.font = "11px sans-serif";
  ctx.fillText("127", 4, y(127) + 4);
  ctx.fillText("0", 4, y(0) + 4);

  function drawSeries(hand, dyn, color) {
    if (!dyn || hand.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    hand.forEach((e, i) => {
      const px = x(i);
      const py = y(e.velocity);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    dyn.idealVelocities.forEach((v, i) => {
      const px = x(i);
      const py = y(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  drawSeries(R, dynamicsR, "#2f5d50");
  drawSeries(L, dynamicsL, "#b8402f");

  ctx.fillStyle = "#2f5d50";
  ctx.fillRect(padL, 2, 10, 10);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillText("Right hand (solid) / ideal (dashed)", padL + 14, 11);
  ctx.fillStyle = "#b8402f";
  ctx.fillRect(padL + 260, 2, 10, 10);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillText("Left hand (solid) / ideal (dashed)", padL + 274, 11);
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
