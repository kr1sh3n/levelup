// One-tap starter plans for people who do not know what a "split" is yet.
// Every exercise name resolves in the muscle library (checked by a test), so a
// starter plan feeds the muscle map from the very first set.

export const DEFAULT_REPS = "6-8";
export const DEFAULT_REST = 120; // seconds
// Rest choices offered everywhere: 2 to 5 minutes.
export const REST_OPTIONS = [120, 180, 240, 300];

const ex = (name, sets = 3) => ({ name, sets, reps: DEFAULT_REPS, restSec: DEFAULT_REST, notes: "" });

export const TEMPLATES = [
  {
    id: "full",
    name: "Full body",
    blurb: "2 days a week. The simplest place to start.",
    days: [
      { name: "Full body A", exercises: [ex("Squat"), ex("Bench Press"), ex("Lat Pulldown"), ex("Leg Curl"), ex("Biceps Curl", 2)] },
      { name: "Full body B", exercises: [ex("Deadlift"), ex("Overhead Press"), ex("Bent Over Row"), ex("Leg Press"), ex("Triceps Pushdown", 2)] },
    ],
  },
  {
    id: "upper-lower",
    name: "Upper / Lower",
    blurb: "4 days a week, alternating upper and lower body.",
    days: [
      { name: "Upper", exercises: [ex("Bench Press"), ex("Bent Over Row"), ex("Overhead Press"), ex("Lat Pulldown"), ex("Biceps Curl", 2), ex("Triceps Pushdown", 2)] },
      { name: "Lower", exercises: [ex("Squat"), ex("Romanian Deadlift"), ex("Leg Press"), ex("Leg Curl"), ex("Calf Raise")] },
    ],
  },
  {
    id: "ppl",
    name: "Push / Pull / Legs",
    blurb: "3 to 6 days a week, one focus per day.",
    days: [
      { name: "Push", exercises: [ex("Bench Press"), ex("Overhead Press"), ex("Incline Bench Press"), ex("Lateral Raise"), ex("Triceps Pushdown")] },
      { name: "Pull", exercises: [ex("Lat Pulldown"), ex("Bent Over Row"), ex("Face Pull"), ex("Biceps Curl")] },
      { name: "Legs", exercises: [ex("Squat"), ex("Leg Press"), ex("Leg Curl"), ex("Leg Extension"), ex("Calf Raise")] },
    ],
  },
];

export function restLabel(sec) {
  if (!sec) return "";
  return sec % 60 === 0 ? `${sec / 60} min` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} min`;
}
