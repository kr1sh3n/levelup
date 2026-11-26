// Personal records, worked out from the full training history every time.
//
// Records used to be a running "best so far" stored per exercise name. That
// broke in three ways: deleting a mistyped set (say 400 kg) left it as the
// record forever; "Chest Press" and "chest press" kept separate records; and
// bodyweight sets (0 kg) could never be a PR. Computing from history fixes all
// three: delete a set and its record goes with it.
//
// A set is a PR when any of these is true (checked in this order):
//   weight - heavier than anything before for this exercise
//   reps   - more reps than ever before at this exact weight (bodyweight too)
//   e1rm   - beats the best estimated one-rep max (Epley), so a lighter weight
//            for many more reps counts: 40x5 (~46.7) then 35x12 (~49) is a PR
// The first ever set of an exercise is a PR too: it sets the baseline.
import { exerciseKey } from "./muscles/exercises";
import { collectSets } from "./muscles/volume";

export const PR_LABEL = { first: "first", weight: "heavier", reps: "more reps", e1rm: "stronger" };

// Epley. One rep is the weight itself; bodyweight has no load to estimate.
export function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

const close = (a, b) => Math.abs(a - b) < 1e-9;

// Working sets only: warm-ups and the lighter rounds of a drop set never set
// or break a record.
export function historyFor(state, name) {
  const key = exerciseKey(name);
  return collectSets(state).filter((s) => !s.warmup && !s.drop && exerciseKey(s.name) === key);
}

// What kind of PR (if any) `set` is against `history` (sets logged before it).
export function prKind(history, set) {
  const w = Number(set.weight) || 0;
  const r = Number(set.reps) || 0;
  if (r <= 0) return null;
  if (!history.length) return "first";

  let maxWeight = 0;
  let bestE1rm = 0;
  let repsHere = null; // most reps at exactly this weight
  for (const h of history) {
    const hw = Number(h.weight) || 0;
    const hr = Number(h.reps) || 0;
    if (hw > maxWeight) maxWeight = hw;
    bestE1rm = Math.max(bestE1rm, e1rm(hw, hr));
    if (close(hw, w)) repsHere = Math.max(repsHere ?? 0, hr);
  }
  if (w > 0 && w > maxWeight) return "weight";
  if (repsHere !== null && r > repsHere) return "reps";
  if (w > 0 && bestE1rm > 0 && e1rm(w, r) > bestE1rm + 1e-9) return "e1rm";
  return null;
}

// The records list: one row per exercise, best weight (with its reps) and the
// best bodyweight reps for exercises done without load.
export function recordsList(state) {
  const by = new Map();
  for (const s of collectSets(state)) {
    if (s.warmup || s.drop || !(s.reps > 0)) continue;
    const key = exerciseKey(s.name);
    if (!key) continue;
    const row = by.get(key) || { name: s.name, weight: 0, reps: 0, bwReps: 0 };
    const w = Number(s.weight) || 0;
    if (w > row.weight || (close(w, row.weight) && s.reps > row.reps)) {
      row.weight = w;
      row.reps = s.reps;
    }
    if (w === 0) row.bwReps = Math.max(row.bwReps, s.reps);
    row.name = s.name;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.weight - a.weight || b.bwReps - a.bwReps);
}
