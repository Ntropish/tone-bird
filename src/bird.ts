import { signal, effect } from "@preact/signals-core";
import type { BirdNote, Seconds } from "./utils.js";
import {
  getCurrentPlaybackTime,
  getLoopLengthSeconds,
  getArrangementPosition,
} from "./utils.js";

export interface PlayingNote {
  id: string;
  note: BirdNote;
  startTime: number; // When this note instance started playing
  endTime: number; // When this note instance will stop playing
  currentTime: number; // Current time within this note (0 to duration)
}

export interface UpcomingNote {
  id: string;
  note: BirdNote;
  startTime: number; // When this note instance will start playing
  endTime: number; // When this note instance will stop playing
  loopIteration: number; // Which loop iteration this note belongs to
}

export interface BirdState {
  currentTime: number;
  currentBeat: number;
  currentMeasure: number;
  beatInMeasure: number;
  playingNotes: PlayingNote[];
  upcomingNotes: UpcomingNote[];
}

/**
 * Configuration for upcoming notes generation
 */
export interface UpcomingNotesConfig {
  /** How often to update the upcoming notes array (in seconds) */
  loopInterval: number;
  /** How far ahead to look for upcoming notes (in seconds) */
  lookaheadDistance: number;
}

/**
 * Bird configuration
 */
export interface BirdConfig {
  bpm: number;
  notes: BirdNote[];
  arrangement?: boolean[]; // Array of boolean values for each measure
  isPlaying?: boolean;
  upcomingNotes?: UpcomingNotesConfig;
}

/**
 * Creates a bird signal that tracks currently playing notes based on deterministic timing.
 * The signal updates in real-time to reflect which notes should be playing at the current moment.
 */
export function createBird(config: BirdConfig) {
  // Validate configuration
  validateBirdConfig(config);

  // Create the main signal
  const birdSignal = signal<BirdState>({
    currentTime: 0,
    currentBeat: 0,
    currentMeasure: 0,
    beatInMeasure: 0,
    playingNotes: [],
    upcomingNotes: [],
  });

  // Update function that calculates currently playing notes and upcoming notes
  const updatePlayingNotes = () => {
    const currentTime = getCurrentPlaybackTime();
    const loopLength = getLoopLengthSeconds(config.bpm);
    const position = getArrangementPosition(config.bpm);

    // Check if we're in an active measure according to arrangement
    const isActiveMeasure = config.arrangement?.[position.measure] ?? true;

    if (!isActiveMeasure) {
      // Not in an active measure, no notes should be playing
      birdSignal.value = {
        ...birdSignal.value,
        currentTime,
        currentBeat: position.totalBeats,
        currentMeasure: position.measure,
        beatInMeasure: position.beatInMeasure,
        playingNotes: [],
        upcomingNotes: [],
      };
      return;
    }

    const playingNotes: PlayingNote[] = [];
    const upcomingNotes: UpcomingNote[] = [];
    const beatsPerSecond = config.bpm / 60;
    const secondsPerBeat = 1 / beatsPerSecond;

    // Calculate the current position within the loop
    const loopTime = currentTime % loopLength;
    const currentBeatInLoop = loopTime * beatsPerSecond;

    // Calculate upcoming notes if configuration is provided
    if (config.upcomingNotes) {
      const { loopInterval, lookaheadDistance } = config.upcomingNotes;
      const lookaheadEndTime = currentTime + lookaheadDistance;

      // Calculate how many loop iterations we need to look ahead
      const currentLoopIteration = Math.floor(currentTime / loopLength);
      const endLoopIteration = Math.ceil(lookaheadEndTime / loopLength);

      // Generate upcoming notes for each loop iteration
      for (
        let loopIteration = currentLoopIteration;
        loopIteration <= endLoopIteration;
        loopIteration++
      ) {
        const loopStartTime = loopIteration * loopLength;
        const loopEndTime = loopStartTime + loopLength;

        // Only include notes that start within the lookahead window
        if (loopStartTime < lookaheadEndTime && loopEndTime > currentTime) {
          for (const note of config.notes) {
            const noteStartTimeInLoop = note.start * secondsPerBeat;
            const noteEndTimeInLoop =
              noteStartTimeInLoop + note.duration * secondsPerBeat;
            const noteStartTimeGlobal = loopStartTime + noteStartTimeInLoop;
            const noteEndTimeGlobal = loopStartTime + noteEndTimeInLoop;

            // Check if this note instance falls within our lookahead window
            if (
              noteStartTimeGlobal >= currentTime &&
              noteStartTimeGlobal < lookaheadEndTime
            ) {
              // Check if the measure containing this note is active
              const noteBeatInLoop = note.start;
              const noteMeasure = Math.floor(noteBeatInLoop / 4);
              const isNoteMeasureActive =
                config.arrangement?.[noteMeasure] ?? true;

              if (isNoteMeasureActive) {
                upcomingNotes.push({
                  id: note.id,
                  note,
                  startTime: noteStartTimeGlobal,
                  endTime: noteEndTimeGlobal,
                  loopIteration,
                });
              }
            }
          }
        }
      }

      // Sort upcoming notes by start time
      upcomingNotes.sort((a, b) => a.startTime - b.startTime);
    }

    // Check each note to see if it's currently playing
    for (const note of config.notes) {
      const noteStartTime = note.start * secondsPerBeat;
      const noteEndTime = noteStartTime + note.duration * secondsPerBeat;

      // Check if the note is currently playing in this loop iteration
      if (loopTime >= noteStartTime && loopTime < noteEndTime) {
        const noteInstanceStartTime = currentTime - (loopTime - noteStartTime);
        const noteInstanceEndTime =
          noteInstanceStartTime + note.duration * secondsPerBeat;
        const currentTimeInNote = loopTime - noteStartTime;

        playingNotes.push({
          id: note.id,
          note,
          startTime: noteInstanceStartTime,
          endTime: noteInstanceEndTime,
          currentTime: currentTimeInNote,
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
      upcomingNotes,
    };
  };

  // Create a computed signal that updates when accessed
  const computedSignal = signal(() => {
    updatePlayingNotes();
    return birdSignal.value;
  });

  // Return the signal
  return {
    signal: computedSignal,
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

  // Validate upcoming notes configuration if present
  if (config.upcomingNotes !== undefined) {
    const upcoming = config.upcomingNotes;

    if (
      typeof upcoming.loopInterval !== "number" ||
      upcoming.loopInterval <= 0
    ) {
      throw new Error("Upcoming notes loop interval must be a positive number");
    }

    if (
      typeof upcoming.lookaheadDistance !== "number" ||
      upcoming.lookaheadDistance <= 0
    ) {
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
