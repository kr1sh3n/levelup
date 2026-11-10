// Weekly training volume per muscle group, computed from logged + imported sets.

import { addDays } from "../storage";
import { GROUP_IDS } from "./taxonomy";
import { resolveExercise } from "./exercises";

// ── Dates (local calendar days as "YYYY-MM-DD") ─────────────────────────────
const parseDay = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const daysBetween = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 86400000);

// Monday of the week containing `s`.
export function weekStart(s) {
  const dow = (parseDay(s).getDay() + 6) % 7;
  return addDays(s, -dow);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function rangeLabel(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  const left = `${MONTHS[a.getMonth()]} ${a.getDate()}`;
  const right = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${MONTHS[b.getMonth()]} ${b.getDate()}`;
  return `${left}–${right}`;
}

// kind "week": Monday-Sunday, `offset` weeks back from the current one.
// kind "rolling": the 7 days ending today, `offset` blocks of 7 days back.
export function periodRange(kind, today, offset = 0) {
  if (kind === "rolling") {
    const to = addDays(today, -7 * offset);
    return { from: addDays(to, -6), to };
  }
  const from = addDays(weekStart(today), -7 * offset);
  return { from, to: addDays(from, 6) };
}

// ── Collecting sets ─────────────────────────────────────────────────────────
// -> [{ date, name, weight, reps, warmup }] from Pdash workout logs and imports.
export function collectSets(state) {
  const planNames = new Map();
  for (const day of state.workoutPlan?.days || []) {
    for (const ex of day.exercises || []) planNames.set(ex.id, ex.name);
  }
  const out = [];
  for (const [date, log] of Object.entries(state.workoutLogs || {})) {
    for (const [exId, ex] of Object.entries(log.ex || {})) {
      const name = ex.name || planNames.get(exId);
      if (!name) continue;
      for (const s of ex.sets || []) {
        out.push({ date, name, weight: s.weight, reps: s.reps, warmup: !!s.warmup });
      }
    }
  }
  for (const [date, rows] of Object.entries(state.importedSets || {})) {
    for (const r of rows) out.push({ date, name: r.name, weight: r.weight, reps: r.reps, warmup: !!r.warmup });
  }
  return out;
}

export function dataBounds(sets) {
  let min = null;
  let max = null;
  for (const s of sets) {
    if (min === null || s.date < min) min = s.date;
    if (max === null || s.date > max) max = s.date;
  }
  return min ? { min, max } : null;
}

// ── Volume ──────────────────────────────────────────────────────────────────
export function makeResolver(overrides = {}) {
  const cache = new Map();
  return (name) => {
    if (!cache.has(name)) cache.set(name, resolveExercise(name, overrides));
    return cache.get(name);
  };
}

// indirect = how much an assisting-muscle set counts (0 = direct sets only).
export function computeVolumes(sets, { from, to, resolve, overrides = {}, indirect = 0.5 }) {
  const resolver = resolve || makeResolver(overrides);
  const byGroup = Object.fromEntries(
    GROUP_IDS.map((g) => [g, { direct: 0, indirect: 0, effective: 0, days: new Set(), exercises: new Map() }])
  );
  const unmatched = new Map();
  let counted = 0;
  let warmups = 0;

  for (const s of sets) {
    if (s.date < from || s.date > to) continue;
    if (s.warmup) {
      warmups++;
      continue;
    }
    const r = resolver(s.name);
    if (!r) {
      unmatched.set(s.name, (unmatched.get(s.name) || 0) + 1);
      continue;
    }
    counted++;
    for (const [g, role] of Object.entries(r.muscles)) {
      const b = byGroup[g];
      if (!b) continue;
      const e = b.exercises.get(r.name) || { name: r.name, direct: 0, indirect: 0 };
      if (role === "direct") {
        b.direct++;
        e.direct++;
        b.days.add(s.date);
      } else {
        b.indirect++;
        e.indirect++;
        if (indirect > 0) b.days.add(s.date);
      }
      b.exercises.set(r.name, e);
    }
  }
  for (const b of Object.values(byGroup)) b.effective = b.direct + b.indirect * indirect;
  return { byGroup, unmatched, counted, warmups, range: { from, to } };
}

// Effective weekly sets per group for the `count` weeks ending at `endWeek`
// (a Monday). Oldest first. Used for the small history bars.
export function weeklyHistory(sets, endWeek, count, opts) {
  const resolve = opts.resolve || makeResolver(opts.overrides);
  const weeks = [];
  for (let i = count - 1; i >= 0; i--) {
    const from = addDays(endWeek, -7 * i);
    const v = computeVolumes(sets, { ...opts, resolve, from, to: addDays(from, 6) });
    weeks.push({
      from,
      totals: Object.fromEntries(GROUP_IDS.map((g) => [g, v.byGroup[g].effective])),
    });
  }
  return weeks;
}

// How many weeks before the current one the most recent data falls (0 = this week).
export function latestWeekOffset(sets, today) {
  const b = dataBounds(sets);
  if (!b) return 0;
  return Math.max(0, Math.round(daysBetween(weekStart(today), weekStart(b.max)) / 7));
}

// Same idea for either window: how many windows back the latest data sits (0 = the current one).
export function latestOffset(sets, today, kind = "week") {
  if (kind !== "rolling") return latestWeekOffset(sets, today);
  const b = dataBounds(sets);
  return b ? Math.max(0, Math.floor(daysBetween(today, b.max) / 7)) : 0;
}
