// Weekly-set zones and colour schemes.
//
// Evidence summary (see docs/MUSCLE_MAP.md for sources and caveats):
//  - Hypertrophy rises with weekly sets per muscle, with diminishing returns.
//    Schoenfeld, Ogborn & Krieger (2017) found graded gains up to 10+ sets;
//    Pelland et al. (2024 preprint) find a ~4-set minimum effective dose and
//    that counting an indirect set as 0.5 fits hypertrophy best.
//  - Strength saturates sooner (roughly 10-12 sets already gets most of the
//    benefit) and fits direct-sets-only counting best. Lower confidence.
// These are population averages from mostly young, healthy lifters, not a
// prescription for any one person.

import { RECOVERY_KEYS, RECOVERY_LABEL } from "./recovery";

export const ZONE_KEYS = ["none", "low", "moderate", "optimal", "high", "extreme"];

// `from` = effective weekly sets at which the zone begins.
export const GOALS = {
  both: {
    label: "Muscle + strength",
    indirect: 0.5,
    from: { none: 0, low: 0.5, moderate: 4, optimal: 10, high: 20, extreme: 30 },
    note: "Uses the hypertrophy ranges. Strength gains flatten near the bottom of the optimal band, so the extra volume mainly serves size.",
  },
  hypertrophy: {
    label: "Muscle size",
    indirect: 0.5,
    from: { none: 0, low: 0.5, moderate: 4, optimal: 10, high: 20, extreme: 30 },
    note: "Gains rise with weekly sets but with diminishing returns; ~10-20 hard sets per muscle is the range most studies favour.",
  },
  strength: {
    label: "Strength",
    indirect: 0,
    from: { none: 0, low: 0.5, moderate: 3, optimal: 6, high: 12, extreme: 20 },
    note: "Strength benefits saturate earlier than size. Lower-confidence ranges, and only direct sets are counted by default.",
  },
};

export const GOAL_IDS = Object.keys(GOALS);
export const goalOf = (id) => (GOALS[id] ? id : "both");

export function zoneFor(value, goal) {
  const from = GOALS[goalOf(goal)].from;
  for (let i = ZONE_KEYS.length - 1; i > 0; i--) {
    if (value >= from[ZONE_KEYS[i]]) return ZONE_KEYS[i];
  }
  return "none";
}

const ZONE_TEXT = {
  none: "Not trained this period",
  low: "Below the ~4-set minimum effective dose",
  moderate: "Some stimulus, below the range most studies favour",
  optimal: "In the productive range",
  high: "Returns are diminishing; watch recovery",
  extreme: "Beyond the range most studies cover",
};
const ZONE_TEXT_STRENGTH = {
  ...ZONE_TEXT,
  low: "Minimal strength stimulus",
  moderate: "Building strength",
  optimal: "Most of the strength benefit is here",
  high: "Extra sets add little strength",
};

export function zoneText(zone, goal) {
  return (goalOf(goal) === "strength" ? ZONE_TEXT_STRENGTH : ZONE_TEXT)[zone];
}

export const ZONE_LABEL = {
  none: "None",
  low: "Low",
  moderate: "Building",
  optimal: "Optimal",
  high: "High",
  extreme: "Very high",
};

// ── Colours ─────────────────────────────────────────────────────────────────
// One palette, used by both the weekly-sets and recovery views. It runs
// blue -> cyan -> teal -> amber -> vermilion, so the "productive" end and the
// "too much" end differ in hue *and* brightness. That keeps it readable with
// the common forms of colour blindness without needing a separate mode, and
// the muscle labels mean colour is never the only signal.
const ZONE_COLORS = {
  none: "#3a3a47",
  low: "#3b6ea5",
  moderate: "#4fb0c6",
  optimal: "#46c09a",
  high: "#e8a33d",
  extreme: "#e8653d",
};

export function colorFor(value, goal) {
  return ZONE_COLORS[zoneFor(value, goal)];
}

export function zoneColor(zone) {
  return ZONE_COLORS[zone];
}

// [{ key, label, range, color }] for the legend.
export function legendItems(goal) {
  const from = GOALS[goalOf(goal)].from;
  return ZONE_KEYS.map((key, i) => {
    const next = ZONE_KEYS[i + 1];
    const range = key === "none" ? "0" : next ? `${from[key]}-${from[next]}` : `${from[key]}+`;
    return { key, label: ZONE_LABEL[key], range, color: ZONE_COLORS[key] };
  });
}

// ── Recovery colours ────────────────────────────────────────────────────────
// The same ramp read the other way round: warm means "just worked, still
// recovering", cool-green means "ready to go". See recovery.js for the statuses.
const RECOVERY_COLORS = {
  worked: "#e8653d",
  recovering: "#e8a33d",
  soon: "#4fb0c6",
  ready: "#46c09a",
  untrained: "#3a3a47",
};

// `r` is a row from computeRecovery().byGroup.
export function recoveryColorFor(r) {
  return RECOVERY_COLORS[r.status];
}

export function recoveryLegendItems() {
  return RECOVERY_KEYS.map((key) => ({ key, label: RECOVERY_LABEL[key], range: "", color: RECOVERY_COLORS[key] }));
}
