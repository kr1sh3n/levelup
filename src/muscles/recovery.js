// Per-muscle recovery estimate: how long ago a group was trained hard, and
// whether it is likely ready for another hard session.
//
// Evidence summary (see docs/MUSCLE_MAP.md):
//  - Muscle protein synthesis stays elevated for roughly 24-48 h after a
//    resistance session, and for less time in trained lifters than untrained
//    ones (Damas et al. 2015). Training a muscle again inside that window is
//    not harmful; it is simply unlikely to add much on top.
//  - Force recovery and soreness usually resolve in 24-72 h, taking longer
//    after high-volume or eccentric-heavy work.
//  - Twice a week per muscle beats once a week at matched volume
//    (Schoenfeld, Ogborn & Krieger 2016), so "ready" here is a nudge to train
//    a muscle again, not a warning to stay away.
//
// This is a rule of thumb from population averages, not a readiness test.
// Sleep, food, stress and training age all move it. The steps below are
// deliberately coarse for that reason.

import { GROUP_IDS } from "./taxonomy";
import { daysBetween, makeResolver } from "./volume";

export const RECOVERY_KEYS = ["worked", "recovering", "soon", "ready", "untrained"];

export const RECOVERY_LABEL = {
  worked: "Worked today",
  recovering: "Recovering",
  soon: "Nearly ready",
  ready: "Ready",
  untrained: "Not trained",
};

// How long a session of this size usually takes to recover from, in days.
export function recoveryDays(effectiveSets) {
  if (effectiveSets <= 0) return 0;
  if (effectiveSets <= 4) return 2;
  if (effectiveSets <= 10) return 3;
  return 4;
}

export function statusFor(daysSince, needDays) {
  if (daysSince === null) return "untrained";
  if (daysSince <= 0) return "worked";
  if (daysSince >= needDays) return "ready";
  if (daysSince >= needDays - 1) return "soon";
  return "recovering";
}

// Most recent training day per group, with that day's load and a readiness
// guess. `lookback` is how far back to search for a last session, in days.
export function computeRecovery(sets, { today, resolve, overrides = {}, indirect = 0.5, lookback = 21 } = {}) {
  const resolver = resolve || makeResolver(overrides);
  const byDay = Object.fromEntries(GROUP_IDS.map((g) => [g, new Map()])); // group -> date -> effective sets

  for (const s of sets) {
    if (s.warmup) continue;
    const age = daysBetween(today, s.date);
    if (age < 0 || age > lookback) continue;
    const r = resolver(s.name);
    if (!r) continue;
    for (const [g, role] of Object.entries(r.muscles)) {
      const day = byDay[g];
      if (!day) continue;
      const add = role === "direct" ? 1 : indirect;
      if (add <= 0) continue;
      day.set(s.date, (day.get(s.date) || 0) + add);
    }
  }

  const byGroup = {};
  for (const g of GROUP_IDS) {
    let lastDate = null;
    let load = 0;
    for (const [date, n] of byDay[g]) {
      if (lastDate === null || date > lastDate) {
        lastDate = date;
        load = n;
      }
    }
    const daysSince = lastDate === null ? null : Math.max(0, daysBetween(today, lastDate));
    const needDays = recoveryDays(load);
    byGroup[g] = {
      group: g,
      lastDate,
      daysSince,
      sets: Math.round(load * 10) / 10,
      needDays,
      status: statusFor(daysSince, needDays),
      // 0 = just trained, 1 = fully recovered. Drives the continuous heat scheme.
      fraction: daysSince === null || needDays === 0 ? 1 : Math.min(1, daysSince / needDays),
      readyIn: daysSince === null ? 0 : Math.max(0, needDays - daysSince),
    };
  }
  return { byGroup, lookback };
}

export function agoText(daysSince) {
  if (daysSince === null) return "Not in the last 3 weeks";
  if (daysSince === 0) return "Today";
  if (daysSince === 1) return "Yesterday";
  return `${daysSince} days ago`;
}

export function recoveryText(r) {
  if (r.status === "untrained") return "No sets in the last 3 weeks. Nothing to recover from, so it is ready whenever you are.";
  if (r.status === "worked") return `${r.sets} sets today. Most lifters leave about ${r.needDays} days before hitting it hard again.`;
  if (r.status === "ready") return `Last worked ${agoText(r.daysSince).toLowerCase()}. Likely recovered, and two sessions a week usually beat one.`;
  if (r.status === "soon") return `Last worked ${agoText(r.daysSince).toLowerCase()}. About a day short of the usual ${r.needDays}-day window, though lighter work is fine.`;
  return `Last worked ${agoText(r.daysSince).toLowerCase()} (${r.sets} sets). Usually about ${r.readyIn} more day${r.readyIn === 1 ? "" : "s"} before another hard session.`;
}

// Groups worth training today: recovered ones first, longest-rested first, with
// never-trained groups last so they read as a gap rather than a plan.
export function readyList(recovery, limit = 5) {
  const rows = GROUP_IDS.map((g) => recovery.byGroup[g]);
  const ready = rows.filter((r) => r.status === "ready").sort((a, b) => b.daysSince - a.daysSince);
  const untrained = rows.filter((r) => r.status === "untrained");
  return [...ready, ...untrained].slice(0, limit);
}

// Groups still inside their recovery window, soonest-ready first.
export function restingList(recovery) {
  return GROUP_IDS.map((g) => recovery.byGroup[g])
    .filter((r) => r.status === "recovering" || r.status === "worked")
    .sort((a, b) => a.readyIn - b.readyIn);
}
