import { describe, expect, it } from "vitest";
import { agoText, computeRecovery, readyList, recoveryDays, recoveryText, restingList, statusFor } from "./recovery";
import { recoveryColorFor, recoveryLegendItems } from "./targets";
import { GROUP_IDS } from "./taxonomy";

const TODAY = "2026-11-10";
const day = (n) => new Date(Date.UTC(2026, 10, 10 - n)).toISOString().slice(0, 10);
const set = (date, name, warmup = false) => ({ date, name, weight: 60, reps: 8, warmup });

// Bench Press: chest direct, front delts and triceps as helpers.
const bench = (n, count = 1) => Array.from({ length: count }, () => set(day(n), "Bench Press"));

describe("recovery window", () => {
  it("scales with how much work the muscle got", () => {
    expect(recoveryDays(0)).toBe(0);
    expect(recoveryDays(3)).toBe(2);
    expect(recoveryDays(8)).toBe(3);
    expect(recoveryDays(20)).toBe(4);
  });

  it("maps days rested onto a status", () => {
    expect(statusFor(null, 0)).toBe("untrained");
    expect(statusFor(0, 3)).toBe("worked");
    expect(statusFor(1, 3)).toBe("recovering");
    expect(statusFor(2, 3)).toBe("soon");
    expect(statusFor(3, 3)).toBe("ready");
    expect(statusFor(9, 3)).toBe("ready");
  });
});

describe("computeRecovery", () => {
  it("covers every group and reports untrained ones", () => {
    const r = computeRecovery([], { today: TODAY });
    for (const g of GROUP_IDS) {
      expect(r.byGroup[g].status, g).toBe("untrained");
      expect(r.byGroup[g].daysSince, g).toBe(null);
      expect(r.byGroup[g].fraction, g).toBe(1);
    }
  });

  it("uses the most recent session, not the biggest one", () => {
    const chest = computeRecovery([...bench(6, 10), ...bench(1, 2)], { today: TODAY }).byGroup.chest;
    expect(chest.daysSince).toBe(1);
    expect(chest.sets).toBe(2);
    expect(chest.needDays).toBe(2); // sized by the recent light day
    expect(chest.status).toBe("soon");
  });

  it("makes a big session take longer to clear than a small one", () => {
    const light = computeRecovery(bench(2, 3), { today: TODAY }).byGroup.chest;
    const heavy = computeRecovery(bench(2, 12), { today: TODAY }).byGroup.chest;
    expect(light.status).toBe("ready");
    expect(heavy.status).toBe("recovering");
    expect(heavy.readyIn).toBeGreaterThan(light.readyIn);
  });

  it("counts helper muscles at the indirect weight, and not at all when it is 0", () => {
    const sets = bench(1, 4);
    const half = computeRecovery(sets, { today: TODAY, indirect: 0.5 }).byGroup.triceps;
    expect(half.sets).toBe(2);
    expect(half.daysSince).toBe(1);
    const none = computeRecovery(sets, { today: TODAY, indirect: 0 }).byGroup.triceps;
    expect(none.status).toBe("untrained");
  });

  it("ignores warm-ups and anything older than the lookback", () => {
    const warm = computeRecovery([set(day(1), "Bench Press", true)], { today: TODAY });
    expect(warm.byGroup.chest.status).toBe("untrained");
    const old = computeRecovery(bench(40), { today: TODAY });
    expect(old.byGroup.chest.status).toBe("untrained");
  });

  it("treats today's work as worked, with a full window still to go", () => {
    const chest = computeRecovery(bench(0, 6), { today: TODAY }).byGroup.chest;
    expect(chest.status).toBe("worked");
    expect(chest.fraction).toBe(0);
    expect(chest.readyIn).toBe(3);
  });
});

describe("lists and wording", () => {
  const recovery = computeRecovery([...bench(0, 6), set(day(5), "Squat")], { today: TODAY });

  it("puts rested muscles before never-trained ones", () => {
    const list = readyList(recovery, 20);
    const firstUntrained = list.findIndex((r) => r.status === "untrained");
    const lastReady = list.map((r) => r.status).lastIndexOf("ready");
    if (firstUntrained >= 0 && lastReady >= 0) expect(lastReady).toBeLessThan(firstUntrained);
    expect(list.some((r) => r.group === "quads")).toBe(true);
  });

  it("lists resting muscles soonest-ready first", () => {
    const resting = restingList(recovery);
    expect(resting.some((r) => r.group === "chest")).toBe(true);
    for (let i = 1; i < resting.length; i++) expect(resting[i].readyIn).toBeGreaterThanOrEqual(resting[i - 1].readyIn);
  });

  it("describes each status without saying rest is mandatory", () => {
    for (const g of GROUP_IDS) {
      const text = recoveryText(recovery.byGroup[g]);
      expect(text.length, g).toBeGreaterThan(10);
      expect(text, g).not.toMatch(/must|never train/i);
    }
  });

  it("words the time since training in plain English", () => {
    expect(agoText(null)).toMatch(/3 weeks/);
    expect(agoText(0)).toBe("Today");
    expect(agoText(1)).toBe("Yesterday");
    expect(agoText(4)).toBe("4 days ago");
  });
});

describe("recovery colours", () => {
  it("gives every status its own colour", () => {
    const items = recoveryLegendItems();
    expect(items).toHaveLength(5);
    for (const i of items) expect(i.color, i.key).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(items.map((i) => i.color)).size).toBe(items.length);
  });

  it("separates a just-trained muscle from a recovered one", () => {
    expect(recoveryColorFor({ status: "worked" })).not.toBe(recoveryColorFor({ status: "ready" }));
  });
});
