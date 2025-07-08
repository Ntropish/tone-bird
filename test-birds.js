import { createBird, createNote } from "./dist/index.js";
import { effect } from "@preact/signals-core";

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
  updateInterval: 50,
  lookaheadDistance: 2.0,
  retentionTime: 0.5,
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
  updateInterval: 50,
  lookaheadDistance: 2.0,
  retentionTime: 0.5,
});

// Function to display notes
const displayNotes = (notes, prefix) => {
  if (!notes || !Array.isArray(notes) || notes.length === 0) {
    console.log(`${prefix}: None`);
  } else {
    const noteStrings = notes.map((noteInstance) => {
      const now = Date.now();
      const status =
        now >= noteInstance.startTime && now < noteInstance.endTime
          ? "▶️"
          : "⏳";
      return `${status}${noteInstance.note.pitch.toFixed(1)}Hz`;
    });
    console.log(`${prefix}: ${noteStrings.join(", ")}`);
  }
};

// Reactive display function
const updateDisplay = () => {
  console.log("\n=== BIRD UPDATE ===");

  const majorState = aMajorBird.signal.value;
  const minorState = aMinorBird.signal.value;

  // Safety check for state
  if (!majorState || !minorState) {
    console.log("❌ Error: Bird states not initialized");
    return;
  }

  // Display A Major bird status
  console.log("🎼 A MAJOR BIRD:");
  displayNotes(majorState.notes, "   Notes");

  // Display A Minor bird status
  console.log("🎼 A MINOR BIRD:");
  displayNotes(minorState.notes, "   Notes");

  // Debug information
  console.log(
    `🔍 Debug: Major notes: ${majorState.notes?.length || 0}, Minor notes: ${
      minorState.notes?.length || 0
    }`
  );

  // Show arrangement status
  const currentTime = Date.now() / 1000; // Simple current time for debugging
  const loopLength = (16 * 4 * 60) / 120; // 16 measures * 4 beats * 60 seconds / 120 BPM
  const loopTime = currentTime % loopLength;
  const currentBeat = (loopTime * 120) / 60;
  const currentMeasure = Math.floor(currentBeat / 4);

  console.log(
    `Current measure: ${currentMeasure}, Beat: ${currentBeat.toFixed(2)}`
  );
  console.log(
    `Major active: ${aMajorArrangement[currentMeasure]}, Minor active: ${aMinorArrangement[currentMeasure]}`
  );

  // Show arrangement details
  console.log(
    `Major arrangement: [${aMajorArrangement
      .slice(0, 8)
      .map((b) => (b ? "T" : "F"))
      .join(",")}...]`
  );
  console.log(
    `Minor arrangement: [${aMinorArrangement
      .slice(0, 8)
      .map((b) => (b ? "T" : "F"))
      .join(",")}...]`
  );

  // Display notes summary
  const totalNotes =
    (majorState.notes?.length || 0) + (minorState.notes?.length || 0);
  console.log(`📈 Total Notes: ${totalNotes}`);
};

// Track previous signal values to detect changes
let lastMajorState = null;
let lastMinorState = null;

// Create reactive effect that updates display when signals change
effect(() => {
  // Access the signals to trigger reactivity
  const majorState = aMajorBird.signal.value;
  const minorState = aMinorBird.signal.value;

  // Only update display if the signal values have actually changed
  const majorChanged =
    JSON.stringify(majorState) !== JSON.stringify(lastMajorState);
  const minorChanged =
    JSON.stringify(minorState) !== JSON.stringify(lastMinorState);

  if (majorChanged || minorChanged) {
    lastMajorState = JSON.parse(JSON.stringify(majorState));
    lastMinorState = JSON.parse(JSON.stringify(minorState));
    updateDisplay();
  }
});

// Handle cleanup on exit
process.on("SIGINT", () => {
  // Dispose of the birds
  aMajorBird.dispose();
  aMinorBird.dispose();

  console.log("👋 Test completed!");
  process.exit(0);
});
