import { signal, effect } from "@preact/signals-core";
import type { BirdNote, Seconds } from "./utils.js";
import {
  getCurrentPlaybackTime,
  getLoopLengthSeconds,
  getArrangementPosition,
} from "./utils.js";

export interface BirdNoteInstance {
  id: string;
  note: BirdNote;
  startTime: number; // When this note instance starts/started playing (in ms)
  endTime: number; // When this note instance will stop playing (in ms)
}

export interface BirdState {
  notes: BirdNoteInstance[];
  // Timing information
  currentTime: number; // Current playback time in seconds
  currentBeat: number; // Current beat within the loop (0-63)
  currentMeasure: number; // Current measure within the loop (0-15)
  beatInMeasure: number; // Current beat within the current measure (0-3)
  loopIteration: number; // Which iteration of the 16-measure loop we're on
  // Arrangement information
  isCurrentMeasureActive: boolean; // Whether the current measure is active in the arrangement
  activeMeasures: number[]; // Array of measure indices that are currently active
  // Loop information
  loopLengthSeconds: number; // Length of one complete loop in seconds
  loopProgress: number; // Progress through current loop (0-1)
  // Performance information
  upcomingNotesCount: number; // Number of notes coming up within lookahead
  recentlyPlayedNotesCount: number; // Number of notes recently played within retention
  currentlyPlayingNotesCount: number; // Number of notes currently playing
}

/**
 * Bird configuration
 */
export interface BirdConfig {
  bpm: number;
  notes: BirdNote[];
  arrangement?: boolean[]; // Array of boolean values for each measure
  /** How often to update the signal (in milliseconds) */
  updateInterval?: number;
  /** How far ahead to look for upcoming notes (in seconds) */
  lookaheadDistance?: number;
  /** How long to keep notes in the array after they finish (in seconds) */
  retentionTime?: number;
  /** Timer functions for testing - defaults to real timers */
  timers?: {
    /** Function to get current time in seconds (defaults to getCurrentPlaybackTime) */
    getCurrentTime?: () => number;
    /** Function to create an interval timer (defaults to setInterval) */
    setInterval?: (callback: () => void, ms: number) => any;
    /** Function to clear an interval timer (defaults to clearInterval) */
    clearInterval?: (timer: any) => void;
  };
}

/**
 * Creates a bird signal that tracks notes based on deterministic timing.
 * The signal provides a unified array of notes that are currently playing,
 * recently played, or upcoming within the specified time windows.
 */
export function createBird(config: BirdConfig) {
  // Validate configuration
  validateBirdConfig(config);

  // Create the main signal
  const birdSignal = signal<BirdState>({
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
    currentlyPlayingNotesCount: 0,
  });

  // Get timer functions with defaults
  const getCurrentTime =
    config.timers?.getCurrentTime || getCurrentPlaybackTime;
  const setIntervalTimer = config.timers?.setInterval || setInterval;
  const clearIntervalTimer = config.timers?.clearInterval || clearInterval;

  // Update function that calculates all relevant notes
  const updateNotes = () => {
    const currentTime = getCurrentTime();
    const loopLength = getLoopLengthSeconds(config.bpm);
    const position = getArrangementPosition(config.bpm);

    const notes: BirdNoteInstance[] = [];
    const beatsPerSecond = config.bpm / 60;
    const secondsPerBeat = 1 / beatsPerSecond;
    const lookaheadDistance = config.lookaheadDistance || 2.0;
    const retentionTime = config.retentionTime || 0.5;

    // Calculate time windows - look for notes that are currently playing or will play soon
    const lookaheadEndTime = currentTime + lookaheadDistance;
    const retentionStartTime = currentTime - retentionTime;

    // Calculate the current position within the loop
    const currentLoopTime = currentTime % loopLength;
    const currentLoopIteration = Math.floor(currentTime / loopLength);
    const currentBeat = currentTime * beatsPerSecond;
    const currentMeasure = Math.floor((currentBeat % 64) / 4);
    const beatInMeasure = Math.floor((currentBeat % 64) % 4);

    // Counters for performance information
    let upcomingNotesCount = 0;
    let recentlyPlayedNotesCount = 0;
    let currentlyPlayingNotesCount = 0;

    // Look ahead for upcoming notes within the lookahead window
    const lookaheadEndLoopTime = currentLoopTime + lookaheadDistance;

    // We need to check the current loop and potentially the next loop
    const loopsToCheck = lookaheadEndLoopTime > loopLength ? 2 : 1;

    for (let loopOffset = 0; loopOffset < loopsToCheck; loopOffset++) {
      const loopStartTime = (currentLoopIteration + loopOffset) * loopLength;
      const loopEndTime = loopStartTime + loopLength;

      // Generate notes for each measure in this loop iteration
      for (let measure = 0; measure < 16; measure++) {
        // Check if this measure is active in the arrangement
        const isMeasureActive = config.arrangement?.[measure] ?? true;

        if (isMeasureActive) {
          // Generate notes for this measure
          for (const note of config.notes) {
            const noteStartTimeInLoop = note.start * secondsPerBeat;
            const noteEndTimeInLoop =
              noteStartTimeInLoop + note.duration * secondsPerBeat;

            // Calculate the measure start time within the loop
            const measureStartTimeInLoop = measure * 4 * secondsPerBeat;

            // Calculate global times for this note in this measure
            const noteStartTimeGlobal =
              loopStartTime + measureStartTimeInLoop + noteStartTimeInLoop;
            const noteEndTimeGlobal =
              loopStartTime + measureStartTimeInLoop + noteEndTimeInLoop;

            // Check if this note instance is currently playing or will play soon
            const noteIsCurrentlyPlaying =
              currentTime >= noteStartTimeGlobal &&
              currentTime < noteEndTimeGlobal;
            const noteWillPlaySoon =
              noteStartTimeGlobal >= currentTime &&
              noteStartTimeGlobal < lookaheadEndTime;
            const noteRecentlyPlayed =
              noteEndTimeGlobal >= retentionStartTime &&
              noteEndTimeGlobal <= currentTime;

            // Count notes for performance information
            if (noteIsCurrentlyPlaying) {
              currentlyPlayingNotesCount++;
            }
            if (noteWillPlaySoon) {
              upcomingNotesCount++;
            }
            if (noteRecentlyPlayed) {
              recentlyPlayedNotesCount++;
            }

            // Only include notes that are currently playing, will play soon, or recently played
            if (
              noteIsCurrentlyPlaying ||
              noteWillPlaySoon ||
              noteRecentlyPlayed
            ) {
              notes.push({
                id: note.id,
                note,
                startTime: noteStartTimeGlobal * 1000, // Convert to ms
                endTime: noteEndTimeGlobal * 1000, // Convert to ms
              });
            }
          }
        }
      }
    }

    // Sort notes by start time
    notes.sort((a, b) => a.startTime - b.startTime);

    // Calculate active measures
    const activeMeasures: number[] = [];
    for (let i = 0; i < 16; i++) {
      if (config.arrangement?.[i] ?? true) {
        activeMeasures.push(i);
      }
    }

    // Check if current measure is active
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
      currentlyPlayingNotesCount,
    };
  };

  // Set up a timer to update the signal periodically
  const updateInterval = config.updateInterval || 50; // Default to 50ms
  const updateTimer = setIntervalTimer(() => {
    updateNotes();
  }, updateInterval);

  // Call updateNotes immediately to populate the signal
  updateNotes();

  // Helper methods for UI rendering
  const getCurrentTiming = () => {
    const state = birdSignal.value;
    return {
      time: state.currentTime,
      beat: state.currentBeat,
      measure: state.currentMeasure,
      beatInMeasure: state.beatInMeasure,
      loopIteration: state.loopIteration,
      loopProgress: state.loopProgress,
    };
  };

  const getArrangementStatus = () => {
    const state = birdSignal.value;
    return {
      isCurrentMeasureActive: state.isCurrentMeasureActive,
      activeMeasures: state.activeMeasures,
      currentMeasure: state.currentMeasure,
    };
  };

  const getPerformanceStats = () => {
    const state = birdSignal.value;
    return {
      totalNotes: state.notes.length,
      currentlyPlaying: state.currentlyPlayingNotesCount,
      upcoming: state.upcomingNotesCount,
      recentlyPlayed: state.recentlyPlayedNotesCount,
    };
  };

  const getNotesByStatus = () => {
    const state = birdSignal.value;
    const currentTime = state.currentTime * 1000; // Convert to ms for comparison

    return {
      currentlyPlaying: state.notes.filter(
        (note) => currentTime >= note.startTime && currentTime < note.endTime
      ),
      upcoming: state.notes.filter((note) => note.startTime > currentTime),
      recentlyPlayed: state.notes.filter((note) => note.endTime <= currentTime),
    };
  };

  const getLoopInfo = () => {
    const state = birdSignal.value;
    return {
      loopLength: state.loopLengthSeconds,
      progress: state.loopProgress,
      iteration: state.loopIteration,
      timeInLoop: state.currentTime % state.loopLengthSeconds,
    };
  };

  // Return the signal and cleanup function
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
    getLoopInfo,
  };
}

/**
 * Validates a bird configuration and throws an error if invalid.
 */
function validateBirdConfig(config: BirdConfig): void {
  // Validate BPM
  if (typeof config.bpm !== "number" || config.bpm <= 0) {
    throw new Error("BPM must be a positive number");
  }

  // Validate notes array
  if (!Array.isArray(config.notes)) {
    throw new Error("Notes must be an array");
  }

  // Validate each note
  for (let i = 0; i < config.notes.length; i++) {
    const note = config.notes[i];

    if (!note.id || typeof note.id !== "string") {
      throw new Error(`Note ${i}: id must be a non-empty string`);
    }

    if (typeof note.start !== "number" || note.start < 0) {
      throw new Error(`Note ${i}: start must be a non-negative number`);
    }

    if (typeof note.duration !== "number" || note.duration < 0.001) {
      throw new Error(`Note ${i}: duration must be at least 0.001`);
    }

    if (typeof note.pitch !== "number" || note.pitch <= 0) {
      throw new Error(`Note ${i}: pitch must be a positive number`);
    }

    if (
      note.volume !== undefined &&
      (typeof note.volume !== "number" || note.volume < 0 || note.volume > 1)
    ) {
      throw new Error(`Note ${i}: volume must be between 0 and 1`);
    }

    if (
      note.pan !== undefined &&
      (typeof note.pan !== "number" || note.pan < -1 || note.pan > 1)
    ) {
      throw new Error(`Note ${i}: pan must be between -1 and 1`);
    }

    // Validate envelope if present
    if (note.envelope) {
      const env = note.envelope;
      if (
        env.attack !== undefined &&
        (typeof env.attack !== "number" || env.attack < 0)
      ) {
        throw new Error(`Note ${i}: envelope attack must be non-negative`);
      }
      if (
        env.decay !== undefined &&
        (typeof env.decay !== "number" || env.decay < 0)
      ) {
        throw new Error(`Note ${i}: envelope decay must be non-negative`);
      }
      if (
        env.sustain !== undefined &&
        (typeof env.sustain !== "number" || env.sustain < 0 || env.sustain > 1)
      ) {
        throw new Error(`Note ${i}: envelope sustain must be between 0 and 1`);
      }
      if (
        env.release !== undefined &&
        (typeof env.release !== "number" || env.release < 0)
      ) {
        throw new Error(`Note ${i}: envelope release must be non-negative`);
      }
    }
  }

  // Validate arrangement if present
  if (config.arrangement !== undefined) {
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

  // Validate lookahead distance if present
  if (config.lookaheadDistance !== undefined) {
    if (
      typeof config.lookaheadDistance !== "number" ||
      config.lookaheadDistance <= 0
    ) {
      throw new Error("Lookahead distance must be a positive number");
    }
  }

  // Validate update interval if present
  if (config.updateInterval !== undefined) {
    if (
      typeof config.updateInterval !== "number" ||
      config.updateInterval <= 0
    ) {
      throw new Error("Update interval must be a positive number");
    }
  }

  // Validate retention time if present
  if (config.retentionTime !== undefined) {
    if (typeof config.retentionTime !== "number" || config.retentionTime < 0) {
      throw new Error("Retention time must be a non-negative number");
    }
  }

  // Validate timer functions if present
  if (config.timers !== undefined) {
    if (
      config.timers.getCurrentTime !== undefined &&
      typeof config.timers.getCurrentTime !== "function"
    ) {
      throw new Error("getCurrentTime must be a function");
    }
    if (
      config.timers.setInterval !== undefined &&
      typeof config.timers.setInterval !== "function"
    ) {
      throw new Error("setInterval must be a function");
    }
    if (
      config.timers.clearInterval !== undefined &&
      typeof config.timers.clearInterval !== "function"
    ) {
      throw new Error("clearInterval must be a function");
    }
  }
}
