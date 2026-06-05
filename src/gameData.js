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

// skill: fitness | mind | creator | health
export const TASKS_DEFINITION = [
  {
    id: "water",
    label: "Drink 3L of Water",
    xp: 15,
    skill: "health",
    days: "daily",
  },
  {
    id: "read",
    label: "Read for 30 mins",
    xp: 25,
    skill: "mind",
    days: "daily",
  },
  {
    id: "skincare",
    label: "Skincare Routine",
    xp: 10,
    skill: "health",
    days: "daily",
  },
  {
    id: "coding",
    label: "Practice Coding (2hr)",
    xp: 50,
    skill: "mind",
    days: "daily",
  },
  {
    id: "youtube",
    label: "Script/Record/Edit Video",
    xp: 60,
    skill: "creator",
    days: "every2",
  },
  {
    id: "reel",
    label: "Upload a Reel",
    xp: 30,
    skill: "creator",
    days: "daily",
  },
  {
    id: "upper",
    label: "Upper Body Workout",
    xp: 40,
    skill: "fitness",
    days: [1, 3], // Mon, Wed (0=Sun)
  },
  {
    id: "lower",
    label: "Lower Body Workout",
    xp: 40,
    skill: "fitness",
    days: [2, 4], // Tue, Thu
  },
];

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

// Weekly quests definition — evaluated against weeklyStats
export const WEEKLY_QUESTS = [
  {
    id: "wq_workouts",
    label: "Complete all 4 workouts this week",
    xp: 300,
    check: (s) => (s.workoutsCompleted || 0) >= 4,
    progress: (s) => Math.min(s.workoutsCompleted || 0, 4),
    total: 4,
  },
  {
    id: "wq_coding",
    label: "Code every day this week (7 days)",
    xp: 250,
    check: (s) => (s.codingDays || 0) >= 7,
    progress: (s) => Math.min(s.codingDays || 0, 7),
    total: 7,
  },
  {
    id: "wq_water",
    label: "Hit 3L water goal 5 days",
    xp: 150,
    check: (s) => (s.waterDays || 0) >= 5,
    progress: (s) => Math.min(s.waterDays || 0, 5),
    total: 5,
  },
  {
    id: "wq_reading",
    label: "Read 5 days this week",
    xp: 200,
    check: (s) => (s.readingDays || 0) >= 5,
    progress: (s) => Math.min(s.readingDays || 0, 5),
    total: 5,
  },
  {
    id: "wq_youtube",
    label: "Post 2 YouTube videos this week",
    xp: 180,
    check: (s) => (s.youtubeVideos || 0) >= 2,
    progress: (s) => Math.min(s.youtubeVideos || 0, 2),
    total: 2,
  },
  {
    id: "wq_reels",
    label: "Upload a reel every day this week (7 days)",
    xp: 220,
    check: (s) => s.reelDays >= 7,
    progress: (s) => Math.min(s.reelDays || 0, 7),
    total: 7,
  },
];

export function getTasksForDay(dateObj, every2Seed) {
  const dow = dateObj.getDay(); // 0=Sun
  return TASKS_DEFINITION.filter((t) => {
    if (t.days === "daily") return true;
    if (t.days === "every2") {
      // use a stable seed: day-of-year parity
      const dayOfYear = Math.floor(
        (dateObj - new Date(dateObj.getFullYear(), 0, 0)) / 86400000
      );
      return dayOfYear % 2 === every2Seed % 2;
    }
    if (Array.isArray(t.days)) return t.days.includes(dow);
    return false;
  });
}

export const BOSS_DAY = 0; // Sunday

export function isBossDay(dateObj) {
  return dateObj.getDay() === BOSS_DAY;
}
