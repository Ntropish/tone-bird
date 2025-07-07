export type Seconds = number;
/** Simple ADSR envelope in seconds.  Omit fields to use class defaults. */
export interface Envelope {
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
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
export declare const BASE_BPM = 120;
export declare const RATIO_SET: readonly [readonly [1, 4], readonly [1, 3], readonly [1, 2], readonly [2, 3], readonly [3, 4], readonly [4, 5], readonly [5, 6], readonly [1, 1], readonly [6, 5], readonly [5, 4], readonly [4, 3], readonly [3, 2], readonly [2, 1]];
export declare const STANDARD_BPMS: number[];
export declare const getStandardBpms: () => number[];
export declare const snapBpm: (bpm: number) => number;
export declare const createNote: (id: string, start: number, duration: number, pitch: number, options?: {
    volume?: number;
    pan?: number;
    envelope?: Envelope;
}) => BirdNote;
export declare const getCurrentPlaybackTime: () => number;
export declare const getLoopLengthSeconds: (bpm: number) => number;
export declare const getCurrentBeat: (bpm: number) => number;
export declare const getCurrentMeasure: (bpm: number) => number;
export declare const getBeatInMeasure: (bpm: number) => number;
export declare const getArrangementPosition: (bpm: number) => {
    measure: number;
    beatInMeasure: number;
    totalBeats: number;
};
