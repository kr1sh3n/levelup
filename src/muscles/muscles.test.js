import { describe, expect, it } from "vitest";
import { GROUP_IDS, MUSCLE_GROUPS, isGroup } from "./taxonomy";
import { LIBRARY, exerciseKey, matchExercise, resolveExercise } from "./exercises";
import { computeVolumes, collectSets, periodRange, rangeLabel, weekStart, weeklyHistory, latestWeekOffset, latestOffset } from "./volume";
import { GOALS, GOAL_IDS, ZONE_KEYS, colorFor, legendItems, zoneFor } from "./targets";
import { balanceChecks, describeGroup, focusList, overList, suggestExercises } from "./insights";
import { makeDemoSets } from "./demo";
import { migrate } from "../storage";

describe("library", () => {
  it("only references real muscle groups", () => {
    for (const e of LIBRARY) {
      expect(Object.keys(e.muscles).length, e.name).toBeGreaterThan(0);
      for (const [g, role] of Object.entries(e.muscles)) {
        expect(isGroup(g), `${e.name} -> ${g}`).toBe(true);
        expect(["direct", "indirect"]).toContain(role);
      }
    }
  });

  it("trains every muscle group directly with at least one exercise", () => {
    for (const g of GROUP_IDS) {
      expect(LIBRARY.some((e) => e.muscles[g] === "direct"), g).toBe(true);
    }
  });

  it("has no two exercises that normalise to the same name", () => {
    const seen = new Map();
    for (const e of LIBRARY) {
      const k = exerciseKey(e.name);
      expect(seen.has(k), `${e.name} duplicates ${seen.get(k)}`).toBe(false);
      seen.set(k, e.name);
    }
  });
});

describe("exercise matching", () => {
  const CASES = [
    ["Bench Press (Barbell)", "Bench Press"],
    ["Flat DB Bench Press", "Bench Press"],
    ["Incline Dumbbell Press", "Incline Bench Press"],
    ["DB Shoulder Press", "Overhead Press"],
    ["Seated Dumbbell Shoulder Press", "Overhead Press"],
    ["Lat Pulldown (Cable)", "Lat Pulldown"],
    ["Close Grip Lat Pulldown", "Lat Pulldown"],
    ["Pull-ups", "Pull Up"],
    ["Chin ups", "Chin Up"],
    ["Romanian Deadlift (Barbell)", "Romanian Deadlift"],
    ["RDL", "Romanian Deadlift"],
    ["Deadlift (Barbell)", "Deadlift"],
    ["Back Squat", "Squat"],
    ["Smith Machine Squat", "Squat"],
    ["Leg Press (Machine)", "Leg Press"],
    ["Seated Leg Curl", "Leg Curl"],
    ["Lying Leg Curl", "Leg Curl"],
    ["Standing Calf Raise", "Calf Raise"],
    ["Seated Calf Raise", "Calf Raise"],
    ["Leg Press Calf Raise", "Calf Raise"],
    ["Tricep Pushdown (Cable)", "Triceps Pushdown"],
    ["Skull Crushers", "Skull Crusher"],
    ["Bicep Curl (Dumbbell)", "Biceps Curl"],
    ["Hammer Curls", "Hammer Curl"],
    ["Lateral Raise (Dumbbell)", "Lateral Raise"],
    ["Face Pulls", "Face Pull"],
    ["Barbell Row", "Bent Over Row"],
    ["One Arm Dumbbell Row", "Bent Over Row"],
    ["Hip Thrust (Barbell)", "Hip Thrust"],
    ["Push Ups", "Push Up"],
    ["Hanging Leg Raise", "Hanging Leg Raise"],
    ["Cable Crunch", "Crunch"],
    ["Pec Deck", "Chest Fly"],
    ["Shrugs", "Shrug"],
    ["Wrist Curls", "Wrist Curl"],
    ["Bulgarian Split Squats", "Split Squat"],
  ];
  for (const [input, expected] of CASES) {
    it(`${input} -> ${expected}`, () => {
      expect(matchExercise(input)?.entry.name).toBe(expected);
    });
  }

  it("does not guess for things it does not know", () => {
    for (const n of ["Treadmill", "Jump Rope", "Press", "Stretching", "", "Leg"]) {
      expect(matchExercise(n), n).toBeNull();
    }
  });

  it("prefers a user's own assignment", () => {
    const overrides = { [exerciseKey("Zercher Carry")]: { forearms: "direct", abs: "indirect", bogus: "direct" } };
    expect(resolveExercise("zercher carry", overrides)).toMatchObject({
      source: "custom",
      muscles: { forearms: "direct", abs: "indirect" },
    });
    expect(resolveExercise("Bench Press", { [exerciseKey("Bench Press")]: { triceps: "direct" } }).muscles).toEqual({ triceps: "direct" });
  });
});

describe("dates", () => {
  it("finds Mondays", () => {
    expect(weekStart("2026-11-10")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
  });

  it("builds weekly and rolling ranges", () => {
    expect(periodRange("week", "2026-11-10")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(periodRange("week", "2026-11-10", 1)).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(periodRange("rolling", "2026-11-10")).toEqual({ from: "2026-11-04", to: "2026-11-10" });
  });

  it("labels ranges", () => {
    expect(rangeLabel("2026-11-09", "2026-11-15")).toBe("Nov 9–15");
    expect(rangeLabel("2026-10-26", "2026-11-01")).toBe("Oct 26–Nov 1");
  });
});

const baseState = () => ({
  workoutPlan: { days: [{ id: "d1", exercises: [{ id: "e-old", name: "Leg Curl" }] }] },
  workoutLogs: {
    "2026-11-09": {
      ex: {
        b: { name: "Bench Press", sets: [{ weight: 80, reps: 8, rir: 1 }, { weight: 80, reps: 8, rir: 4 }, { weight: 40, reps: 10, warmup: true }] },
        "e-old": { sets: [{ weight: 40, reps: 10 }] },
      },
    },
  },
  importedSets: {
    "2026-11-10": [{ name: "DB Bench Press", weight: 30, reps: 10, rir: 0 }, { name: "Mystery Move", weight: 1, reps: 1 }],
    "2026-11-02": [{ name: "Bench Press", weight: 70, reps: 8 }],
  },
});

describe("volume", () => {
  const sets = collectSets(baseState());
  const week = { from: "2026-11-09", to: "2026-11-15" };

  it("collects logged sets (recovering names from the plan) and imported sets", () => {
    expect(sets).toHaveLength(7);
    expect(sets.find((s) => s.name === "Leg Curl")).toBeTruthy();
  });

  it("carries RIR from both logged and imported sets", () => {
    // Regression: the logged-set branch once dropped rir, so quality data from
    // the Gym tab never reached the map while imported sets worked fine.
    expect(sets.find((s) => s.name === "Bench Press" && s.rir === 1)).toBeTruthy();
    expect(sets.find((s) => s.name === "DB Bench Press").rir).toBe(0);
    expect(sets.find((s) => s.name === "Mystery Move").rir).toBe(null);
  });

  it("counts how many sets were taken near failure", () => {
    const v = computeVolumes(sets, { ...week, indirect: 0.5 });
    // Chest: bench at RIR 1 and 4, plus the dumbbell version at RIR 0.
    expect(v.byGroup.chest.rated).toBe(3);
    expect(v.byGroup.chest.hard).toBe(2); // RIR 4 is short of failure
    expect(v.byGroup.chest.avgRir).toBeCloseTo(1.7, 1);
    // Helpers inherit the rating only while indirect sets count at all.
    expect(computeVolumes(sets, { ...week, indirect: 0 }).byGroup.triceps.rated).toBe(0);
  });

  it("counts direct sets fully and indirect sets at the chosen weight", () => {
    const v = computeVolumes(sets, { ...week, indirect: 0.5 });
    expect(v.byGroup.chest).toMatchObject({ direct: 3, effective: 3 });
    expect(v.byGroup.triceps).toMatchObject({ direct: 0, indirect: 3, effective: 1.5 });
    expect(v.byGroup.hamstrings.direct).toBe(1);
    expect(computeVolumes(sets, { ...week, indirect: 0 }).byGroup.triceps.effective).toBe(0);
  });

  it("leaves warm-ups out, respects the date range and tracks unknown exercises", () => {
    const v = computeVolumes(sets, week);
    expect(v.warmups).toBe(1);
    expect(v.byGroup.chest.days.size).toBe(2);
    expect([...v.unmatched]).toEqual([["Mystery Move", 1]]);
    expect(computeVolumes(sets, { from: "2026-11-02", to: "2026-11-08" }).byGroup.chest.direct).toBe(1);
  });

  it("lists contributing exercises", () => {
    const v = computeVolumes(sets, week);
    expect(v.byGroup.chest.exercises.get("Bench Press")).toMatchObject({ direct: 3 });
  });

  it("builds a weekly history oldest first", () => {
    const h = weeklyHistory(sets, "2026-11-09", 2, {});
    expect(h.map((w) => w.from)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(h[0].totals.chest).toBe(1);
    expect(h[1].totals.chest).toBe(3);
  });

  it("finds how far back the latest data is", () => {
    expect(latestWeekOffset(sets, "2026-11-10")).toBe(0);
    expect(latestWeekOffset(sets, "2026-12-01")).toBe(3);
    expect(latestWeekOffset([], "2026-12-01")).toBe(0);
  });

  it("finds the latest 7-day window with data for either kind of window", () => {
    // newest set is 2026-11-10
    expect(latestOffset(sets, "2026-11-10", "rolling")).toBe(0);
    expect(latestOffset(sets, "2026-11-16", "rolling")).toBe(0);
    expect(latestOffset(sets, "2026-11-17", "rolling")).toBe(1);
    expect(latestOffset(sets, "2026-12-01", "rolling")).toBe(3);
    expect(latestOffset(sets, "2026-12-01", "week")).toBe(3);
    expect(latestOffset([], "2026-12-01", "rolling")).toBe(0);
  });
});

describe("targets", () => {
  it("assigns zones by weekly sets", () => {
    const at = (v) => zoneFor(v, "hypertrophy");
    expect([0, 0.5, 3.9, 4, 9.9, 10, 19.9, 20, 29.9, 30].map(at)).toEqual([
      "none", "low", "low", "moderate", "moderate", "optimal", "optimal", "high", "high", "extreme",
    ]);
    expect(zoneFor(6, "strength")).toBe("optimal");
    expect(zoneFor(6, "both")).toBe("moderate");
  });

  it("keeps the zone thresholds strictly increasing for every goal", () => {
    for (const id of GOAL_IDS) {
      const from = GOALS[id].from;
      for (let i = 1; i < ZONE_KEYS.length; i++) expect(from[ZONE_KEYS[i]]).toBeGreaterThan(from[ZONE_KEYS[i - 1]]);
    }
  });

  it("returns a hex colour for every value, and distinguishes the zones", () => {
    for (const v of [0, 2, 6, 12, 25, 40]) expect(colorFor(v, "both")).toMatch(/^#[0-9a-f]{6}$/);
    const seen = new Set(ZONE_KEYS.map((z) => colorFor(GOALS.both.from[z] || 0, "both")));
    expect(seen.size).toBe(ZONE_KEYS.length); // every zone reads differently
    expect(legendItems("both")).toHaveLength(ZONE_KEYS.length);
  });
});

describe("insights on the demo history", () => {
  const sets = makeDemoSets("2026-11-15", 8);
  const v = computeVolumes(sets, { from: "2026-11-09", to: "2026-11-15", indirect: 0.5 });

  it("is deterministic", () => {
    expect(makeDemoSets("2026-11-15", 8)).toEqual(sets);
  });

  it("shows the planted imbalance", () => {
    expect(zoneFor(v.byGroup.chest.effective, "both")).toBe("optimal");
    expect(["none", "low"]).toContain(zoneFor(v.byGroup.hamstrings.effective, "both"));
    expect(["none", "low"]).toContain(zoneFor(v.byGroup.rear_delts.effective, "both"));
  });

  it("ranks the weakest muscles first and flags overdone ones", () => {
    const focus = focusList(v, "both", 3);
    expect(focus).toHaveLength(3);
    expect(focus[0].deficit).toBeGreaterThanOrEqual(focus[1].deficit);
    expect(focus.map((f) => f.group)).not.toContain("chest");
    expect(overList(v, "both").every((o) => o.effective >= 20)).toBe(true);
  });

  it("flags imbalances with rules of thumb", () => {
    const checks = balanceChecks(v);
    const delts = checks.find((c) => c.id === "delts");
    expect(delts && delts.ok).toBe(false);
  });

  it("describes a group and suggests fixes", () => {
    expect(describeGroup("hamstrings", v, "both").advice).toMatch(/more sets/);
    expect(describeGroup("chest", v, "both").advice).toMatch(/Keep it up/);
    const s = suggestExercises("hamstrings", ["Leg Curl", "Squat"]);
    expect(s[0]).toMatchObject({ name: "Leg Curl", inPlan: true });
    expect(s.length).toBeLessThanOrEqual(3);
  });
});

describe("saved data upgrade", () => {
  it("fills in exercise names on old workout logs from the plan and adds the new fields", () => {
    const saved = {
      schemaVersion: 2,
      totalXp: 10,
      skillXp: {},
      workoutPlan: { days: [{ id: "d", name: "Push", weekdays: [], exercises: [{ id: "e1", name: "Bench Press" }] }] },
      workoutLogs: { "2026-11-02": { dayId: "d", ex: { e1: { sets: [{ weight: 80, reps: 8 }] }, gone: { sets: [] } } } },
    };
    const s = migrate(saved);
    expect(s.workoutLogs["2026-11-02"].ex.e1.name).toBe("Bench Press");
    expect(s.workoutLogs["2026-11-02"].ex.gone.name).toBeUndefined();
    expect(s.importedSets).toEqual({});
    expect(s.exerciseMuscles).toEqual({});
    expect(s.muscleMap).toMatchObject({ goal: "both", period: "rolling" });
    // idempotent, and it never overwrites a name that is already there
    expect(migrate(s)).toEqual(s);
    expect(collectSets(s)).toHaveLength(1);
  });

  it("keeps a user's saved map settings", () => {
    const s = migrate({ schemaVersion: 2, totalXp: 0, skillXp: {}, muscleMap: { goal: "strength", period: "week", indirect: 0 } });
    // Saved choices survive; settings added later arrive at their default, and
    // settings we have dropped do not linger.
    expect(s.muscleMap).toMatchObject({ goal: "strength", indirect: 0, period: "week" });
    expect(s.muscleMap.mode).toBe("volume");
    expect("scheme" in s.muscleMap).toBe(false);
  });
});

describe("taxonomy", () => {
  it("labels every group", () => {
    for (const id of GROUP_IDS) expect(MUSCLE_GROUPS[id].label.length).toBeGreaterThan(2);
  });
});
