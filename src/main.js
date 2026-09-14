import { isSupported, requestAccess, listInputs, Recorder } from "./midi.js";
import { analyzeRun, pitchName } from "./run.js";
import { loadHistory, saveRun, exportHistoryBlob } from "./storage.js";
import {
  renderDeviceOptions,
  appendRawLogLine,
  renderSubmetrics,
  renderNoteStrip,
  renderVelocityChart,
  renderFindings,
  renderFlags,
  renderHistorySparkline,
} from "./ui.js";
import { generateFindings } from "./findings.js";

const screens = {
  unsupported: document.getElementById("unsupported-screen"),
  onboarding: document.getElementById("onboarding-screen"),
  config: document.getElementById("config-screen"),
  run: document.getElementById("run-screen"),
  report: document.getElementById("report-screen"),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

let midiAccess = null;
let inputs = [];
let recorder = null;

function currentConfig() {
  return {
    root: "C",
    mode: "major",
    octaves: Number(document.getElementById("octaves-select").value),
    bpm: Number(document.getElementById("bpm-input").value),
    notesPerBeat: Number(document.getElementById("notes-per-beat-select").value),
    handInterval: Number(document.getElementById("hand-interval-input").value),
    metronome: document.getElementById("metronome-checkbox").checked,
  };
}

function validateConfig() {
  const bpmInput = document.getElementById("bpm-input");
  const startBtn = document.getElementById("start-btn");
  const errorEl = document.getElementById("config-error");
  const bpm = Number(bpmInput.value);
  const deviceSelect = document.getElementById("device-select");
  const hasDevice = inputs.length > 0 && deviceSelect.value !== "";
  const valid = bpm > 0 && hasDevice;
  startBtn.disabled = !valid;
  errorEl.hidden = true;
  return valid;
}

async function connectMidi() {
  const errorEl = document.getElementById("connect-error");
  errorEl.hidden = true;
  try {
    midiAccess = await requestAccess();
    inputs = listInputs(midiAccess);
    renderDeviceOptions(document.getElementById("device-select"), inputs);
    midiAccess.onstatechange = () => {
      inputs = listInputs(midiAccess);
      renderDeviceOptions(document.getElementById("device-select"), inputs);
      validateConfig();
    };
    showScreen("config");
    validateConfig();
  } catch (err) {
    errorEl.textContent = "Couldn't get access to your piano. Click Allow when Chrome asks, then try again.";
    errorEl.hidden = false;
  }
}

function startRun() {
  const config = currentConfig();
  const deviceIndex = Number(document.getElementById("device-select").value);
  const input = inputs[deviceIndex];
  if (!input) return;

  recorder = new Recorder(input);
  const rawLog = document.getElementById("raw-log");
  const liveCount = document.getElementById("live-count");
  rawLog.innerHTML = "";
  let count = 0;

  recorder.onRaw = (raw) => {
    if (raw.type === "on") appendRawLogLine(rawLog, `note on  ${pitchName(raw.pitch)} vel ${raw.velocity}`);
    else if (raw.type === "off") appendRawLogLine(rawLog, `note off ${pitchName(raw.pitch)}`);
    else if (raw.type === "pedal") appendRawLogLine(rawLog, `pedal ${raw.value}`);
  };
  recorder.onEvent = () => {
    count++;
    liveCount.textContent = `${count} note${count === 1 ? "" : "s"}`;
  };

  recorder.start();
  showScreen("run");
}

function stopRun() {
  if (!recorder) return;
  const { events, pedalDetected } = recorder.stop();
  const config = currentConfig();

  if (events.length === 0) {
    showScreen("config");
    return;
  }

  const run = analyzeRun(config, events, pedalDetected);
  const { _detail, ...persistable } = run;
  const history = saveRun(persistable);
  renderReport(run, history);
  showScreen("report");
}

function renderReport(run, history) {
  renderFlags(document.getElementById("report-flags"), run);
  renderSubmetrics(document.getElementById("submetric-bars"), run);
  renderNoteStrip(document.getElementById("note-strip"), run);
  renderVelocityChart(document.getElementById("velocity-chart"), run);
  renderFindings(document.getElementById("findings-list"), generateFindings(run));
  renderHistorySparkline(document.getElementById("history-sparkline"), history);
}

function exportHistory() {
  const blob = exportHistoryBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scale-practice-history-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function init() {
  if (!isSupported()) {
    showScreen("unsupported");
    return;
  }
  showScreen("onboarding");

  document.getElementById("connect-btn").addEventListener("click", connectMidi);
  document.getElementById("device-select").addEventListener("change", validateConfig);
  document.getElementById("bpm-input").addEventListener("input", validateConfig);
  document.getElementById("start-btn").addEventListener("click", startRun);
  document.getElementById("stop-btn").addEventListener("click", stopRun);
  document.getElementById("export-btn").addEventListener("click", exportHistory);
  document.getElementById("new-run-btn").addEventListener("click", () => showScreen("config"));
}

init();
