export const LEVEL_TITLES = {
  1: "Rookie",
  5: "Grinder",
  10: "Consistent Beast",
  15: "Disciplined",
  20: "Unstoppable",
  30: "Legendary",
};

export const XP_PER_LEVEL = 2000;

export function getLevelTitle(level) {
  const milestones = [30, 20, 15, 10, 5, 1];
  for (const m of milestones) {
    if (level >= m) return LEVEL_TITLES[m];
  }
  return "Rookie";
}

export function getLevel(totalXp) {
  return Math.floor(totalXp / XP_PER_LEVEL) + 1;
}

export function getXpInCurrentLevel(totalXp) {
  return totalXp % XP_PER_LEVEL;
}

export function getStreakMultiplier(streak) {
  if (streak >= 30) return 2.0;
  if (streak >= 14) return 1.5;
  if (streak >= 7) return 1.25;
  return 1.0;
}

// ── XP rules ─────────────────────────────────────────────────────────────────
export const GOAL_XP = 20; // per completed personal goal (× streak multiplier)
export const LIFT_XP = 40; // per finished workout (× streak multiplier)
export const MEAL_LOG_XP = 5; // per meal logged
export const PR_XP = 25; // per new personal record
export const BOSS_XP = 500; // Sunday: every goal due today completed

// ── Skills ───────────────────────────────────────────────────────────────────
export const SKILL_COLORS = {
  fitness: { color: "#f97316", glow: "rgba(249,115,22,0.4)" },
  mind: { color: "#3b82f6", glow: "rgba(59,130,246,0.4)" },
  creator: { color: "#ec4899", glow: "rgba(236,72,153,0.4)" },
  health: { color: "#22c55e", glow: "rgba(34,197,94,0.4)" },
};

export const SKILL_LABELS = {
  fitness: "Fitness",
  mind: "Mind",
  creator: "Creator",
  health: "Health",
};

// ── Calendar ─────────────────────────────────────────────────────────────────
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Meals ────────────────────────────────────────────────────────────────────
export const MEAL_NAME_SUGGESTIONS = ["Breakfast", "Lunch", "Snacks", "Dinner"];
