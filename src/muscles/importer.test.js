import { describe, expect, it } from "vitest";
import {
  combineSheets,
  findHeaderRow,
  groupByDate,
  guessMapping,
  inferDateOrder,
  parseDateCell,
  parseDelimited,
  parseNumber,
  parseReps,
  rowsToSets,
  summarizeExercises,
} from "./importer";

describe("parseDelimited", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    const text = '﻿Date,Exercise,Notes\r\n2026-11-09,"Press, Bench","said ""easy"""\r\n2026-11-10,Squat,\r\n';
    expect(parseDelimited(text)).toEqual([
      ["Date", "Exercise", "Notes"],
      ["2026-11-09", "Press, Bench", 'said "easy"'],
      ["2026-11-10", "Squat", ""],
    ]);
  });

  it("detects semicolons and tabs", () => {
    expect(parseDelimited("a;b;c\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseDelimited("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("skips blank lines", () => {
    expect(parseDelimited("a,b\n\n,\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("guessMapping", () => {
  it("maps a one-row-per-set export", () => {
    const { mapping, unit } = guessMapping(["Date", "Workout Name", "Exercise Name", "Set Order", "Weight", "Reps", "RPE"]);
    expect(mapping).toMatchObject({ date: 0, exercise: 2, weight: 4, reps: 5, sets: -1 });
    expect(unit).toBe("kg");
  });

  it("maps a sets-count sheet and reads the unit from the header", () => {
    const { mapping, unit } = guessMapping(["Date", "Exercise", "Sets", "Reps", "Weight (lbs)"]);
    expect(mapping).toMatchObject({ date: 0, exercise: 1, sets: 2, reps: 3, weight: 4 });
    expect(unit).toBe("lb");
  });

  it("maps underscore-style headers with a set type column", () => {
    const { mapping } = guessMapping(["title", "start_time", "exercise_title", "set_index", "set_type", "weight_kg", "reps"]);
    expect(mapping).toMatchObject({ date: 1, exercise: 2, warmup: 4, weight: 5, reps: 6 });
  });
});

describe("parseDateCell", () => {
  it("reads common formats", () => {
    expect(parseDateCell("2026-11-09")).toBe("2026-11-09");
    expect(parseDateCell("2026/11/09 18:30")).toBe("2026-11-09");
    expect(parseDateCell("09/11/2026", "dmy")).toBe("2026-11-09");
    expect(parseDateCell("11/09/2026", "mdy")).toBe("2026-11-09");
    expect(parseDateCell("9.11.26")).toBe("2026-11-09");
    expect(parseDateCell("9 Nov 2026")).toBe("2026-11-09");
    expect(parseDateCell("Nov 9, 2026")).toBe("2026-11-09");
    expect(parseDateCell("9-Nov-26")).toBe("2026-11-09");
  });

  it("reads Date objects and Excel serial numbers", () => {
    expect(parseDateCell(new Date(Date.UTC(2026, 10, 9)))).toBe("2026-11-09");
    const serial = (Date.UTC(2026, 10, 9) - Date.UTC(1899, 11, 30)) / 86400000;
    expect(parseDateCell(serial)).toBe("2026-11-09");
  });

  it("rejects nonsense", () => {
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("hello")).toBeNull();
    expect(parseDateCell("")).toBeNull();
    expect(parseDateCell(12)).toBeNull();
  });
});

describe("inferDateOrder", () => {
  it("decides from unambiguous values", () => {
    expect(inferDateOrder(["13/11/2026", "02/11/2026"])).toEqual({ order: "dmy", ambiguous: false });
    expect(inferDateOrder(["11/13/2026"])).toEqual({ order: "mdy", ambiguous: false });
  });
  it("flags ambiguity and defaults to day-first", () => {
    expect(inferDateOrder(["01/02/2026", "03/04/2026"])).toEqual({ order: "dmy", ambiguous: true });
    expect(inferDateOrder(["2026-11-09"])).toEqual({ order: "dmy", ambiguous: false });
  });
});

describe("parseNumber", () => {
  it("copes with decimal commas, units and ranges", () => {
    expect(parseNumber("62,5")).toBe(62.5);
    expect(parseNumber("80 kg")).toBe(80);
    expect(parseNumber("8-10")).toBe(8);
    expect(parseNumber("BW")).toBeNull();
    expect(parseNumber(7)).toBe(7);
  });
});

describe("rowsToSets", () => {
  const mapping = { date: 0, exercise: 1, weight: 2, reps: 3, sets: -1, warmup: -1 };

  it("reads a RIR column, and converts an RPE one", () => {
    const head = ["Date", "Exercise", "Weight", "Reps", "RIR"];
    const g = guessMapping(head);
    expect(g.mapping.rir).toBe(4);
    expect(g.rirScale).toBe("rir");
    const { sets } = rowsToSets([["2026-11-09", "Squat", "100", "5", "2"]], g.mapping, { order: "ymd", rirScale: g.rirScale });
    expect(sets[0].rir).toBe(2);

    const rpe = guessMapping(["Date", "Exercise", "Weight", "Reps", "RPE"]);
    expect(rpe.rirScale).toBe("rpe");
    // RPE 8 means two reps left in the tank.
    const out = rowsToSets([["2026-11-09", "Squat", "100", "5", "8"]], rpe.mapping, { order: "ymd", rirScale: rpe.rirScale });
    expect(out.sets[0].rir).toBe(2);
  });

  it("makes one set per row", () => {
    const { sets, skipped } = rowsToSets(
      [["2026-11-09", "Bench Press", "80", "8"], ["2026-11-09", "Bench Press", "80", "7"], [], ["", "", "", ""]],
      mapping
    );
    expect(sets).toHaveLength(2);
    expect(sets[0]).toEqual({ date: "2026-11-09", name: "Bench Press", weight: 80, reps: 8, warmup: false, rir: null });
    expect(skipped).toEqual([]);
  });

  it("expands a sets column", () => {
    const { sets } = rowsToSets([["09/11/2026", "Squat", "100", "5", "4"]], { ...mapping, sets: 4 });
    expect(sets).toHaveLength(4);
    expect(sets.every((s) => s.date === "2026-11-09" && s.weight === 100)).toBe(true);
  });

  it("converts pounds to kilograms", () => {
    const { sets } = rowsToSets([["2026-11-09", "Bench Press", "225", "5"]], mapping, { unit: "lb" });
    expect(sets[0].weight).toBe(102.1);
  });

  it("marks warm-up sets", () => {
    const { sets } = rowsToSets(
      [["2026-11-09", "Bench Press", "40", "10", "warmup"], ["2026-11-09", "Bench Press", "80", "8", "normal"]],
      { ...mapping, warmup: 4 }
    );
    expect(sets.map((s) => s.warmup)).toEqual([true, false]);
  });

  it("reports rows it cannot use", () => {
    const { sets, skipped } = rowsToSets(
      [["not a date", "Squat", "100", "5"], ["2026-11-09", "", "100", "5"], ["2026-11-09", "Squat", "", ""]],
      mapping
    );
    expect(sets).toEqual([]);
    expect(skipped.map((s) => s.line)).toEqual([2, 3, 4]);
    expect(skipped[0].reason).toContain("not a date");
  });
});

describe("groupByDate", () => {
  it("groups and drops falsy warmup flags", () => {
    const g = groupByDate([
      { date: "2026-11-09", name: "Squat", weight: 100, reps: 5, warmup: false },
      { date: "2026-11-09", name: "Squat", weight: 60, reps: 8, warmup: true },
    ]);
    expect(g["2026-11-09"]).toEqual([
      { name: "Squat", weight: 100, reps: 5 },
      { name: "Squat", weight: 60, reps: 8, warmup: true },
    ]);
  });
});

describe("sheets", () => {
  it("finds the header below a title row", () => {
    const rows = [["My training log"], [], ["Date", "Exercise", "Sets", "Reps"], ["2026-11-09", "Squat", 4, 5]];
    expect(findHeaderRow(rows)).toBe(2);
  });

  it("combines tabs that share columns and skips the rest", () => {
    const head = ["Date", "Exercise", "Sets", "Reps"];
    const out = combineSheets([
      { name: "Oct", rows: [head, ["2026-10-01", "Squat", 4, 5]] },
      { name: "Nov", rows: [head, ["2026-11-01", "Bench Press", 3, 8]] },
      { name: "Notes", rows: [["Idea", "Status", "Owner"], ["x", "y", "z"]] },
    ]);
    expect(out.used).toEqual(["Oct", "Nov"]);
    expect(out.skipped).toEqual(["Notes"]);
    expect(out.body).toHaveLength(2);
  });
});

describe("summarizeExercises", () => {
  it("counts sets, resolves muscles and lists unknown exercises first", () => {
    const sets = [
      { date: "2026-11-09", name: "Bench Press (Barbell)", weight: 80, reps: 8 },
      { date: "2026-11-09", name: "Bench Press (Barbell)", weight: 80, reps: 8 },
      { date: "2026-11-09", name: "Zercher Carry Thing", weight: 40, reps: 1 },
      { date: "2026-11-09", name: "Squat", weight: 40, reps: 10, warmup: true },
    ];
    const out = summarizeExercises(sets);
    expect(out.map((e) => e.name)).toEqual(["Zercher Carry Thing", "Bench Press (Barbell)"]);
    expect(out[0].match).toBeNull();
    expect(out[1]).toMatchObject({ sets: 2, match: { name: "Bench Press" } });
  });
});


// Shapes taken from a real exported gym log: units written into the weight
// cell, rep ranges, a mistyped year among a column of same-year dates, a
// free-text date, blank weights, and a RIR column. The numbers and dates here
// and numbers here are invented; only the kinds of mess are real.
describe("a messy real-world export", () => {
  const headers = ["Date", "Exercise", "Reps", "Weight", "RIR"];
  const body = [
    ["3/7/24", "Triceps pushdown", "12", "20 kg", "2"],
    ["21/9/24", "Skull crushers", "8-10", "", ""],
    ["21/9/24", "Flat dumbbell press", "9", "27.5 kg", "1"],
    ["17/9/05", "Lat pulldown", "10", "40 kg", ""],
    ["5 Jan (year not stated)", "Shoulder press", "6", "10 kg", "3"],
  ];

  const g = guessMapping(headers);
  const out = rowsToSets(body, g.mapping, { order: inferDateOrder(body.map((r) => r[0])).order, rirScale: g.rirScale, today: "2026-11-10" });

  it("maps every column, including RIR", () => {
    expect(g.mapping).toMatchObject({ date: 0, exercise: 1, reps: 2, weight: 3, rir: 4 });
    expect(g.rirScale).toBe("rir");
  });

  it("reads day-first dates and strips the unit off the weight", () => {
    expect(out.sets[0]).toMatchObject({ date: "2024-07-03", weight: 20, reps: 12, rir: 2 });
    expect(out.sets[2].weight).toBe(27.5);
  });

  it("takes the midpoint of a rep range instead of the low end", () => {
    expect(parseReps("8-10")).toBe(9);
    expect(parseReps("8 to 12")).toBe(10);
    expect(parseReps("10")).toBe(10);
    expect(parseReps("")).toBe(null);
    expect(out.sets[1].reps).toBe(9);
  });

  it("keeps a set that has reps but no weight", () => {
    expect(out.sets[1]).toMatchObject({ name: "Skull crushers", weight: 0 });
  });

  it("skips a date it cannot read, and says which", () => {
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0].reason).toMatch(/couldn't read the date/);
  });

  it("flags a mistyped year rather than importing it silently", () => {
    // A mistyped year parses cleanly and would drag the charts two decades back.
    expect(out.suspect).toHaveLength(1);
    expect(out.suspect[0]).toMatchObject({ date: "2005-09-17" });
    expect(out.suspect[0].reason).toMatch(/more than 5 years old/);
    // It is still imported - the user decides, the importer only points at it.
    expect(out.sets.some((x) => x.date === "2005-09-17")).toBe(true);
  });

  it("flags a future date too", () => {
    const later = rowsToSets([["1/6/27", "Squat", "5", "100 kg", ""]], g.mapping, { order: "dmy", today: "2026-11-10" });
    expect(later.suspect[0].reason).toMatch(/in the future/);
  });
});
