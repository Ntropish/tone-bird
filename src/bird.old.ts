import { signal, effect } from "@preact/signals-core";
import { createHasBeenActiveSignal } from "@/signals/hasBeenActive"; // from earlier

export type Seconds = number; // non-negative float (0.0, 0.1, 0.5, 1.0, etc.)

/** Simple ADSR envelope in seconds.  Omit fields to use class defaults. */
export interface Envelope {
  attack?: number; // seconds  (0 ≤ attack)
  decay?: number; // seconds  (0 ≤ decay)
  sustain?: number; // 0-1 linear
  release?: number; // seconds  (0 ≤ release)
}

/**
 * A single event on the deterministic musical timeline.
 * All time-related values are in seconds for simple audio scheduling.
 */
export interface BirdNote {
  /** Unique, stable id so a UI can mutate this note reactively */
  id: string;

  start: number;
  /** Duration in beats (≥ 0.001).  End time = start + duration */
  duration: number;

  envelope?: Envelope;

  /** Pitch as Hz */
  pitch: number;
  /** Linear gain 0-1 (default = 1) */
  volume?: number;
  /** Stereo pan −1 (left) …  +1 (right).  0 = centre. */
  pan?: number;
}

export interface BirdConfig {
  bpm: number; // just stored for now
  notes: BirdNote[];
  arrangement?: boolean[]; // Array of boolean values for each measure
  isPlaying?: boolean;
}

/* --------------------------------------------------------- */
/*  GLOBAL MUSICAL GRID — fixed for all users / all builds   */
/* --------------------------------------------------------- */

export const BASE_BPM = 120; // cornerstone
export const RATIO_SET = [
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
  [2, 1],
] as const;

export const STANDARD_BPMS = RATIO_SET.map(([n, d]) => (BASE_BPM * n) / d);

// Export for use in UI
export const getStandardBpms = () => STANDARD_BPMS;

/* Helpers */
export const snapBpm = (bpm: number) =>
  STANDARD_BPMS.reduce(
    (best, c) => (Math.abs(c - bpm) < Math.abs(best - bpm) ? c : best),
    STANDARD_BPMS[0]
  );

function createClockMapper(ctx: AudioContext) {
  // Use the same global time reference as the rest of the system
  const globalTime = getCurrentPlaybackTime();

  // ctx.currentTime is seconds since ctx was created **or** resumed
  const audioToWallOffset = globalTime - ctx.currentTime;

  /** Convert global time seconds ⇢ AudioContext seconds */
  const wallToAudio = (wall: number) => wall - audioToWallOffset;

  /** Convert AudioContext seconds ⇢ global time seconds */
  const audioToWall = (audio: number) => audio + audioToWallOffset;

  return { wallToAudio, audioToWall };
}

/* Utility functions for creating notes */
export const createNote = (
  id: string,
  start: number,
  duration: number,
  pitch: number,
  options?: {
    volume?: number;
    pan?: number;
    envelope?: Envelope;
  }
): BirdNote => ({
  id,
  start,
  duration,
  pitch,
  volume: options?.volume ?? 1,
  pan: options?.pan ?? 0,
  envelope: options?.envelope,
});

export const createEnvelope = (
  attack?: number,
  decay?: number,
  sustain?: number,
  release?: number
): Envelope => ({
  attack,
  decay,
  sustain,
  release,
});

/* Common envelope presets */
export const ENVELOPES = {
  piano: createEnvelope(0.01, 0.05, 0.8, 0.15), // Fast attack, smooth release
  pad: createEnvelope(0.1, 0.2, 0.9, 0.3), // Slow attack, long release
  pluck: createEnvelope(0.001, 0.02, 0.3, 0.05), // Very fast attack, short release
  bass: createEnvelope(0.01, 0.05, 0.7, 0.2), // Medium attack, good sustain
} as const;

/* Static timing utilities for deterministic playback */
export const getCurrentPlaybackTime = (): number => {
  // Use a fixed global epoch for deterministic timing
  // This epoch should be the same for all devices worldwide
  // Using a specific fixed date as the global reference point
  const globalEpoch = new Date("2024-01-01T00:00:00Z").getTime() / 1000; // Fixed global epoch
  const now = Date.now() / 1000; // Current Unix timestamp in seconds
  return now - globalEpoch;
};

export const getLoopLengthSeconds = (bpm: number): number => {
  return (16 * 4 * 60) / bpm; // 16 measures * 4 beats * 60 seconds / bpm
};

export const getCurrentBeat = (bpm: number): number => {
  const currentTime = getCurrentPlaybackTime();
  const beatsPerSecond = bpm / 60;
  return (currentTime * beatsPerSecond) % (16 * 4); // 16 measures * 4 beats
};

export const getCurrentMeasure = (bpm: number): number => {
  const currentBeat = getCurrentBeat(bpm);
  return Math.floor(currentBeat / 4);
};

export const getBeatInMeasure = (bpm: number): number => {
  const currentBeat = getCurrentBeat(bpm);
  return currentBeat % 4;
};

export const getArrangementPosition = (
  bpm: number
): { measure: number; beatInMeasure: number; totalBeats: number } => {
  const currentTime = getCurrentPlaybackTime();
  const beatsPerSecond = bpm / 60;
  const totalBeats = currentTime * beatsPerSecond;

  // Calculate position within the 16-measure loop (64 beats total)
  const beatsInLoop = totalBeats % 64;
  const measure = Math.floor(beatsInLoop / 4);
  const beatInMeasure = beatsInLoop % 4;

  return {
    measure,
    beatInMeasure,
    totalBeats: beatsInLoop,
  };
};

export class Bird {
  /* public reactive knobs */
  readonly bpm = signal<number>(BASE_BPM); // must stay snapped!
  readonly notes = signal<ReadonlyArray<BirdNote>>([]);
  readonly arrangement = signal<boolean[]>(Array(16).fill(true)); // Default all measures active
  readonly isPlaying = signal(false);

  /* browser-activation lock */
  readonly activated = createHasBeenActiveSignal();

  /* audio bits */
  private ctx = new AudioContext();
  private mapper = createClockMapper(this.ctx);

  private schedId: number | null = null;
  private lookAhead = 0.1; // seconds (reasonable lookahead)

  constructor(cfg: BirdConfig) {
    this.bpm.value = snapBpm(cfg.bpm);
    this.notes.value = cfg.notes;
    this.arrangement.value = cfg.arrangement ?? Array(16).fill(true);
    this.isPlaying.value = cfg.isPlaying ?? false;

    /* start/stop automatically and deterministically */
    effect(() => {
      if (this.activated.value && this.isPlaying.value) {
        this.startScheduler();
      } else {
        this.stopScheduler();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  100 % deterministic scheduling — tied to wall-clock time           */
  /* ------------------------------------------------------------------ */
  private startScheduler() {
    if (this.schedId != null) return;

    if (this.ctx.state !== "running") {
      console.log("Resuming AudioContext");
      this.ctx.resume();
    }

    this.schedId = window.setInterval(() => {
      // Use the same global time reference as visual components
      const globalTime = getCurrentPlaybackTime();
      const audioNow = this.mapper.wallToAudio(globalTime);
      const windowEnd = audioNow + this.lookAhead;

      console.log("Audio scheduler debug:", {
        globalTime,
        audioNow,
        windowEnd,
        bpm: this.bpm.value,
      });

      /* Schedule notes within the lookahead window */
      this.scheduleNotes(audioNow, windowEnd);
    }, 50); // Run every 50ms for smooth scheduling
  }

  private stopScheduler() {
    if (this.schedId != null) {
      clearInterval(this.schedId);
      this.schedId = null;
    }
  }

  /* Map time window → note events that start within that window */
  private scheduleNotes(startTime: number, endTime: number) {
    const list = this.notes.peek();
    const arrangement = this.arrangement.peek();
    const loopLengthSeconds = this.getLoopLengthSeconds();

    console.log("Note scheduling debug:", {
      startTime,
      endTime,
      loopLengthSeconds,
      numNotes: list.length,
      arrangement,
    });

    /* Schedule notes that start within the time window */
    for (const n of list) {
      // Notes are positioned in normalized beats (0-63 for 16 measures)
      // Convert to seconds for scheduling
      const beatsPerSecond = this.bpm.value / 60;
      const noteStartInBeats = n.start % 64; // 16 measures * 4 beats = 64 beats
      const noteStartInSeconds = noteStartInBeats / beatsPerSecond;

      // Calculate which measure this note belongs to
      const measureIndex = Math.floor(noteStartInBeats / 4);

      // Check if this measure is active in the arrangement
      if (!arrangement[measureIndex]) {
        continue; // Skip notes in inactive measures
      }

      // Find the current loop iteration
      const currentLoop = Math.floor(startTime / loopLengthSeconds);
      let noteTime = currentLoop * loopLengthSeconds + noteStartInSeconds;

      // If the note time is before our window, advance to the next loop
      while (noteTime < startTime) {
        noteTime += loopLengthSeconds;
      }

      // Check if this note occurrence falls within our scheduling window
      if (noteTime >= startTime && noteTime < endTime) {
        console.log(
          "SPAWNING OSCILLATOR for note:",
          n.id,
          "at time:",
          noteTime
        );
        this.spawnOsc(n, noteTime);
      }
    }
  }

  private spawnOsc(n: BirdNote, start: number) {
    // Create oscillator
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();

    // Connect audio chain
    osc.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.ctx.destination);

    // Set oscillator properties
    osc.frequency.setValueAtTime(n.pitch, start);
    osc.type = "sine"; // Default to sine wave

    // Set volume (default to 1 if not specified)
    const volume = n.volume ?? 1;
    gainNode.gain.setValueAtTime(0, start); // Start silent for envelope

    // Set pan (default to center if not specified)
    const pan = n.pan ?? 0;
    panner.pan.setValueAtTime(pan, start);

    // Calculate note duration and end time
    const endTime = start + n.duration;

    // Apply envelope if specified, otherwise use simple on/off
    if (n.envelope) {
      this.applyEnvelope(gainNode, start, endTime, n.envelope, volume);
    } else {
      // Simple envelope: immediate attack, immediate release
      gainNode.gain.setValueAtTime(volume, start);
      gainNode.gain.setValueAtTime(0, endTime);
    }

    // Schedule oscillator start and stop with proper timing
    osc.start(start);
    osc.stop(endTime);

    // Clean up nodes after note ends with longer buffer
    setTimeout(
      () => {
        osc.disconnect();
        gainNode.disconnect();
        panner.disconnect();
      },
      n.duration * 1000 + 200 // Increased buffer to 200ms
    );
  }

  private applyEnvelope(
    gainNode: GainNode,
    start: number,
    end: number,
    envelope: Envelope,
    noteVolume: number = 1
  ) {
    const duration = end - start;

    // Improved default envelope values for better sound quality
    const attack = envelope.attack ?? 0.005; // Faster attack to reduce clicks
    const decay = envelope.decay ?? 0.05; // Shorter decay
    const sustain = envelope.sustain ?? 0.8; // Higher sustain
    const release = envelope.release ?? 0.1; // Longer release for smoother fade

    // Calculate envelope times
    const attackEnd = start + attack;
    const decayEnd = attackEnd + decay;
    const releaseStart = end - release;

    // Ensure times are valid and don't overlap
    const clampedAttackEnd = Math.min(attackEnd, end);
    const clampedDecayEnd = Math.min(decayEnd, end);
    const clampedReleaseStart = Math.max(releaseStart, start);

    // Apply envelope curve with smoother transitions
    gainNode.gain.setValueAtTime(0, start);
    gainNode.gain.linearRampToValueAtTime(noteVolume, clampedAttackEnd);

    if (clampedDecayEnd > clampedAttackEnd) {
      gainNode.gain.linearRampToValueAtTime(
        noteVolume * sustain,
        clampedDecayEnd
      );
    }

    // Hold sustain level
    if (clampedReleaseStart > clampedDecayEnd) {
      gainNode.gain.setValueAtTime(noteVolume * sustain, clampedReleaseStart);
    }

    // Release phase with exponential curve for smoother fade
    gainNode.gain.linearRampToValueAtTime(0, end);
  }

  /* ------------------------------------------------------------------ */
  /*  PUBLIC API                                                         */
  /* ------------------------------------------------------------------ */

  /** Add a note to the sequence */
  addNote(note: BirdNote) {
    this.notes.value = [...this.notes.value, note];
  }

  /** Remove a note by id */
  removeNote(noteId: string) {
    this.notes.value = this.notes.value.filter((n) => n.id !== noteId);
  }

  /** Update an existing note */
  updateNote(noteId: string, updates: Partial<BirdNote>) {
    this.notes.value = this.notes.value.map((n) =>
      n.id === noteId ? { ...n, ...updates } : n
    );
  }

  /** Clear all notes */
  clearNotes() {
    this.notes.value = [];
  }

  /** Start playback */
  play() {
    this.isPlaying.value = true;
  }

  /** Stop playback */
  stop() {
    this.isPlaying.value = false;
  }

  /** Set BPM (will be snapped to nearest standard BPM) */
  setBpm(bpm: number) {
    this.bpm.value = snapBpm(bpm);
  }

  /** Get current BPM */
  getBpm(): number {
    return this.bpm.value;
  }

  /** Set arrangement (array of boolean values for each measure) */
  setArrangement(arrangement: boolean[]) {
    this.arrangement.value = arrangement;
  }

  /** Get current arrangement */
  getArrangement(): boolean[] {
    return this.arrangement.value;
  }

  /** Get current notes */
  getNotes(): ReadonlyArray<BirdNote> {
    return this.notes.value;
  }

  /** Check if currently playing */
  isCurrentlyPlaying(): boolean {
    return this.isPlaying.value;
  }

  /** Get current time position in seconds */
  getCurrentTime(): number {
    return getCurrentPlaybackTime();
  }

  /** Get loop length in seconds */
  private getLoopLengthSeconds(): number {
    return getLoopLengthSeconds(this.bpm.value);
  }

  /** Dispose of the Bird instance and clean up resources */
  dispose() {
    this.stop();
    this.stopScheduler();
    this.ctx.close();
  }
}
