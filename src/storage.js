// Save-file shape, defaults, and migration of older saves.

export const SCHEMA_VERSION = 2;

// Local calendar date "YYYY-MM-DD" (not UTC — deadlines from <input type="date"> are local).
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return dateKey(new Date());
}

export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profileName: "",
    theme: "arcade", // "arcade" | "phantom" | "kitty"

    totalXp: 0,
    skillXp: { fitness: 0, mind: 0, creator: 0, health: 0 },
    streak: 0,
    lastActiveDate: null,
    longestStreak: 0,
    bestDayXp: 0,
    bestDayDate: null,
    activityLog: {}, // { date: xpEarned }
    loginBonusDates: [],
    bossClaimDates: [],

    // Today — personal goals
    goals: [], // { id, title, description, deadline, skill, completed, completedAt, xpAwarded, createdAt }


    // Gym — custom plan + per-date sessions
    workoutPlan: { days: [] }, // day: { id, name, weekdays:[0-6], exercises:[{ id, name, sets, reps, targetWeight, restSec, notes }] }
    workoutLogs: {}, // { date: { dayId, dayName, ex: { [exId]: { sets:[{weight,reps,pr}], done } }, completedAt } }
    workoutXpDates: [], // dates whose workout XP was already awarded (one award per day)

    // Muscle map
    importedSets: {}, // sets imported from a spreadsheet: { "YYYY-MM-DD": [{ name, weight, reps, warmup? }] }
    exerciseMuscles: {}, // the user's own muscle assignment per exercise: { [exerciseKey]: { [group]: "direct" | "indirect" } }
    muscleMap: { goal: "both", indirect: null, period: "rolling", mode: "volume" }, // indirect null = the goal's default; period "rolling" = last 7 days, "week" = Mon-Sun; mode "volume" = weekly sets, "recovery" = time since trained
    prs: {}, // { exerciseNameKey: { name, maxWeight, maxVolume } }

    // Meals — diet plan template + daily food log
    dietPlan: { meals: [] }, // meal: { id, name, items:[{ id, name, qty, cal, protein, carbs, fats }] }
    meals: {}, // { date: [{ id, slot, name, qty, cal, protein, carbs, fats }] }
    nutritionGoals: { cal: 2200, protein: 150, carbs: 220, fats: 70 },
  };
}

const V1_LIFT_PATTERN = ["upper", "lower", "rest", "upper", "lower", "rest", "rest"];

function migrateV1(old) {
  const base = defaultState();
  const liftDay1 = typeof old.liftDay1 === "number" ? old.liftDay1 : 1;
  const routines = old.routines || {};
  const dayIds = {};
  const days = [];
  for (const type of ["upper", "lower"]) {
    const list = routines[type] || [];
    if (!list.length) continue;
    const id = `day-${type}`;
    dayIds[type] = id;
    const weekdays = [0, 1, 2, 3, 4, 5, 6].filter(
      (wd) => V1_LIFT_PATTERN[(((wd - liftDay1) % 7) + 7) % 7] === type
    );
    days.push({
      id,
      name: type === "upper" ? "Upper Day" : "Lower Day",
      weekdays,
      exercises: list.map((e) => ({
        id: e.id,
        name: e.name,
        sets: Number(e.targetSets) || 3,
        reps: e.repLow && e.repHigh ? `${e.repLow}-${e.repHigh}` : "",
        targetWeight: "",
        restSec: 90,
        notes: e.tag === "isolation" ? "Take to failure" : "Leave 1–2 reps in reserve",
      })),
    });
  }

  const completed = old.completedTasks || {};
  const workoutLogs = {};
  for (const [date, log] of Object.entries(old.liftLogs || {})) {
    const id = dayIds[log.type];
    if (!id) continue;
    workoutLogs[date] = {
      dayId: id,
      dayName: log.type === "upper" ? "Upper Day" : "Lower Day",
      ex: log.ex || {},
      completedAt: (completed[date] || []).includes("lift") ? date : null,
    };
  }

  const bossClaimDates = Object.keys(completed)
    .filter((k) => k.endsWith("_boss"))
    .map((k) => k.slice(0, -5));

  return {
    ...base,
    profileName: "KR1SH3N",
    totalXp: old.totalXp || 0,
    skillXp: { ...base.skillXp, ...(old.skillXp || {}) },
    streak: old.streak || 0,
    lastActiveDate: old.lastActiveDate || null,
    longestStreak: old.longestStreak || 0,
    bestDayXp: old.bestDayXp || 0,
    bestDayDate: old.bestDayDate || null,
    activityLog: old.activityLog || {},
    loginBonusDates: old.loginBonusDates || [],
    bossClaimDates,
    workoutPlan: { days },
    workoutLogs,
    workoutXpDates: Object.keys(completed).filter((d) => (completed[d] || []).includes("lift")),
    prs: old.prs || {},
    meals: old.meals || {},
    nutritionGoals: { ...base.nutritionGoals, ...(old.nutritionGoals || {}) },
  };
}

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// Older logs stored only the exercise id; the muscle map needs the name, and the
// plan may since have been edited, so recover names while we still can.
function withExerciseNames(logs, days) {
  const names = new Map();
  for (const d of days) for (const e of d.exercises || []) names.set(e.id, e.name);
  const out = {};
  for (const [date, log] of Object.entries(isObj(logs) ? logs : {})) {
    let changed = false;
    const ex = {};
    for (const [id, e] of Object.entries(log.ex || {})) {
      if (!e.name && names.has(id)) {
        ex[id] = { ...e, name: names.get(id) };
        changed = true;
      } else ex[id] = e;
    }
    out[date] = changed ? { ...log, ex } : log;
  }
  return out;
}

// Accepts any saved/imported/remote object and returns a complete v2 state.
export function migrate(raw) {
  if (!raw || typeof raw !== "object") return defaultState();
  const s = (raw.schemaVersion || 1) < 2 ? migrateV1(raw) : raw;
  const base = defaultState();
  return {
    ...base,
    ...s,
    schemaVersion: SCHEMA_VERSION,
    skillXp: { ...base.skillXp, ...(s.skillXp || {}) },
    nutritionGoals: { ...base.nutritionGoals, ...(s.nutritionGoals || {}) },
    workoutPlan: { days: Array.isArray(s.workoutPlan?.days) ? s.workoutPlan.days : [] },
    dietPlan: { meals: Array.isArray(s.dietPlan?.meals) ? s.dietPlan.meals : [] },
    goals: Array.isArray(s.goals) ? s.goals : [],
    loginBonusDates: Array.isArray(s.loginBonusDates) ? s.loginBonusDates : [],
    bossClaimDates: Array.isArray(s.bossClaimDates) ? s.bossClaimDates : [],
    workoutXpDates: Array.isArray(s.workoutXpDates) ? s.workoutXpDates : [],
    workoutLogs: withExerciseNames(s.workoutLogs, Array.isArray(s.workoutPlan?.days) ? s.workoutPlan.days : []),
    importedSets: isObj(s.importedSets) ? s.importedSets : {},
    exerciseMuscles: isObj(s.exerciseMuscles) ? s.exerciseMuscles : {},
    // Only known keys survive, so settings we have dropped (e.g. the old colour
    // scheme) do not linger in saves forever.
    muscleMap: pick({ ...base.muscleMap, ...(isObj(s.muscleMap) ? s.muscleMap : {}) }, Object.keys(base.muscleMap)),
  };
}

export function looksLikeSave(obj) {
  return !!obj && typeof obj === "object" && "totalXp" in obj && "skillXp" in obj;
}
