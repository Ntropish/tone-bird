"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const signalsCore = require("@preact/signals-core");
const BASE_BPM = 120;
const RATIO_SET = [
  // <num , den>
  [1, 4],
  [1, 3],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [1, 1],
  [6, 5],
  [5, 4],
  [4, 3],
  [3, 2],
  [2, 1]
];
const STANDARD_BPMS = RATIO_SET.map(([n, d]) => BASE_BPM * n / d);
const getStandardBpms = () => STANDARD_BPMS;
const snapBpm = (bpm) => STANDARD_BPMS.reduce(
  (best, c) => Math.abs(c - bpm) < Math.abs(best - bpm) ? c : best,
  STANDARD_BPMS[0]
);
const createNote = (id, start, duration, pitch, options) => ({
  id,
  start,
  duration,
  pitch,
  volume: options?.volume ?? 1,
  pan: options?.pan ?? 0,
  envelope: options?.envelope
});
const getCurrentPlaybackTime = () => {
  const globalEpoch = (/* @__PURE__ */ new Date("2024-01-01T00:00:00Z")).getTime() / 1e3;
  const now = Date.now() / 1e3;
  return now - globalEpoch;
};
const getLoopLengthSeconds = (bpm) => {
  return 16 * 4 * 60 / bpm;
};
const getCurrentBeat = (bpm) => {
  const currentTime = getCurrentPlaybackTime();
  const beatsPerSecond = bpm / 60;
  return currentTime * beatsPerSecond % (16 * 4);
};
const getCurrentMeasure = (bpm) => {
  const currentBeat = getCurrentBeat(bpm);
  return Math.floor(currentBeat / 4);
};
const getBeatInMeasure = (bpm) => {
  const currentBeat = getCurrentBeat(bpm);
  return currentBeat % 4;
};
const getArrangementPosition = (bpm) => {
  const currentTime = getCurrentPlaybackTime();
  const beatsPerSecond = bpm / 60;
  const totalBeats = currentTime * beatsPerSecond;
  const beatsInLoop = totalBeats % 64;
  const measure = Math.floor(beatsInLoop / 4);
  const beatInMeasure = beatsInLoop % 4;
  return {
    measure,
    beatInMeasure,
    totalBeats: beatsInLoop
  };
};
function createBird(config) {
  validateBirdConfig(config);
  const birdSignal = signalsCore.signal({
    currentTime: 0,
    currentBeat: 0,
    currentMeasure: 0,
    beatInMeasure: 0,
    playingNotes: [],
    upcomingNotes: []
  });
  const updatePlayingNotes = () => {
    const currentTime = getCurrentPlaybackTime();
    const loopLength = getLoopLengthSeconds(config.bpm);
    const position = getArrangementPosition(config.bpm);
    const isActiveMeasure = config.arrangement?.[position.measure] ?? true;
    if (!isActiveMeasure) {
      birdSignal.value = {
        ...birdSignal.value,
        currentTime,
        currentBeat: position.totalBeats,
        currentMeasure: position.measure,
        beatInMeasure: position.beatInMeasure,
        playingNotes: [],
        upcomingNotes: []
      };
      return;
    }
    const playingNotes = [];
    const upcomingNotes = [];
    const beatsPerSecond = config.bpm / 60;
    const secondsPerBeat = 1 / beatsPerSecond;
    const loopTime = currentTime % loopLength;
    if (config.upcomingNotes) {
      const { loopInterval, lookaheadDistance } = config.upcomingNotes;
      const lookaheadEndTime = currentTime + lookaheadDistance;
      const currentLoopIteration = Math.floor(currentTime / loopLength);
      const endLoopIteration = Math.ceil(lookaheadEndTime / loopLength);
      for (let loopIteration = currentLoopIteration; loopIteration <= endLoopIteration; loopIteration++) {
        const loopStartTime = loopIteration * loopLength;
        const loopEndTime = loopStartTime + loopLength;
        if (loopStartTime < lookaheadEndTime && loopEndTime > currentTime) {
          for (const note of config.notes) {
            const noteStartTimeInLoop = note.start * secondsPerBeat;
            const noteEndTimeInLoop = noteStartTimeInLoop + note.duration * secondsPerBeat;
            const noteStartTimeGlobal = loopStartTime + noteStartTimeInLoop;
            const noteEndTimeGlobal = loopStartTime + noteEndTimeInLoop;
            if (noteStartTimeGlobal >= currentTime && noteStartTimeGlobal < lookaheadEndTime) {
              const noteBeatInLoop = note.start;
              const noteMeasure = Math.floor(noteBeatInLoop / 4);
              const isNoteMeasureActive = config.arrangement?.[noteMeasure] ?? true;
              if (isNoteMeasureActive) {
                upcomingNotes.push({
                  id: note.id,
                  note,
                  startTime: noteStartTimeGlobal,
                  endTime: noteEndTimeGlobal,
                  loopIteration
                });
              }
            }
          }
        }
      }
      upcomingNotes.sort((a, b) => a.startTime - b.startTime);
    }
    for (const note of config.notes) {
      const noteStartTime = note.start * secondsPerBeat;
      const noteEndTime = noteStartTime + note.duration * secondsPerBeat;
      if (loopTime >= noteStartTime && loopTime < noteEndTime) {
        const noteInstanceStartTime = currentTime - (loopTime - noteStartTime);
        const noteInstanceEndTime = noteInstanceStartTime + note.duration * secondsPerBeat;
        const currentTimeInNote = loopTime - noteStartTime;
        playingNotes.push({
          id: note.id,
          note,
          startTime: noteInstanceStartTime,
          endTime: noteInstanceEndTime,
          currentTime: currentTimeInNote
        });
      }
    }
    birdSignal.value = {
      ...birdSignal.value,
      currentTime,
      currentBeat: position.totalBeats,
      currentMeasure: position.measure,
      beatInMeasure: position.beatInMeasure,
      playingNotes,
      upcomingNotes
    };
  };
  const computedSignal = signalsCore.signal(() => {
    updatePlayingNotes();
    return birdSignal.value;
  });
  return {
    signal: computedSignal
  };
}
function validateBirdConfig(config) {
  if (typeof config.bpm !== "number" || config.bpm <= 0) {
    throw new Error("BPM must be a positive number");
  }
  if (!Array.isArray(config.notes)) {
    throw new Error("Notes must be an array");
  }
  for (let i = 0; i < config.notes.length; i++) {
    const note = config.notes[i];
    if (!note.id || typeof note.id !== "string") {
      throw new Error(`Note ${i}: id must be a non-empty string`);
    }
    if (typeof note.start !== "number" || note.start < 0) {
      throw new Error(`Note ${i}: start must be a non-negative number`);
    }
    if (typeof note.duration !== "number" || note.duration < 1e-3) {
      throw new Error(`Note ${i}: duration must be at least 0.001`);
    }
    if (typeof note.pitch !== "number" || note.pitch <= 0) {
      throw new Error(`Note ${i}: pitch must be a positive number`);
    }
    if (note.volume !== void 0 && (typeof note.volume !== "number" || note.volume < 0 || note.volume > 1)) {
      throw new Error(`Note ${i}: volume must be between 0 and 1`);
    }
    if (note.pan !== void 0 && (typeof note.pan !== "number" || note.pan < -1 || note.pan > 1)) {
      throw new Error(`Note ${i}: pan must be between -1 and 1`);
    }
    if (note.envelope) {
      const env = note.envelope;
      if (env.attack !== void 0 && (typeof env.attack !== "number" || env.attack < 0)) {
        throw new Error(`Note ${i}: envelope attack must be non-negative`);
      }
      if (env.decay !== void 0 && (typeof env.decay !== "number" || env.decay < 0)) {
        throw new Error(`Note ${i}: envelope decay must be non-negative`);
      }
      if (env.sustain !== void 0 && (typeof env.sustain !== "number" || env.sustain < 0 || env.sustain > 1)) {
        throw new Error(`Note ${i}: envelope sustain must be between 0 and 1`);
      }
      if (env.release !== void 0 && (typeof env.release !== "number" || env.release < 0)) {
        throw new Error(`Note ${i}: envelope release must be non-negative`);
      }
    }
  }
  if (config.arrangement !== void 0) {
    if (!Array.isArray(config.arrangement)) {
      throw new Error("Arrangement must be an array");
    }
    if (config.arrangement.length !== 16) {
      throw new Error(
        "Arrangement must have exactly 16 elements (one per measure)"
      );
    }
    for (let i = 0; i < config.arrangement.length; i++) {
      if (typeof config.arrangement[i] !== "boolean") {
        throw new Error(`Arrangement element ${i} must be a boolean`);
      }
    }
  }
  if (config.upcomingNotes !== void 0) {
    const upcoming = config.upcomingNotes;
    if (typeof upcoming.loopInterval !== "number" || upcoming.loopInterval <= 0) {
      throw new Error("Upcoming notes loop interval must be a positive number");
    }
    if (typeof upcoming.lookaheadDistance !== "number" || upcoming.lookaheadDistance <= 0) {
      throw new Error(
        "Upcoming notes lookahead distance must be a positive number"
      );
    }
    if (upcoming.lookaheadDistance < upcoming.loopInterval) {
      throw new Error(
        "Lookahead distance must be at least as large as loop interval"
      );
    }
  }
}
exports.BASE_BPM = BASE_BPM;
exports.RATIO_SET = RATIO_SET;
exports.STANDARD_BPMS = STANDARD_BPMS;
exports.createBird = createBird;
exports.createNote = createNote;
exports.getArrangementPosition = getArrangementPosition;
exports.getBeatInMeasure = getBeatInMeasure;
exports.getCurrentBeat = getCurrentBeat;
exports.getCurrentMeasure = getCurrentMeasure;
exports.getCurrentPlaybackTime = getCurrentPlaybackTime;
exports.getLoopLengthSeconds = getLoopLengthSeconds;
exports.getStandardBpms = getStandardBpms;
exports.snapBpm = snapBpm;
