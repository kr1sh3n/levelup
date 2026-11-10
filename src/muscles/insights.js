// Turns weekly volumes into advice: where to focus, what is overdone, balance
// between opposing muscles, and exercises that would close a gap.

import { GROUP_IDS, groupLabel, PUSH_GROUPS, PULL_GROUPS } from "./taxonomy";
import { GOALS, goalOf, zoneFor, zoneText } from "./targets";
import { exercisesFor, resolveExercise } from "./exercises";

const round1 = (n) => Math.round(n * 10) / 10;

export function targetBand(goal) {
  const from = GOALS[goalOf(goal)].from;
  return { min: from.optimal, max: from.high };
}

// Plain-language status for one group.
export function describeGroup(group, volumes, goal) {
  const v = volumes.byGroup[group];
  const { min, max } = targetBand(goal);
  const zone = zoneFor(v.effective, goal);
  const toGo = Math.max(0, min - v.effective);
  let advice;
  if (v.effective >= max) advice = `You are past ${max} weekly sets. Extra sets add little here, so hold or trim if recovery is lagging.`;
  else if (v.effective >= min) advice = "Keep it up; this is the range most studies favour.";
  else advice = `About ${Math.ceil(toGo)} more sets this week would reach the ${min}-${max} range, ideally spread over 2 sessions.`;
  return { zone, summary: zoneText(zone, goal), advice, toGo: round1(toGo) };
}

// Groups furthest below the optimal band, biggest gap first.
export function focusList(volumes, goal, limit = 4) {
  const { min } = targetBand(goal);
  return GROUP_IDS.map((g) => {
    const v = volumes.byGroup[g];
    return { group: g, label: groupLabel(g), effective: v.effective, deficit: Math.max(0, min - v.effective) };
  })
    .filter((x) => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit || a.effective - b.effective)
    .slice(0, limit);
}

// Groups at or beyond the high zone.
export function overList(volumes, goal) {
  const { max } = targetBand(goal);
  return GROUP_IDS.filter((g) => volumes.byGroup[g].effective >= max).map((g) => ({
    group: g,
    label: groupLabel(g),
    effective: volumes.byGroup[g].effective,
  }));
}

const sum = (volumes, ids) => ids.reduce((s, g) => s + volumes.byGroup[g].effective, 0);

// Rules of thumb rather than research findings; the UI labels them that way.
export function balanceChecks(volumes) {
  const checks = [];
  const push = sum(volumes, PUSH_GROUPS);
  const pull = sum(volumes, PULL_GROUPS);
  if (push + pull >= 10) {
    const ratio = pull / Math.max(push, 0.01);
    checks.push({
      id: "push-pull",
      label: "Push vs pull",
      a: { label: "Push", value: round1(push) },
      b: { label: "Pull", value: round1(pull) },
      ok: ratio >= 0.75,
      message:
        ratio >= 0.75
          ? "Pulling keeps pace with pushing."
          : `You push ${round1(push)} sets for ${round1(pull)} pulled. A common guideline is to pull at least as much as you push.`,
    });
  }
  const quads = volumes.byGroup.quads.effective;
  const hams = volumes.byGroup.hamstrings.effective;
  if (quads >= 6) {
    checks.push({
      id: "quad-ham",
      label: "Quads vs hamstrings",
      a: { label: "Quads", value: round1(quads) },
      b: { label: "Hamstrings", value: round1(hams) },
      ok: hams >= quads * 0.5,
      message:
        hams >= quads * 0.5
          ? "Hamstrings are keeping a reasonable share of quad work."
          : "Hamstrings get under half your quad volume. Balanced thigh training is a common injury-prevention guideline.",
    });
  }
  const front = volumes.byGroup.front_delts.effective;
  const rear = volumes.byGroup.rear_delts.effective;
  if (front >= 6) {
    checks.push({
      id: "delts",
      label: "Front vs rear delts",
      a: { label: "Front", value: round1(front) },
      b: { label: "Rear", value: round1(rear) },
      ok: rear >= front * 0.5,
      message:
        rear >= front * 0.5
          ? "Rear delts are getting a fair share."
          : "Pressing already hits the front delts hard; rear delts usually need direct work to keep the shoulders balanced.",
    });
  }
  return checks;
}

// Library exercises that train `group` directly. Ones already in the user's plan come first.
export function suggestExercises(group, planNames = [], limit = 3) {
  const inPlan = new Set();
  for (const n of planNames) {
    const r = resolveExercise(n);
    if (r) inPlan.add(r.name);
  }
  return exercisesFor(group)
    .map((e) => ({
      name: e.name,
      inPlan: inPlan.has(e.name),
      // Fewer other direct muscles = a cleaner way to add volume to just this one.
      focus: Object.values(e.muscles).filter((r) => r === "direct").length,
    }))
    .sort((a, b) => Number(b.inPlan) - Number(a.inPlan) || a.focus - b.focus || a.name.localeCompare(b.name))
    .slice(0, limit);
}
