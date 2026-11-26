import { describe, expect, it } from "vitest";
import { e1rm, historyFor, prKind, recordsList } from "./prs";

const h = (weight, reps) => ({ weight, reps });
const stateWith = (sets, extra = {}) => ({
  workoutPlan: { days: [] },
  workoutLogs: { "2026-11-20": { ex: { a: { name: "Chest Press", sets } } } },
  importedSets: {},
  ...extra,
});

describe("prKind", () => {
  it("lighter weight for many more reps is a PR (the user's example)", () => {
    expect(prKind([h(40, 5)], h(35, 12))).toBe("e1rm");
  });
  it("heavier weight", () => {
    expect(prKind([h(40, 5)], h(42.5, 3))).toBe("weight");
  });
  it("more reps at the same weight", () => {
    expect(prKind([h(40, 5), h(50, 1)], h(40, 6))).toBe("reps");
  });
  it("matching your best is not a PR", () => {
    expect(prKind([h(40, 5)], h(40, 5))).toBe(null);
    expect(prKind([h(40, 5)], h(35, 6))).toBe(null);
  });
  it("bodyweight sets PR on reps", () => {
    expect(prKind([h(0, 10)], h(0, 12))).toBe("reps");
    expect(prKind([h(0, 10)], h(0, 9))).toBe(null);
  });
  it("first ever set is the baseline", () => {
    expect(prKind([], h(20, 8))).toBe("first");
  });
  it("estimates one-rep max with Epley", () => {
    expect(e1rm(40, 5)).toBeCloseTo(46.67, 1);
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(0, 10)).toBe(0);
  });
});

describe("history", () => {
  it("matches name variants and ignores warm-ups and drops", () => {
    const state = stateWith([
      { weight: 40, reps: 5, drops: [{ weight: 30, reps: 8 }] },
      { weight: 20, reps: 10, warmup: true },
    ], { importedSets: { "2026-11-01": [{ name: "chest press", weight: 45, reps: 3 }] } });
    const hist = historyFor(state, "CHEST  PRESS");
    expect(hist.map((s) => s.weight).sort()).toEqual([40, 45]);
  });
  it("a deleted set takes its record with it", () => {
    expect(recordsList(stateWith([{ weight: 40, reps: 5 }]))[0]).toMatchObject({ weight: 40, reps: 5 });
    expect(recordsList(stateWith([]))).toEqual([]);
  });
});
