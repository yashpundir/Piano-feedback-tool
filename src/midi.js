// Web MIDI input layer: device access, event capture, sustain pedal watch.

export function isSupported() {
  return navigator.requestMIDIAccess !== undefined;
}

export async function requestAccess() {
  return navigator.requestMIDIAccess();
}

export function listInputs(access) {
  return Array.from(access.inputs.values());
}

// Wraps one MIDI input, turning raw messages into note events during a run.
export class Recorder {
  constructor(input) {
    this.input = input;
    this.recording = false;
    this.events = [];
    this.pedalDetected = false;
    this.onEvent = null; // (event) => void, called on every completed note (onset+offset)
    this.onRaw = null; // (raw {type, pitch, velocity, timeStamp}) => void, for the live log
    this._open = new Map(); // pitch -> { pitch, velocity, onset }

    input.onmidimessage = (msg) => this._handle(msg);
  }

  start() {
    this.recording = true;
    this.events = [];
    this.pedalDetected = false;
    this._open.clear();
  }

  stop() {
    this.recording = false;
    return { events: this.events.slice(), pedalDetected: this.pedalDetected };
  }

  _handle(msg) {
    const [status, data1, data2] = msg.data;
    const type = status & 0xf0;
    const timeStamp = msg.timeStamp;

    if (type === 0xb0 && data1 === 64) {
      const pedalDown = data2 > 63;
      if (this.onRaw) this.onRaw({ type: "pedal", value: data2, timeStamp });
      if (this.recording && pedalDown) this.pedalDetected = true;
      return;
    }

    const isNoteOn = type === 0x90 && data2 > 0;
    const isNoteOff = type === 0x80 || (type === 0x90 && data2 === 0);

    if (isNoteOn) {
      if (this.onRaw) this.onRaw({ type: "on", pitch: data1, velocity: data2, timeStamp });
      if (!this.recording) return;
      this._open.set(data1, { pitch: data1, velocity: data2, onset: timeStamp });
    } else if (isNoteOff) {
      if (this.onRaw) this.onRaw({ type: "off", pitch: data1, timeStamp });
      if (!this.recording) return;
      const open = this._open.get(data1);
      if (!open) return; // note-off with no matching note-on during this run
      this._open.delete(data1);
      const event = { pitch: open.pitch, velocity: open.velocity, onset: open.onset, offset: timeStamp };
      this.events.push(event);
      if (this.onEvent) this.onEvent(event);
    }
  }
}
