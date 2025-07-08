import { signal } from '@preact/signals-core';

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
  const birdSignal = signal({
    notes: [],
    currentTime: 0,
    currentBeat: 0,
    currentMeasure: 0,
    beatInMeasure: 0,
    loopIteration: 0,
    isCurrentMeasureActive: true,
    activeMeasures: [],
    loopLengthSeconds: getLoopLengthSeconds(config.bpm),
    loopProgress: 0,
    upcomingNotesCount: 0,
    recentlyPlayedNotesCount: 0,
    currentlyPlayingNotesCount: 0
  });
  const getCurrentTime = config.timers?.getCurrentTime || getCurrentPlaybackTime;
  const setIntervalTimer = config.timers?.setInterval || setInterval;
  const clearIntervalTimer = config.timers?.clearInterval || clearInterval;
  const updateNotes = () => {
    const currentTime = getCurrentTime();
    const loopLength = getLoopLengthSeconds(config.bpm);
    getArrangementPosition(config.bpm);
    const notes = [];
    const beatsPerSecond = config.bpm / 60;
    const secondsPerBeat = 1 / beatsPerSecond;
    const lookaheadDistance = config.lookaheadDistance || 2;
    const retentionTime = config.retentionTime || 0.5;
    const lookaheadEndTime = currentTime + lookaheadDistance;
    const retentionStartTime = currentTime - retentionTime;
    const currentLoopTime = currentTime % loopLength;
    const currentLoopIteration = Math.floor(currentTime / loopLength);
    const currentBeat = currentTime * beatsPerSecond;
    const currentMeasure = Math.floor(currentBeat % 64 / 4);
    const beatInMeasure = Math.floor(currentBeat % 64 % 4);
    let upcomingNotesCount = 0;
    let recentlyPlayedNotesCount = 0;
    let currentlyPlayingNotesCount = 0;
    const lookaheadEndLoopTime = currentLoopTime + lookaheadDistance;
    const loopsToCheck = lookaheadEndLoopTime > loopLength ? 2 : 1;
    for (let loopOffset = 0; loopOffset < loopsToCheck; loopOffset++) {
      const loopStartTime = (currentLoopIteration + loopOffset) * loopLength;
      for (let measure = 0; measure < 16; measure++) {
        const isMeasureActive = config.arrangement?.[measure] ?? true;
        if (isMeasureActive) {
          for (const note of config.notes) {
            const noteStartTimeInLoop = note.start * secondsPerBeat;
            const noteEndTimeInLoop = noteStartTimeInLoop + note.duration * secondsPerBeat;
            const measureStartTimeInLoop = measure * 4 * secondsPerBeat;
            const noteStartTimeGlobal = loopStartTime + measureStartTimeInLoop + noteStartTimeInLoop;
            const noteEndTimeGlobal = loopStartTime + measureStartTimeInLoop + noteEndTimeInLoop;
            const noteIsCurrentlyPlaying = currentTime >= noteStartTimeGlobal && currentTime < noteEndTimeGlobal;
            const noteWillPlaySoon = noteStartTimeGlobal >= currentTime && noteStartTimeGlobal < lookaheadEndTime;
            const noteRecentlyPlayed = noteEndTimeGlobal >= retentionStartTime && noteEndTimeGlobal <= currentTime;
            if (noteIsCurrentlyPlaying) {
              currentlyPlayingNotesCount++;
            }
            if (noteWillPlaySoon) {
              upcomingNotesCount++;
            }
            if (noteRecentlyPlayed) {
              recentlyPlayedNotesCount++;
            }
            if (noteIsCurrentlyPlaying || noteWillPlaySoon || noteRecentlyPlayed) {
              notes.push({
                id: note.id,
                note,
                startTime: noteStartTimeGlobal * 1e3,
                // Convert to ms
                endTime: noteEndTimeGlobal * 1e3
                // Convert to ms
              });
            }
          }
        }
      }
    }
    notes.sort((a, b) => a.startTime - b.startTime);
    const activeMeasures = [];
    for (let i = 0; i < 16; i++) {
      if (config.arrangement?.[i] ?? true) {
        activeMeasures.push(i);
      }
    }
    const isCurrentMeasureActive = config.arrangement?.[currentMeasure] ?? true;
    birdSignal.value = {
      notes,
      currentTime,
      currentBeat: currentBeat % 64,
      currentMeasure,
      beatInMeasure,
      loopIteration: currentLoopIteration,
      isCurrentMeasureActive,
      activeMeasures,
      loopLengthSeconds: loopLength,
      loopProgress: currentLoopTime / loopLength,
      upcomingNotesCount,
      recentlyPlayedNotesCount,
      currentlyPlayingNotesCount
    };
  };
  const updateInterval = config.updateInterval || 50;
  const updateTimer = setIntervalTimer(() => {
    updateNotes();
  }, updateInterval);
  updateNotes();
  const getCurrentTiming = () => {
    const state = birdSignal.value;
    return {
      time: state.currentTime,
      beat: state.currentBeat,
      measure: state.currentMeasure,
      beatInMeasure: state.beatInMeasure,
      loopIteration: state.loopIteration,
      loopProgress: state.loopProgress
    };
  };
  const getArrangementStatus = () => {
    const state = birdSignal.value;
    return {
      isCurrentMeasureActive: state.isCurrentMeasureActive,
      activeMeasures: state.activeMeasures,
      currentMeasure: state.currentMeasure
    };
  };
  const getPerformanceStats = () => {
    const state = birdSignal.value;
    return {
      totalNotes: state.notes.length,
      currentlyPlaying: state.currentlyPlayingNotesCount,
      upcoming: state.upcomingNotesCount,
      recentlyPlayed: state.recentlyPlayedNotesCount
    };
  };
  const getNotesByStatus = () => {
    const state = birdSignal.value;
    const currentTime = state.currentTime * 1e3;
    return {
      currentlyPlaying: state.notes.filter(
        (note) => currentTime >= note.startTime && currentTime < note.endTime
      ),
      upcoming: state.notes.filter((note) => note.startTime > currentTime),
      recentlyPlayed: state.notes.filter((note) => note.endTime <= currentTime)
    };
  };
  const getLoopInfo = () => {
    const state = birdSignal.value;
    return {
      loopLength: state.loopLengthSeconds,
      progress: state.loopProgress,
      iteration: state.loopIteration,
      timeInLoop: state.currentTime % state.loopLengthSeconds
    };
  };
  return {
    signal: birdSignal,
    dispose: () => {
      clearIntervalTimer(updateTimer);
    },
    // Helper methods for UI rendering
    getCurrentTiming,
    getArrangementStatus,
    getPerformanceStats,
    getNotesByStatus,
    getLoopInfo
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
  if (config.lookaheadDistance !== void 0) {
    if (typeof config.lookaheadDistance !== "number" || config.lookaheadDistance <= 0) {
      throw new Error("Lookahead distance must be a positive number");
    }
  }
  if (config.updateInterval !== void 0) {
    if (typeof config.updateInterval !== "number" || config.updateInterval <= 0) {
      throw new Error("Update interval must be a positive number");
    }
  }
  if (config.retentionTime !== void 0) {
    if (typeof config.retentionTime !== "number" || config.retentionTime < 0) {
      throw new Error("Retention time must be a non-negative number");
    }
  }
  if (config.timers !== void 0) {
    if (config.timers.getCurrentTime !== void 0 && typeof config.timers.getCurrentTime !== "function") {
      throw new Error("getCurrentTime must be a function");
    }
    if (config.timers.setInterval !== void 0 && typeof config.timers.setInterval !== "function") {
      throw new Error("setInterval must be a function");
    }
    if (config.timers.clearInterval !== void 0 && typeof config.timers.clearInterval !== "function") {
      throw new Error("clearInterval must be a function");
    }
  }
}

export { BASE_BPM, RATIO_SET, STANDARD_BPMS, createBird, createNote, getArrangementPosition, getBeatInMeasure, getCurrentBeat, getCurrentMeasure, getCurrentPlaybackTime, getLoopLengthSeconds, getStandardBpms, snapBpm };
