import { signal, effect } from "@preact/signals-core";

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

  start: number; // beat of the loop
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
