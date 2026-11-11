import { describe, expect, it } from "vitest";
import { DEFAULT_REPS, DEFAULT_REST, REST_OPTIONS, TEMPLATES, restLabel } from "./templates";
import { matchExercise } from "./muscles/exercises";

describe("starter plans", () => {
  it("every exercise is known to the muscle map", () => {
    for (const t of TEMPLATES)
      for (const d of t.days)
        for (const e of d.exercises) expect(matchExercise(e.name), `${t.name} → ${e.name}`).toBeTruthy();
  });

  it("uses the beginner defaults", () => {
    for (const t of TEMPLATES)
      for (const d of t.days)
        for (const e of d.exercises) {
          expect(e.reps).toBe(DEFAULT_REPS);
          expect(REST_OPTIONS).toContain(e.restSec);
        }
    expect(DEFAULT_REPS).toBe("6-8");
    expect(DEFAULT_REST).toBe(120);
    expect(REST_OPTIONS).toEqual([120, 180, 240, 300]);
  });

  it("labels rest in minutes", () => {
    expect(restLabel(120)).toBe("2 min");
    expect(restLabel(300)).toBe("5 min");
    expect(restLabel(90)).toBe("1:30 min");
  });
});
