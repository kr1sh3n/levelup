import { useState, useEffect, useCallback } from "react";
import {
  getLevel,
  getStreakMultiplier,
  GOAL_XP,
  LIFT_XP,
  MEAL_LOG_XP,
  PR_XP,
  BOSS_XP,
} from "./gameData";
import { defaultState, migrate, todayStr, uid, looksLikeSave } from "./storage";
import { supabase, fetchRemoteState, pushRemoteState } from "./cloud";

const LEGACY_KEY = "levelup_v1";

// ── Local cache ───────────────────────────────────────────────────────────────

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { _updatedAt, ...data } = JSON.parse(raw);
    return { state: migrate(data), updatedAt: Number(_updatedAt) || 0 };
  } catch {
    return null;
  }
}

function writeLocal(key, state, updatedAt) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...state, _updatedAt: updatedAt }));
  } catch {
    /* storage full or blocked — cloud copy (if any) still syncs */
  }
}

// ── Pure state helpers ───────────────────────────────────────────────────────

function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
}

// Counts a day of activity once: first activity of the day bumps the streak.
function computeStreak(prev, today) {
  if (prev.lastActiveDate === today) return { changed: false };
  const streak = prev.lastActiveDate && daysBetween(prev.lastActiveDate, today) === 1 ? prev.streak + 1 : 1;
  return {
    changed: true,
    streak,
    longestStreak: Math.max(streak, prev.longestStreak),
    milestone: streak === 7 || streak === 14 || streak === 30 ? streak : null,
  };
}

// Applies XP (+ optional skill XP) and registers the day as active.
function withXp(prev, amount, skill) {
  const today = todayStr();
  const next = { ...prev };
  let milestone = null;

  const s = computeStreak(prev, today);
  if (s.changed) {
    next.streak = s.streak;
    next.longestStreak = s.longestStreak;
    next.lastActiveDate = today;
    if (s.milestone) milestone = { type: "streak", streak: s.milestone };
  }

  if (amount > 0) {
    next.totalXp = prev.totalXp + amount;
    if (skill) next.skillXp = { ...prev.skillXp, [skill]: (prev.skillXp[skill] || 0) + amount };
    const dayTotal = (prev.activityLog[today] || 0) + amount;
    next.activityLog = { ...prev.activityLog, [today]: dayTotal };
    if (dayTotal > prev.bestDayXp) {
      next.bestDayXp = dayTotal;
      next.bestDayDate = today;
    }
    const newLevel = getLevel(next.totalXp);
    if (newLevel > getLevel(prev.totalXp)) milestone = { type: "levelup", level: newLevel };
  }
  return { next, milestone };
}

// Once per day on load: login bonus, and break the streak if a day was missed.
// Returns the same object when nothing changes.
function applyDaily(prev) {
  const today = todayStr();
  let next = prev;
  let bonus = false;
  if (!prev.loginBonusDates.includes(today)) {
    next = {
      ...next,
      loginBonusDates: [...prev.loginBonusDates.slice(-60), today],
      totalXp: prev.totalXp + 5,
      activityLog: { ...prev.activityLog, [today]: (prev.activityLog[today] || 0) + 5 },
    };
    bonus = true;
  }
  if (prev.lastActiveDate && prev.streak > 0 && daysBetween(prev.lastActiveDate, today) > 1) {
    next = { ...next, streak: 0 };
  }
  return { state: next, bonus };
}

const num = (v) => Math.max(0, Number(v) || 0);
const moveItem = (list, id, dir) => {
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
};

// ── Pure action helpers ───────────────────────────────────────────────────────

const setDays = (prev, days) => ({ ...prev, workoutPlan: { ...prev.workoutPlan, days } });

const exerciseFields = (ex) => ({
  name: ex.name.trim(),
  sets: Math.min(20, num(ex.sets)) || 3,
  reps: String(ex.reps || "").trim(),
  targetWeight: ex.targetWeight === "" || ex.targetWeight == null ? "" : num(ex.targetWeight),
  restSec: Math.min(900, num(ex.restSec)),
  notes: (ex.notes || "").trim(),
});

const mapExercises = (prev, dayId, fn) =>
  setDays(
    prev,
    prev.workoutPlan.days.map((d) => (d.id === dayId ? { ...d, exercises: fn(d.exercises) } : d))
  );

const sessionFor = (prev, dayId) => {
  const today = todayStr();
  const day = prev.workoutPlan.days.find((d) => d.id === dayId);
  if (!day) return null;
  const log = prev.workoutLogs[today];
  return {
    today,
    day,
    log: log && log.dayId === dayId ? log : { dayId, dayName: day.name, ex: {}, completedAt: null },
  };
};

const setPlanMeals = (prev, meals) => ({ ...prev, dietPlan: { ...prev.dietPlan, meals } });

const foodFields = (f) => ({
  name: f.name.trim(),
  qty: String(f.qty || "").trim(),
  cal: num(f.cal),
  protein: num(f.protein),
  carbs: num(f.carbs),
  fats: num(f.fats),
});

const mapItems = (prev, mealId, fn) =>
  setPlanMeals(prev, prev.dietPlan.meals.map((m) => (m.id === mealId ? { ...m, items: fn(m.items) } : m)));

const logEntries = (prev, entries) => {
  const today = todayStr();
  const base = { ...prev, meals: { ...prev.meals, [today]: [...(prev.meals[today] || []), ...entries] } };
  const r = withXp(base, MEAL_LOG_XP, "health");
  return { next: r.next, milestone: r.milestone, toast: { text: `+${MEAL_LOG_XP} XP Meal Logged!`, xp: MEAL_LOG_XP } };
};

// ── Sync controller (created once per mounted user) ──────────────────────────
// Holds the authoritative latest state outside React so successive actions in
// the same tick chain correctly, and owns local caching + debounced cloud push.

function createSync({ key, userId, cloud, setSyncStatus, initial }) {
  let state = initial.state;
  let updatedAt = initial.updatedAt;
  let pushedAt = 0;
  let ready = !cloud;
  let timer = null;
  let inFlight = false;

  const sync = {
    get: () => state,
    updatedAt: () => updatedAt,
    unsynced: () => updatedAt > pushedAt,
    isReady: () => ready,
    isBusy: () => inFlight,
    markReady: () => {
      ready = true;
    },
    markPushed: (ts) => {
      pushedAt = ts;
    },
    set: (next, ts) => {
      state = next;
      updatedAt = ts;
      writeLocal(key, state, updatedAt);
    },
    save: () => writeLocal(key, state, updatedAt),
    cancel: () => clearTimeout(timer),
    schedule: () => {
      if (!cloud) return;
      if (ready) setSyncStatus("saving");
      clearTimeout(timer);
      timer = setTimeout(sync.flush, 800);
    },
    flush: async () => {
      clearTimeout(timer);
      timer = null;
      if (!cloud || !ready || inFlight || updatedAt <= pushedAt) return;
      const snapshot = state;
      const ts = updatedAt;
      inFlight = true;
      setSyncStatus("saving");
      try {
        await pushRemoteState(userId, snapshot, ts);
        pushedAt = ts;
        setSyncStatus("synced");
      } catch {
        setSyncStatus(navigator.onLine ? "error" : "offline");
      } finally {
        inFlight = false;
      }
      if (pushedAt === ts && updatedAt > pushedAt) sync.schedule();
    },
  };
  return sync;
}

function loadInitial(user, key) {
  if (!user) {
    const local = readLocal(key);
    const base = local?.state || defaultState();
    const { state, bonus } = applyDaily(base);
    return { state, updatedAt: state !== base ? Date.now() : local?.updatedAt || 0, bonus, adoptedLegacy: false };
  }
  const own = readLocal(key);
  if (own) return { ...own, bonus: false, adoptedLegacy: false };
  // First sign-in on this device: adopt progress saved before accounts existed.
  // Its timestamp is 0, so an existing cloud save always takes precedence.
  const legacy = readLocal(LEGACY_KEY);
  if (legacy) return { state: legacy.state, updatedAt: 0, bonus: false, adoptedLegacy: true };
  return { state: defaultState(), updatedAt: 0, bonus: false, adoptedLegacy: false };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGameStore(user) {
  const cloud = !!(user && supabase);
  const key = user ? `pdash_v2:${user.id}` : LEGACY_KEY;

  const [syncStatus, setSyncStatus] = useState(cloud ? "loading" : "local");
  const [boot] = useState(() => {
    const init = loadInitial(user, key);
    return { ...init, c: createSync({ key, userId: user?.id, cloud, setSyncStatus, initial: init }) };
  });
  const c = boot.c;
  const [state, setState] = useState(boot.state);
  const [pendingMilestone, setPendingMilestone] = useState(null);
  const [xpToasts, setXpToasts] = useState([]);

  const addToast = useCallback((text, xp) => {
    const id = uid();
    setXpToasts((prev) => [...prev, { id, text, xp }]);
    setTimeout(() => setXpToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  }, []);

  // Every mutation goes through here: fn(prev) returns { next, toast?, milestone? }
  // (or null for no change). Side effects run once, outside any state updater.
  const commit = useCallback(
    (fn) => {
      const prev = c.get();
      const r = fn(prev);
      if (!r || !r.next || r.next === prev) return false;
      c.set(r.next, Date.now());
      c.schedule();
      setState(r.next);
      if (r.toast) addToast(r.toast.text, r.toast.xp);
      if (r.milestone) setTimeout(() => setPendingMilestone(r.milestone), 300);
      return true;
    },
    [c, addToast]
  );

  const adopt = useCallback(
    (next, ts) => {
      c.set(next, ts);
      setState(next);
    },
    [c]
  );

  // Initial load: local mode is ready immediately; cloud mode pulls the remote
  // save, keeps whichever copy is newer, then applies the daily bonus.
  useEffect(() => {
    if (!cloud) {
      c.save();
      if (!boot.bonus) return;
      const t = setTimeout(() => addToast("+5 XP Login Bonus!", 5), 500);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    (async () => {
      let remote = null;
      let reachable = true;
      try {
        remote = await fetchRemoteState(user.id);
      } catch {
        reachable = false;
      }
      if (cancelled) return;
      let base = c.get();
      let baseTs = c.updatedAt();
      if (remote && remote.updatedAt > baseTs) {
        base = migrate(remote.data);
        baseTs = remote.updatedAt;
      }
      if (remote) c.markPushed(remote.updatedAt);
      const { state: next, bonus } = applyDaily(base);
      adopt(next, next !== base ? Date.now() : baseTs);
      if (boot.adoptedLegacy) localStorage.removeItem(LEGACY_KEY);
      c.markReady();
      setSyncStatus(reachable ? "synced" : "offline");
      if (bonus) addToast("+5 XP Login Bonus!", 5);
      if (reachable) c.flush();
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep in step with other devices: pull on focus/online, flush when hidden.
  useEffect(() => {
    if (!cloud) return;
    const pull = async () => {
      if (!c.isReady() || c.isBusy()) return;
      try {
        const remote = await fetchRemoteState(user.id);
        if (remote && remote.updatedAt > c.updatedAt()) {
          c.markPushed(remote.updatedAt);
          adopt(migrate(remote.data), remote.updatedAt);
          setSyncStatus("synced");
        } else {
          await c.flush();
          if (!c.unsynced()) setSyncStatus("synced");
        }
      } catch {
        setSyncStatus(navigator.onLine ? "error" : "offline");
      }
    };
    const onVisibility = () => (document.visibilityState === "visible" ? pull() : c.flush());
    window.addEventListener("online", pull);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", c.flush);
    return () => {
      window.removeEventListener("online", pull);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", c.flush);
      c.cancel();
    };
  }, [cloud, c, user, adopt]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await c.flush();
    if (
      c.unsynced() &&
      !window.confirm("Some changes haven't synced yet (you seem to be offline). Sign out anyway and lose them?")
    ) {
      return;
    }
    localStorage.removeItem(key);
    await supabase.auth.signOut();
  }, [c, key]);

  // ── Goals (Today) ──
  const addGoal = useCallback(
    (g) =>
      commit((prev) => ({
        next: {
          ...prev,
          goals: [
            ...prev.goals,
            {
              id: uid(),
              title: g.title.trim(),
              description: (g.description || "").trim(),
              deadline: g.deadline || "",
              skill: g.skill || "",
              completed: false,
              completedAt: null,
              xpAwarded: false,
              createdAt: Date.now(),
            },
          ],
        },
      })),
    [commit]
  );

  const updateGoal = useCallback(
    (id, patch) =>
      commit((prev) => ({
        next: { ...prev, goals: prev.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) },
      })),
    [commit]
  );

  const deleteGoal = useCallback(
    (id) => commit((prev) => ({ next: { ...prev, goals: prev.goals.filter((g) => g.id !== id) } })),
    [commit]
  );

  // Completing awards XP once per goal; reopening doesn't refund or re-award.
  const toggleGoal = useCallback(
    (id) =>
      commit((prev) => {
        const goal = prev.goals.find((g) => g.id === id);
        if (!goal) return null;
        const completing = !goal.completed;
        const updated = {
          ...goal,
          completed: completing,
          completedAt: completing ? todayStr() : null,
          xpAwarded: goal.xpAwarded || completing,
        };
        const base = { ...prev, goals: prev.goals.map((g) => (g.id === id ? updated : g)) };
        if (!completing) return { next: base };
        const earned = goal.xpAwarded ? 0 : Math.round(GOAL_XP * getStreakMultiplier(prev.streak));
        const r = withXp(base, earned, goal.skill || null);
        return {
          next: r.next,
          milestone: r.milestone,
          toast: earned ? { text: `+${earned} XP Goal Complete!`, xp: earned } : null,
        };
      }),
    [commit]
  );

  const claimBossDay = useCallback(
    () =>
      commit((prev) => {
        const today = todayStr();
        if (prev.bossClaimDates.includes(today)) return null;
        const r = withXp({ ...prev, bossClaimDates: [...prev.bossClaimDates, today] }, BOSS_XP, null);
        return {
          next: r.next,
          milestone: r.milestone?.type === "levelup" ? r.milestone : { type: "bossday" },
          toast: { text: `+${BOSS_XP} XP BOSS DAY!`, xp: BOSS_XP },
        };
      }),
    [commit]
  );

  // ── Workout plan (Gym builder) ──
  const addDay = useCallback(
    (name) =>
      commit((prev) => ({
        next: setDays(prev, [
          ...prev.workoutPlan.days,
          { id: uid(), name: name.trim(), weekdays: [], exercises: [] },
        ]),
      })),
    [commit]
  );

  const updateDay = useCallback(
    (dayId, patch) =>
      commit((prev) => ({
        next: setDays(prev, prev.workoutPlan.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d))),
      })),
    [commit]
  );

  const deleteDay = useCallback(
    (dayId) => commit((prev) => ({ next: setDays(prev, prev.workoutPlan.days.filter((d) => d.id !== dayId)) })),
    [commit]
  );

  // Empties the plan; completed workout history and PRs stay. Today's
  // unfinished session belongs to a day that no longer exists, so drop it.
  const clearPlan = useCallback(
    () =>
      commit((prev) => {
        const today = todayStr();
        const logs = { ...prev.workoutLogs };
        if (logs[today] && !logs[today].completedAt) delete logs[today];
        return { next: { ...setDays(prev, []), workoutLogs: logs } };
      }),
    [commit]
  );

  const moveDay = useCallback(
    (dayId, dir) => commit((prev) => ({ next: setDays(prev, moveItem(prev.workoutPlan.days, dayId, dir)) })),
    [commit]
  );

  const addExercise = useCallback(
    (dayId, ex) =>
      commit((prev) => ({ next: mapExercises(prev, dayId, (list) => [...list, { id: uid(), ...exerciseFields(ex) }]) })),
    [commit]
  );

  const updateExercise = useCallback(
    (dayId, exId, ex) =>
      commit((prev) => ({
        next: mapExercises(prev, dayId, (list) => list.map((e) => (e.id === exId ? { ...e, ...exerciseFields(ex) } : e))),
      })),
    [commit]
  );

  const deleteExercise = useCallback(
    (dayId, exId) => commit((prev) => ({ next: mapExercises(prev, dayId, (list) => list.filter((e) => e.id !== exId)) })),
    [commit]
  );

  const moveExercise = useCallback(
    (dayId, exId, dir) => commit((prev) => ({ next: mapExercises(prev, dayId, (list) => moveItem(list, exId, dir)) })),
    [commit]
  );

  // ── Workout session (today) ──
  const selectWorkoutDay = useCallback(
    (dayId) =>
      commit((prev) => {
        const today = todayStr();
        const logs = { ...prev.workoutLogs };
        if (!dayId) {
          delete logs[today];
          return { next: { ...prev, workoutLogs: logs } };
        }
        const day = prev.workoutPlan.days.find((d) => d.id === dayId);
        if (!day) return null;
        logs[today] = { dayId, dayName: day.name, ex: {}, completedAt: null };
        return { next: { ...prev, workoutLogs: logs } };
      }),
    [commit]
  );

  const addSet = useCallback(
    (dayId, ex, weight, reps, { warmup = false, rir = null } = {}) =>
      commit((prev) => {
        const w = num(weight);
        const r = Math.round(num(reps));
        if (r <= 0) return null;
        const s = sessionFor(prev, dayId);
        if (!s || s.log.completedAt) return null;
        const exLog = s.log.ex[ex.id] || { sets: [], done: false };
        const prKey = ex.name.toLowerCase().trim();
        const prevPr = prev.prs[prKey] || { name: ex.name, maxWeight: 0, maxVolume: 0 };
        // Warm-ups are logged for the record but never count towards PRs or the muscle map.
        const isWeightPr = !warmup && w > 0 && w > prevPr.maxWeight;
        const isVolumePr = !warmup && w > 0 && w * r > prevPr.maxVolume;
        const isPr = isWeightPr || isVolumePr;
        // RIR (reps in reserve) is how many more reps were left in the tank.
        // Warm-ups never carry one, and null means "not recorded".
        const rr = rir == null || rir === "" ? null : Math.max(0, Math.min(10, Math.round(num(rir))));
        const newSet = warmup
          ? { weight: w, reps: r, pr: false, warmup: true }
          : { weight: w, reps: r, pr: isWeightPr, ...(rr == null ? {} : { rir: rr }) };
        const base = {
          ...prev,
          prs: warmup
            ? prev.prs
            : {
                ...prev.prs,
                [prKey]: { name: ex.name, maxWeight: Math.max(prevPr.maxWeight, w), maxVolume: Math.max(prevPr.maxVolume, w * r) },
              },
          workoutLogs: {
            ...prev.workoutLogs,
            [s.today]: {
              ...s.log,
              dayName: s.day.name,
              ex: { ...s.log.ex, [ex.id]: { ...exLog, name: ex.name, sets: [...exLog.sets, newSet] } },
            },
          },
        };
        const x = withXp(base, isPr ? PR_XP : 0, "fitness");
        const prMilestone = { type: "pr", pr: { name: ex.name, kind: isWeightPr ? "weight" : "volume", weight: w, reps: r } };
        return {
          next: x.next,
          milestone: x.milestone?.type === "levelup" ? x.milestone : isPr ? prMilestone : x.milestone,
          toast: isPr ? { text: `+${PR_XP} XP NEW PR!`, xp: PR_XP } : null,
        };
      }),
    [commit]
  );

  const deleteSet = useCallback(
    (dayId, exId, idx) =>
      commit((prev) => {
        const s = sessionFor(prev, dayId);
        const exLog = s?.log.ex[exId];
        if (!exLog || s.log.completedAt) return null;
        return {
          next: {
            ...prev,
            workoutLogs: {
              ...prev.workoutLogs,
              [s.today]: { ...s.log, ex: { ...s.log.ex, [exId]: { ...exLog, sets: exLog.sets.filter((_, i) => i !== idx) } } },
            },
          },
        };
      }),
    [commit]
  );

  const toggleExerciseDone = useCallback(
    (dayId, exId) =>
      commit((prev) => {
        const s = sessionFor(prev, dayId);
        if (!s || s.log.completedAt) return null;
        const exLog = s.log.ex[exId] || { sets: [], done: false };
        return {
          next: {
            ...prev,
            workoutLogs: {
              ...prev.workoutLogs,
              [s.today]: { ...s.log, ex: { ...s.log.ex, [exId]: { ...exLog, done: !exLog.done } } },
            },
          },
        };
      }),
    [commit]
  );

  const finishWorkout = useCallback(
    (dayId) =>
      commit((prev) => {
        const s = sessionFor(prev, dayId);
        if (!s || s.log.completedAt) return null;
        const alreadyEarnedToday = prev.workoutXpDates.includes(s.today);
        const earned = alreadyEarnedToday ? 0 : Math.round(LIFT_XP * getStreakMultiplier(prev.streak));
        const base = {
          ...prev,
          workoutXpDates: alreadyEarnedToday ? prev.workoutXpDates : [...prev.workoutXpDates.slice(-400), s.today],
          workoutLogs: { ...prev.workoutLogs, [s.today]: { ...s.log, dayName: s.day.name, completedAt: s.today } },
        };
        const r = withXp(base, earned, "fitness");
        return {
          next: r.next,
          milestone: r.milestone,
          toast: { text: earned ? `+${earned} XP Workout Complete!` : "Workout saved!", xp: earned },
        };
      }),
    [commit]
  );

  const reopenWorkout = useCallback(
    () =>
      commit((prev) => {
        const today = todayStr();
        const log = prev.workoutLogs[today];
        if (!log?.completedAt) return null;
        return { next: { ...prev, workoutLogs: { ...prev.workoutLogs, [today]: { ...log, completedAt: null } } } };
      }),
    [commit]
  );

  // ── Diet plan (Meals builder) ──
  const addPlanMeal = useCallback(
    (name) =>
      commit((prev) => ({
        next: setPlanMeals(prev, [...prev.dietPlan.meals, { id: uid(), name: name.trim(), items: [] }]),
      })),
    [commit]
  );

  const renamePlanMeal = useCallback(
    (mealId, name) =>
      commit((prev) => ({
        next: setPlanMeals(prev, prev.dietPlan.meals.map((m) => (m.id === mealId ? { ...m, name: name.trim() } : m))),
      })),
    [commit]
  );

  const deletePlanMeal = useCallback(
    (mealId) => commit((prev) => ({ next: setPlanMeals(prev, prev.dietPlan.meals.filter((m) => m.id !== mealId)) })),
    [commit]
  );

  const movePlanMeal = useCallback(
    (mealId, dir) => commit((prev) => ({ next: setPlanMeals(prev, moveItem(prev.dietPlan.meals, mealId, dir)) })),
    [commit]
  );

  const addPlanItem = useCallback(
    (mealId, item) =>
      commit((prev) => ({ next: mapItems(prev, mealId, (items) => [...items, { id: uid(), ...foodFields(item) }]) })),
    [commit]
  );

  const updatePlanItem = useCallback(
    (mealId, itemId, item) =>
      commit((prev) => ({
        next: mapItems(prev, mealId, (items) => items.map((i) => (i.id === itemId ? { ...i, ...foodFields(item) } : i))),
      })),
    [commit]
  );

  const deletePlanItem = useCallback(
    (mealId, itemId) =>
      commit((prev) => ({ next: mapItems(prev, mealId, (items) => items.filter((i) => i.id !== itemId)) })),
    [commit]
  );

  // ── Food log (today) ──
  const logPlanMeal = useCallback(
    (mealId) =>
      commit((prev) => {
        const meal = prev.dietPlan.meals.find((m) => m.id === mealId);
        if (!meal || !meal.items.length) return null;
        return logEntries(
          prev,
          meal.items.map((i) => ({ ...foodFields(i), id: uid(), slot: meal.name }))
        );
      }),
    [commit]
  );

  const addFood = useCallback(
    (slot, item) => commit((prev) => logEntries(prev, [{ id: uid(), slot, ...foodFields(item) }])),
    [commit]
  );

  const updateFood = useCallback(
    (entryId, item) =>
      commit((prev) => {
        const today = todayStr();
        return {
          next: {
            ...prev,
            meals: {
              ...prev.meals,
              [today]: (prev.meals[today] || []).map((m) => (m.id === entryId ? { ...m, ...foodFields(item) } : m)),
            },
          },
        };
      }),
    [commit]
  );

  const deleteFood = useCallback(
    (entryId) =>
      commit((prev) => {
        const today = todayStr();
        return {
          next: { ...prev, meals: { ...prev.meals, [today]: (prev.meals[today] || []).filter((m) => m.id !== entryId) } },
        };
      }),
    [commit]
  );

  const setNutritionGoals = useCallback(
    (goals) =>
      commit((prev) => ({
        next: {
          ...prev,
          nutritionGoals: {
            cal: num(goals.cal),
            protein: num(goals.protein),
            carbs: num(goals.carbs),
            fats: num(goals.fats),
          },
        },
      })),
    [commit]
  );

  // ── Profile & backup ──
  const setProfileName = useCallback(
    (name) => commit((prev) => ({ next: { ...prev, profileName: name.trim().slice(0, 24) } })),
    [commit]
  );

  const setTheme = useCallback(
    (theme) => commit((prev) => (prev.theme === theme ? null : { next: { ...prev, theme } })),
    [commit]
  );

  // ── Muscle map ──
  // Imported sets replace whatever was imported for the same dates, so importing
  // the same sheet twice never double-counts.
  const importWorkoutSets = useCallback(
    (byDate, { replaceAll = false } = {}) =>
      commit((prev) => ({
        next: { ...prev, importedSets: { ...(replaceAll ? {} : prev.importedSets), ...byDate } },
      })),
    [commit]
  );

  const clearImportedSets = useCallback(
    () => commit((prev) => (Object.keys(prev.importedSets).length ? { next: { ...prev, importedSets: {} } } : null)),
    [commit]
  );

  // muscles = { group: "direct" | "indirect" }; an empty object forgets the assignment.
  const setExerciseMuscles = useCallback(
    (key, muscles) =>
      commit((prev) => {
        const rest = { ...prev.exerciseMuscles };
        if (muscles && Object.keys(muscles).length) rest[key] = muscles;
        else delete rest[key];
        return { next: { ...prev, exerciseMuscles: rest } };
      }),
    [commit]
  );

  const setMuscleMapSettings = useCallback(
    (patch) => commit((prev) => ({ next: { ...prev, muscleMap: { ...prev.muscleMap, ...patch } } })),
    [commit]
  );

  const importData = useCallback(
    (parsed) => {
      if (!looksLikeSave(parsed)) throw new Error("This doesn't look like a Pdash backup.");
      const next = migrate(parsed);
      commit(() => ({ next }));
    },
    [commit]
  );

  const dismissMilestone = useCallback(() => setPendingMilestone(null), []);

  // ── Derived values ──
  const today = todayStr();
  const dow = new Date().getDay();
  const days = state.workoutPlan.days;
  const todayLog = state.workoutLogs[today] || null;
  const scheduledDay = days.find((d) => (d.weekdays || []).includes(dow)) || null;
  const activeDayId = todayLog ? todayLog.dayId : scheduledDay?.id || null;
  const activeDay = days.find((d) => d.id === activeDayId) || null;
  const activeLog = activeDay && todayLog?.dayId === activeDay.id ? todayLog : null;

  const lastSessionFor = (exId) => {
    const dates = Object.keys(state.workoutLogs).filter((d) => d < today).sort().reverse();
    for (const d of dates) {
      const exLog = state.workoutLogs[d]?.ex?.[exId];
      if (exLog?.sets?.length) {
        const top = exLog.sets.reduce((a, b) => (b.weight > a.weight ? b : a));
        return { date: d, weight: top.weight, reps: top.reps, sets: exLog.sets.length };
      }
    }
    return null;
  };

  const goalsDueToday = state.goals.filter((g) => g.deadline === today);
  const bossDayActive = dow === 0 && goalsDueToday.length > 0;
  const allDueDone = goalsDueToday.length > 0 && goalsDueToday.every((g) => g.completed);
  const bossClaimed = state.bossClaimDates.includes(today);

  return {
    state,
    user,
    cloud,
    syncStatus,
    signOut,
    today,
    xpToasts,
    pendingMilestone,
    dismissMilestone,

    addGoal,
    updateGoal,
    deleteGoal,
    toggleGoal,
    bossDayActive,
    bossClaimed,
    allDueDone,
    goalsDueToday,
    claimBossDay,

    addDay,
    updateDay,
    deleteDay,
    clearPlan,
    moveDay,
    addExercise,
    updateExercise,
    deleteExercise,
    moveExercise,
    scheduledDay,
    activeDay,
    activeLog,
    selectWorkoutDay,
    addSet,
    deleteSet,
    toggleExerciseDone,
    finishWorkout,
    reopenWorkout,
    lastSessionFor,

    addPlanMeal,
    renamePlanMeal,
    deletePlanMeal,
    movePlanMeal,
    addPlanItem,
    updatePlanItem,
    deletePlanItem,
    logPlanMeal,
    addFood,
    updateFood,
    deleteFood,
    setNutritionGoals,

    setProfileName,
    setTheme,
    importWorkoutSets,
    clearImportedSets,
    setExerciseMuscles,
    setMuscleMapSettings,
    importData,
  };
}
