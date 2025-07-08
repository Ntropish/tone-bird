import { BirdNote } from './utils.js';
export interface BirdNoteInstance {
    id: string;
    note: BirdNote;
    startTime: number;
    endTime: number;
}
export interface BirdState {
    notes: BirdNoteInstance[];
    currentTime: number;
    currentBeat: number;
    currentMeasure: number;
    beatInMeasure: number;
    loopIteration: number;
    isCurrentMeasureActive: boolean;
    activeMeasures: number[];
    loopLengthSeconds: number;
    loopProgress: number;
    upcomingNotesCount: number;
    recentlyPlayedNotesCount: number;
    currentlyPlayingNotesCount: number;
}
/**
 * Bird configuration
 */
export interface BirdConfig {
    bpm: number;
    notes: BirdNote[];
    arrangement?: boolean[];
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
export declare function createBird(config: BirdConfig): {
    signal: import('@preact/signals-core').Signal<BirdState>;
    dispose: () => void;
    getCurrentTiming: () => {
        time: number;
        beat: number;
        measure: number;
        beatInMeasure: number;
        loopIteration: number;
        loopProgress: number;
    };
    getArrangementStatus: () => {
        isCurrentMeasureActive: boolean;
        activeMeasures: number[];
        currentMeasure: number;
    };
    getPerformanceStats: () => {
        totalNotes: number;
        currentlyPlaying: number;
        upcoming: number;
        recentlyPlayed: number;
    };
    getNotesByStatus: () => {
        currentlyPlaying: BirdNoteInstance[];
        upcoming: BirdNoteInstance[];
        recentlyPlayed: BirdNoteInstance[];
    };
    getLoopInfo: () => {
        loopLength: number;
        progress: number;
        iteration: number;
        timeInLoop: number;
    };
};
