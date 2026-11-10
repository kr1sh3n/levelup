// Deterministic demo training history so the muscle map can be explored
// before real data is imported. Deliberately lopsided (lots of chest and
// biceps, almost no hamstrings, rear delts or calves) so every colour shows up.

import { addDays } from "../storage";
import { weekStart } from "./volume";

// [weekday offset from Monday, [[exercise, sets], ...]]
const SESSIONS = [
  [0, [["Bench Press", 4], ["Incline Bench Press", 4], ["Overhead Press", 3], ["Lateral Raise", 4], ["Triceps Pushdown", 4], ["Chest Fly", 3]]],
  [1, [["Lat Pulldown", 4], ["Bent Over Row", 4], ["Biceps Curl", 4], ["Hammer Curl", 3]]],
  [3, [["Squat", 4], ["Leg Press", 4], ["Leg Extension", 3], ["Leg Curl", 2]]],
  [4, [["Bench Press", 3], ["Dip", 3], ["Lateral Raise", 3], ["Biceps Curl", 3], ["Crunch", 3]]],
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const BASE_KG = {
  "Bench Press": 80, "Incline Bench Press": 60, "Overhead Press": 45, "Lateral Raise": 10,
  "Triceps Pushdown": 30, "Chest Fly": 20, "Lat Pulldown": 60, "Bent Over Row": 70,
  "Biceps Curl": 20, "Hammer Curl": 16, Squat: 100, "Leg Press": 180, "Leg Extension": 50,
  "Leg Curl": 40, Dip: 0, Crunch: 0,
};

// -> [{ date, name, weight, reps, warmup }] for the `weeks` weeks ending this week.
export function makeDemoSets(today, weeks = 8) {
  const rand = rng(42);
  const out = [];
  const thisWeek = weekStart(today);
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = addDays(thisWeek, -7 * w);
    for (const [dow, lifts] of SESSIONS) {
      const date = addDays(monday, dow);
      if (date > today) continue;
      if (w > 0 && rand() < 0.1) continue; // the odd missed session
      for (const [name, n] of lifts) {
        const weight = Math.round(((BASE_KG[name] || 0) * (0.9 + 0.012 * (weeks - w))) / 2.5) * 2.5;
        for (let i = 0; i < n; i++) {
          out.push({ date, name, weight, reps: 8 + Math.floor(rand() * 5), warmup: false });
        }
      }
    }
  }
  return out;
}
