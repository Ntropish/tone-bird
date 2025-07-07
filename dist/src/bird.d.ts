import { BirdNote } from './utils.js';
export interface PlayingNote {
    id: string;
    note: BirdNote;
    startTime: number;
    endTime: number;
    currentTime: number;
}
export interface UpcomingNote {
    id: string;
    note: BirdNote;
    startTime: number;
    endTime: number;
    loopIteration: number;
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
    arrangement?: boolean[];
    isPlaying?: boolean;
    upcomingNotes?: UpcomingNotesConfig;
}
/**
 * Creates a bird signal that tracks currently playing notes based on deterministic timing.
 * The signal updates in real-time to reflect which notes should be playing at the current moment.
 */
export declare function createBird(config: BirdConfig): {
    signal: import('@preact/signals-core').Signal<() => BirdState>;
};
