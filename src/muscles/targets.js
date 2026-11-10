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

// ── Colour schemes ──────────────────────────────────────────────────────────
export const SCHEMES = {
  zones: { label: "Zones" },
  heat: { label: "Heat" },
  cvd: { label: "Colour-blind" },
};
export const SCHEME_IDS = Object.keys(SCHEMES);
export const schemeOf = (id) => (SCHEMES[id] ? id : "zones");

const ZONE_COLORS = {
  zones: {
    none: "#4b4b5c",
    low: "#4f7cff",
    moderate: "#2ec4b6",
    optimal: "#3ddc6e",
    high: "#ffb020",
    extreme: "#ff4d4d",
  },
  // Okabe-Ito palette, designed to stay distinguishable with colour-vision deficiency.
  cvd: {
    none: "#555566",
    low: "#0072b2",
    moderate: "#56b4e9",
    optimal: "#009e73",
    high: "#e69f00",
    extreme: "#d55e00",
  },
};

const HEAT_STOPS = [
  [0, [38, 32, 66]],
  [0.25, [96, 44, 140]],
  [0.5, [200, 54, 140]],
  [0.75, [255, 138, 61]],
  [1, [255, 230, 109]],
];

const toHex = (rgb) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

function heatColor(value, goal) {
  const cap = GOALS[goalOf(goal)].from.high;
  const t = Math.max(0, Math.min(1, value / cap));
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [t1, c1] = HEAT_STOPS[i];
    const [t0, c0] = HEAT_STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return toHex(c0.map((c, j) => c + (c1[j] - c) * k));
    }
  }
  return toHex(HEAT_STOPS[HEAT_STOPS.length - 1][1]);
}

export function colorFor(value, goal, scheme) {
  const s = schemeOf(scheme);
  if (s === "heat") return value <= 0 ? "#2a2a3a" : heatColor(value, goal);
  return ZONE_COLORS[s][zoneFor(value, goal)];
}

export function zoneColor(zone, scheme) {
  const s = schemeOf(scheme);
  return s === "heat" ? null : ZONE_COLORS[s][zone];
}

// [{ key, label, range, color }] for the legend. The heat scheme gets a gradient instead.
export function legendItems(goal, scheme) {
  const from = GOALS[goalOf(goal)].from;
  const s = schemeOf(scheme);
  return ZONE_KEYS.map((key, i) => {
    const next = ZONE_KEYS[i + 1];
    const range =
      key === "none" ? "0" : next ? `${from[key]}-${from[next]}` : `${from[key]}+`;
    return { key, label: ZONE_LABEL[key], range, color: s === "heat" ? colorFor(from[key] || 0, goal, "heat") : ZONE_COLORS[s][key] };
  });
}
