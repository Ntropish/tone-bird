import { createBird, createNote } from "./dist/index.js";
import terminal from "terminal-kit";

const term = terminal.terminal;

// A Major scale notes (A, B, C#, D, E, F#, G#, A)
const A_MAJOR_NOTES = [
  { pitch: 440.0, name: "A4" }, // A
  { pitch: 493.88, name: "B4" }, // B
  { pitch: 554.37, name: "C#5" }, // C#
  { pitch: 587.33, name: "D5" }, // D
  { pitch: 659.25, name: "E5" }, // E
  { pitch: 739.99, name: "F#5" }, // F#
  { pitch: 830.61, name: "G#5" }, // G#
  { pitch: 880.0, name: "A5" }, // A
];

// A Minor scale notes (A, B, C, D, E, F, G, A)
const A_MINOR_NOTES = [
  { pitch: 440.0, name: "A4" }, // A
  { pitch: 493.88, name: "B4" }, // B
  { pitch: 523.25, name: "C5" }, // C
  { pitch: 587.33, name: "D5" }, // D
  { pitch: 659.25, name: "E5" }, // E
  { pitch: 698.46, name: "F5" }, // F
  { pitch: 783.99, name: "G5" }, // G
  { pitch: 880.0, name: "A5" }, // A
];

// Create A Major bird - plays for measures 0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14
const aMajorArrangement = Array(16).fill(false);
for (let i = 0; i < 16; i += 4) {
  aMajorArrangement[i] = true; // Measure 0, 4, 8, 12
  aMajorArrangement[i + 1] = true; // Measure 1, 5, 9, 13
  aMajorArrangement[i + 2] = true; // Measure 2, 6, 10, 14
}

const aMajorBird = createBird({
  bpm: 120,
  notes: A_MAJOR_NOTES.map((note, index) =>
    createNote(`major-${note.name}`, index, 0.5, note.pitch, { volume: 0.7 })
  ),
  arrangement: aMajorArrangement,
  upcomingNotes: {
    loopInterval: 0.5,
    lookaheadDistance: 2.0,
  },
});

// Create A Minor bird - plays for measures 3, 7, 11, 15
const aMinorArrangement = Array(16).fill(false);
aMinorArrangement[3] = true; // Measure 3
aMinorArrangement[7] = true; // Measure 7
aMinorArrangement[11] = true; // Measure 11
aMinorArrangement[15] = true; // Measure 15

const aMinorBird = createBird({
  bpm: 120,
  notes: A_MINOR_NOTES.map((note, index) =>
    createNote(`minor-${note.name}`, index, 0.5, note.pitch, { volume: 0.7 })
  ),
  arrangement: aMinorArrangement,
  upcomingNotes: {
    loopInterval: 0.5,
    lookaheadDistance: 2.0,
  },
});

// Clear screen and set up display
term.clear();
term.moveTo(1, 1);
term.cyan("🎵 Tone Bird Test - A Major & A Minor Patterns\n\n");

// Function to format time
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
};

// Function to format beat position
const formatBeat = (beat) => {
  const measure = Math.floor(beat / 4) + 1;
  const beatInMeasure = (beat % 4) + 1;
  return `M${measure}.${beatInMeasure}`;
};

// Function to display notes
const displayNotes = (notes, prefix) => {
  if (notes.length === 0) {
    term.gray(`${prefix}: None\n`);
  } else {
    term.green(`${prefix}: `);
    notes.forEach((note, index) => {
      if (index > 0) term.gray(", ");
      term.yellow(note.note.pitch.toFixed(1) + "Hz");
    });
    term("\n");
  }
};

// Main display loop
let lastUpdate = 0;
const updateInterval = 100; // Update every 100ms

const updateDisplay = () => {
  const majorState = aMajorBird.signal.value;
  const minorState = aMinorBird.signal.value;

  // Only update if enough time has passed
  const now = Date.now();
  if (now - lastUpdate < updateInterval) {
    return;
  }
  lastUpdate = now;

  // Move cursor to top
  term.moveTo(1, 3);

  // Display current time and position
  term.cyan(`⏱️  Global Time: ${formatTime(majorState.currentTime)}\n`);
  term.cyan(
    `🎯 Current Position: ${formatBeat(majorState.currentBeat)} (Measure ${
      majorState.currentMeasure + 1
    }, Beat ${majorState.beatInMeasure + 1})\n\n`
  );

  // Display A Major bird status
  term.bold.blue("🎼 A MAJOR BIRD:\n");
  term.blue(
    `   Active: ${aMajorArrangement[majorState.currentMeasure] ? "✅" : "❌"}\n`
  );
  displayNotes(majorState.playingNotes, "   Playing");
  displayNotes(majorState.upcomingNotes, "   Upcoming");

  // Display A Minor bird status
  term.bold.magenta("\n🎼 A MINOR BIRD:\n");
  term.magenta(
    `   Active: ${aMinorArrangement[minorState.currentMeasure] ? "✅" : "❌"}\n`
  );
  displayNotes(minorState.playingNotes, "   Playing");
  displayNotes(minorState.upcomingNotes, "   Upcoming");

  // Display pattern explanation
  term(
    "\n📋 Pattern: A Major (3 measures) → A Minor (1 measure) → Repeat 4x\n"
  );
  term.gray("   Measures 1-3: A Major | Measure 4: A Minor | etc.\n\n");

  // Display loop progress
  const loopProgress = ((majorState.currentBeat % 64) / 64) * 100;
  term.cyan(`🔄 Loop Progress: ${loopProgress.toFixed(1)}%\n`);

  // Display upcoming notes summary
  const totalUpcoming =
    majorState.upcomingNotes.length + minorState.upcomingNotes.length;
  term.cyan(`📈 Total Upcoming Notes: ${totalUpcoming}\n`);
};

// Start the display loop
const displayLoop = setInterval(updateDisplay, 50); // Update display every 50ms

// Handle cleanup on exit
process.on("SIGINT", () => {
  clearInterval(displayLoop);
  term.clear();
  term.moveTo(1, 1);
  term.green("👋 Test completed!\n");
  process.exit(0);
});

// Initial display
updateDisplay();

// Instructions
term.moveTo(1, term.height - 3);
term.gray("Press Ctrl+C to exit\n");
