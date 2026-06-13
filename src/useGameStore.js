import { useState, useEffect, useCallback } from "react";
import {
  getLevel,
  getStreakMultiplier,
  getTasksForDay,
  WEEKLY_QUESTS,
  XP_PER_LEVEL,
  liftTypeForDate,
  LIFT_XP,
} from "./gameData";

const STORE_KEY = "levelup_v1";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function weekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

// Single source of truth for the streak. Any logged activity (task, meal, gym set)
// calls through here. Counts a day once: first activity bumps it, the rest are no-ops.
function computeStreak(prev) {
  const today = todayStr();
  if (prev.lastActiveDate === today) {
    // Already counted today.
    return { changed: false, streak: prev.streak, longestStreak: prev.longestStreak, milestone: null };
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const newStreak = prev.lastActiveDate === yesterdayStr ? prev.streak + 1 : 1;
  const milestone = newStreak === 7 || newStreak === 14 || newStreak === 30 ? newStreak : null;
  return {
    changed: true,
    streak: newStreak,
    longestStreak: Math.max(newStreak, prev.longestStreak),
    milestone,
  };
}

function defaultState() {
  return {
    totalXp: 0,
    skillXp: { fitness: 0, mind: 0, creator: 0, health: 0 },
    streak: 0,
    lastActiveDate: null,
    longestStreak: 0,
    bestDayXp: 0,
    bestDayDate: null,
    completedTasks: {}, // { "YYYY-MM-DD": ["taskId", ...] }
    loginBonusDates: [], // dates where login bonus was granted
    weeklyStats: {}, // { "week-YYYY-MM-DD": { workoutsCompleted, codingDays, waterDays, readingDays, youtubeVideos } }
    weeklyQuestsClaimed: {}, // { "week-YYYY-MM-DD": ["questId", ...] }
    every2Seed: Math.floor(Math.random() * 2), // 0 or 1
    activityLog: {}, // { "YYYY-MM-DD": totalXpEarned }
    meals: {}, // { "YYYY-MM-DD": [ {id, slot, name, cal, protein, carbs, fats} ] }
    nutritionGoals: { cal: 2200, protein: 150, carbs: 220, fats: 70 },
    prs: {}, // { exerciseNameKey: { name, maxWeight, maxVolume } }

    // ── Lifting ──
    liftDay1: 1, // weekday (0=Sun..6=Sat) that is "Day 1" (first Upper day). Monday=1.
    routines: { upper: [], lower: [] }, // ex: {id, name, tag:'compound'|'isolation', targetSets, repLow, repHigh}
    liftLogs: {}, // { "YYYY-MM-DD": { type, ex: { [exId]: { sets:[{weight,reps,pr}], done } } } }
    lastOverloadWeek: null, // ISO week key the overload reminder was last dismissed
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

export function useGameStore() {
  const [state, setState] = useState(loadState);
  const [pendingMilestone, setPendingMilestone] = useState(null);
  const [xpToasts, setXpToasts] = useState([]);

  // Persist on every change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Daily login bonus + streak update on mount
  useEffect(() => {
    const today = todayStr();
    setState((prev) => {
      const next = { ...prev };

      // Login bonus
      if (!prev.loginBonusDates.includes(today)) {
        next.loginBonusDates = [...prev.loginBonusDates, today];
        const bonus = 5;
        next.totalXp = prev.totalXp + bonus;
        next.activityLog = {
          ...prev.activityLog,
          [today]: (prev.activityLog[today] || 0) + bonus,
        };
        setTimeout(() =>
          addToast({ id: Date.now() + Math.random(), text: "+5 XP Login Bonus!", xp: 5 }), 500
        );
      }

      // Streak reset: if more than one full day has passed since the last logged
      // activity, the streak is broken. (Today's first activity will re-bump it.)
      if (prev.lastActiveDate && prev.lastActiveDate !== today) {
        const diff = Math.floor(
          (new Date(today) - new Date(prev.lastActiveDate)) / (1000 * 60 * 60 * 24)
        );
        if (diff > 1) next.streak = 0;
      }

      return next;
    });
  }, []); // eslint-disable-line

  const addToast = useCallback((toast) => {
    setXpToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setXpToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 2500);
  }, []);

  const completeTask = useCallback(
    (taskId, taskXp, taskSkill) => {
      const today = todayStr();
      setState((prev) => {
        const todayDone = prev.completedTasks[today] || [];
        if (todayDone.includes(taskId)) return prev;

        const multiplier = getStreakMultiplier(prev.streak);
        const earned = Math.round(taskXp * multiplier);

        const newTodayDone = [...todayDone, taskId];
        const newActivityLog = {
          ...prev.activityLog,
          [today]: (prev.activityLog[today] || 0) + earned,
        };

        const newBestDayXp =
          (newActivityLog[today] || 0) > prev.bestDayXp
            ? newActivityLog[today]
            : prev.bestDayXp;
        const newBestDayDate =
          newBestDayXp > prev.bestDayXp ? today : prev.bestDayDate;

        // Update skill XP
        const newSkillXp = { ...prev.skillXp };
        if (taskSkill) newSkillXp[taskSkill] = (newSkillXp[taskSkill] || 0) + earned;

        // Update weekly stats
        const wk = weekKey(new Date());
        const wStats = { ...(prev.weeklyStats[wk] || {}) };
        if (taskId === "upper" || taskId === "lower")
          wStats.workoutsCompleted = (wStats.workoutsCompleted || 0) + 1;
        if (taskId === "coding") wStats.codingDays = (wStats.codingDays || 0) + 1;
        if (taskId === "water") wStats.waterDays = (wStats.waterDays || 0) + 1;
        if (taskId === "read") wStats.readingDays = (wStats.readingDays || 0) + 1;
        if (taskId === "youtube") wStats.youtubeVideos = (wStats.youtubeVideos || 0) + 1;
        if (taskId === "reel") wStats.reelDays = (wStats.reelDays || 0) + 1;

        // Streak update (shared helper — counts the day once)
        const s = computeStreak(prev);
        const newStreak = s.streak;
        const newLongestStreak = s.longestStreak;

        const prevLevel = getLevel(prev.totalXp);
        const newTotalXp = prev.totalXp + earned;
        const newLevel = getLevel(newTotalXp);

        if (newLevel > prevLevel) {
          setTimeout(() => setPendingMilestone({ type: "levelup", level: newLevel }), 300);
        } else if (s.milestone) {
          setTimeout(() => setPendingMilestone({ type: "streak", streak: s.milestone }), 300);
        }

        return {
          ...prev,
          totalXp: newTotalXp,
          skillXp: newSkillXp,
          streak: newStreak,
          longestStreak: newLongestStreak,
          lastActiveDate: today,
          bestDayXp: newBestDayXp,
          bestDayDate: newBestDayDate,
          completedTasks: { ...prev.completedTasks, [today]: newTodayDone },
          activityLog: newActivityLog,
          weeklyStats: { ...prev.weeklyStats, [wk]: wStats },
        };
      });

      const multiplier = getStreakMultiplier(
        JSON.parse(localStorage.getItem(STORE_KEY) || "{}").streak || 0
      );
      const toastXp = Math.round(taskXp * multiplier);
      addToast({ id: Date.now() + Math.random(), text: `+${toastXp} XP`, xp: toastXp });
    },
    [addToast]
  );

  const claimWeeklyQuest = useCallback((questId, questXp) => {
    const wk = weekKey(new Date());
    setState((prev) => {
      const claimed = prev.weeklyQuestsClaimed[wk] || [];
      if (claimed.includes(questId)) return prev;
      const today = todayStr();
      return {
        ...prev,
        totalXp: prev.totalXp + questXp,
        activityLog: {
          ...prev.activityLog,
          [today]: (prev.activityLog[today] || 0) + questXp,
        },
        weeklyQuestsClaimed: {
          ...prev.weeklyQuestsClaimed,
          [wk]: [...claimed, questId],
        },
      };
    });
    addToast({ id: Date.now() + Math.random(), text: `+${questXp} XP Quest!`, xp: questXp });
  }, [addToast]);

  const claimBossDay = useCallback(() => {
    const today = todayStr();
    setState((prev) => {
      if ((prev.completedTasks[today + "_boss"] || []).includes("claimed")) return prev;
      return {
        ...prev,
        totalXp: prev.totalXp + 500,
        activityLog: {
          ...prev.activityLog,
          [today]: (prev.activityLog[today] || 0) + 500,
        },
        completedTasks: {
          ...prev.completedTasks,
          [today + "_boss"]: ["claimed"],
        },
      };
    });
    addToast({ id: Date.now() + Math.random(), text: "+500 XP BOSS DAY!", xp: 500 });
    setTimeout(() => setPendingMilestone({ type: "bossday" }), 300);
  }, [addToast]);

  // Generic XP award (used by meals & PRs) — updates total, skill, activity, best day, level-up.
  const awardXp = useCallback((skill, amount, toastText) => {
    const today = todayStr();
    setState((prev) => {
      const newTotalXp = prev.totalXp + amount;
      const newSkillXp = { ...prev.skillXp };
      if (skill) newSkillXp[skill] = (newSkillXp[skill] || 0) + amount;
      const newActivityLog = {
        ...prev.activityLog,
        [today]: (prev.activityLog[today] || 0) + amount,
      };
      const dayTotal = newActivityLog[today];
      const newBestDayXp = dayTotal > prev.bestDayXp ? dayTotal : prev.bestDayXp;
      const newBestDayDate = dayTotal > prev.bestDayXp ? today : prev.bestDayDate;

      if (getLevel(newTotalXp) > getLevel(prev.totalXp)) {
        setTimeout(() => setPendingMilestone({ type: "levelup", level: getLevel(newTotalXp) }), 300);
      }

      return {
        ...prev,
        totalXp: newTotalXp,
        skillXp: newSkillXp,
        activityLog: newActivityLog,
        bestDayXp: newBestDayXp,
        bestDayDate: newBestDayDate,
      };
    });
    if (amount > 0)
      addToast({ id: Date.now() + Math.random(), text: toastText || `+${amount} XP`, xp: amount });
  }, [addToast]);

  // Keep the streak alive from any logged activity (meals, gym sets).
  const registerActivity = useCallback(() => {
    setState((prev) => {
      const s = computeStreak(prev);
      if (!s.changed) return prev;
      if (s.milestone) setTimeout(() => setPendingMilestone({ type: "streak", streak: s.milestone }), 300);
      return { ...prev, streak: s.streak, longestStreak: s.longestStreak, lastActiveDate: todayStr() };
    });
  }, []);

  // ── Meals ──
  const addMeal = useCallback((meal) => {
    const today = todayStr();
    setState((prev) => {
      const dayMeals = prev.meals[today] || [];
      return {
        ...prev,
        meals: { ...prev.meals, [today]: [...dayMeals, { ...meal, id: Date.now() + "" + Math.random() }] },
      };
    });
    awardXp("health", 5, "+5 XP Meal Logged!");
    registerActivity();
  }, [awardXp, registerActivity]);

  const deleteMeal = useCallback((mealId) => {
    const today = todayStr();
    setState((prev) => ({
      ...prev,
      meals: { ...prev.meals, [today]: (prev.meals[today] || []).filter((m) => m.id !== mealId) },
    }));
  }, []);

  const setNutritionGoals = useCallback((goals) => {
    setState((prev) => ({ ...prev, nutritionGoals: { ...prev.nutritionGoals, ...goals } }));
  }, []);

  // ── Lifting: cycle config ──
  const setLiftDay1 = useCallback((weekday) => {
    setState((prev) => ({ ...prev, liftDay1: weekday }));
  }, []);

  // ── Lifting: routine builder ──
  const addRoutineExercise = useCallback((type, ex) => {
    setState((prev) => ({
      ...prev,
      routines: {
        ...prev.routines,
        [type]: [
          ...(prev.routines[type] || []),
          {
            id: Date.now() + "" + Math.random(),
            name: ex.name.trim(),
            tag: ex.tag || "compound",
            targetSets: Number(ex.targetSets) || 3,
            repLow: Number(ex.repLow) || 8,
            repHigh: Number(ex.repHigh) || 12,
          },
        ],
      },
    }));
  }, []);

  const updateRoutineExercise = useCallback((type, exId, patch) => {
    setState((prev) => ({
      ...prev,
      routines: {
        ...prev.routines,
        [type]: (prev.routines[type] || []).map((e) => (e.id === exId ? { ...e, ...patch } : e)),
      },
    }));
  }, []);

  const removeRoutineExercise = useCallback((type, exId) => {
    setState((prev) => ({
      ...prev,
      routines: { ...prev.routines, [type]: (prev.routines[type] || []).filter((e) => e.id !== exId) },
    }));
  }, []);

  const moveRoutineExercise = useCallback((type, exId, dir) => {
    setState((prev) => {
      const list = [...(prev.routines[type] || [])];
      const i = list.findIndex((e) => e.id === exId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...prev, routines: { ...prev.routines, [type]: list } };
    });
  }, []);

  // ── Lifting: completion (all exercises checked → award once) ──
  const completeLiftDay = useCallback(() => {
    const today = todayStr();
    setState((prev) => {
      if ((prev.completedTasks[today] || []).includes("lift")) return prev;
      const mult = getStreakMultiplier(prev.streak);
      const earned = Math.round(LIFT_XP * mult);
      const wk = weekKey(new Date());
      const wStats = { ...(prev.weeklyStats[wk] || {}) };
      wStats.workoutsCompleted = (wStats.workoutsCompleted || 0) + 1;
      const newActivityLog = { ...prev.activityLog, [today]: (prev.activityLog[today] || 0) + earned };
      const dayTotal = newActivityLog[today];
      const s = computeStreak(prev);
      const newTotalXp = prev.totalXp + earned;

      if (getLevel(newTotalXp) > getLevel(prev.totalXp)) {
        setTimeout(() => setPendingMilestone({ type: "levelup", level: getLevel(newTotalXp) }), 300);
      } else if (s.milestone) {
        setTimeout(() => setPendingMilestone({ type: "streak", streak: s.milestone }), 300);
      }

      return {
        ...prev,
        totalXp: newTotalXp,
        skillXp: { ...prev.skillXp, fitness: (prev.skillXp.fitness || 0) + earned },
        streak: s.streak,
        longestStreak: s.longestStreak,
        lastActiveDate: today,
        activityLog: newActivityLog,
        bestDayXp: dayTotal > prev.bestDayXp ? dayTotal : prev.bestDayXp,
        bestDayDate: dayTotal > prev.bestDayXp ? today : prev.bestDayDate,
        completedTasks: { ...prev.completedTasks, [today]: [...(prev.completedTasks[today] || []), "lift"] },
        weeklyStats: { ...prev.weeklyStats, [wk]: wStats },
      };
    });
    addToast({ id: Date.now() + Math.random(), text: `+${LIFT_XP} XP Lift Complete!`, xp: LIFT_XP });
  }, [addToast]);

  // ── Lifting: per-exercise logging ──
  const addLiftSet = useCallback((exId, name, weight, reps) => {
    const today = todayStr();
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;
    if (r <= 0) return;
    let prResult = null;

    setState((prev) => {
      const type = liftTypeForDate(new Date(), prev.liftDay1);
      const log = prev.liftLogs[today] || { type, ex: {} };
      const exLog = log.ex[exId] || { sets: [], done: false };
      const key = name.toLowerCase().trim();
      const volume = w * r;
      const prevPr = prev.prs[key] || { name, maxWeight: 0, maxVolume: 0 };
      const isWeightPr = w > prevPr.maxWeight;
      const isVolumePr = volume > prevPr.maxVolume;
      if (isWeightPr || isVolumePr) {
        prResult = { name, kind: isWeightPr ? "weight" : "volume", weight: w, reps: r };
      }
      const newPrs = {
        ...prev.prs,
        [key]: { name, maxWeight: Math.max(prevPr.maxWeight, w), maxVolume: Math.max(prevPr.maxVolume, volume) },
      };
      const newLog = {
        ...log,
        type,
        ex: { ...log.ex, [exId]: { ...exLog, sets: [...exLog.sets, { weight: w, reps: r, pr: isWeightPr }] } },
      };
      return { ...prev, liftLogs: { ...prev.liftLogs, [today]: newLog }, prs: newPrs };
    });

    registerActivity();
    if (prResult) {
      awardXp("fitness", 25, "+25 XP NEW PR!");
      setTimeout(() => setPendingMilestone({ type: "pr", pr: prResult }), 300);
    }
  }, [awardXp, registerActivity]);

  const deleteLiftSet = useCallback((exId, setIdx) => {
    const today = todayStr();
    setState((prev) => {
      const log = prev.liftLogs[today];
      if (!log || !log.ex[exId]) return prev;
      const exLog = log.ex[exId];
      return {
        ...prev,
        liftLogs: {
          ...prev.liftLogs,
          [today]: { ...log, ex: { ...log.ex, [exId]: { ...exLog, sets: exLog.sets.filter((_, i) => i !== setIdx) } } },
        },
      };
    });
  }, []);

  const toggleExerciseDone = useCallback((exId) => {
    const today = todayStr();
    setState((prev) => {
      const type = liftTypeForDate(new Date(), prev.liftDay1);
      if (type !== "upper" && type !== "lower") return prev;
      const log = prev.liftLogs[today] || { type, ex: {} };
      const exLog = log.ex[exId] || { sets: [], done: false };
      const newEx = { ...log.ex, [exId]: { ...exLog, done: !exLog.done } };
      return { ...prev, liftLogs: { ...prev.liftLogs, [today]: { ...log, type, ex: newEx } } };
    });
    // Completion is detected declaratively by an effect — see below.
  }, []);

  // When every exercise in today's routine is checked off, award the lift once.
  useEffect(() => {
    const today = todayStr();
    const type = liftTypeForDate(new Date(), state.liftDay1);
    if (type !== "upper" && type !== "lower") return;
    const routine = state.routines[type] || [];
    if (routine.length === 0) return;
    if ((state.completedTasks[today] || []).includes("lift")) return;
    const log = state.liftLogs[today];
    if (!log) return;
    if (routine.every((r) => log.ex[r.id]?.done)) completeLiftDay();
  }, [state.liftLogs, state.routines, state.liftDay1, state.completedTasks, completeLiftDay]);

  // ── Backup ──
  const importData = useCallback((parsed) => {
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid file");
    // Sanity check: must look like a LevelUp save.
    if (!("totalXp" in parsed) || !("skillXp" in parsed)) {
      throw new Error("This doesn't look like a LevelUp backup.");
    }
    setState({ ...defaultState(), ...parsed });
  }, []);

  const dismissMilestone = useCallback(() => setPendingMilestone(null), []);

  // Derive today's tasks
  const today = todayStr();
  const todayDate = new Date();
  const todayDone = state.completedTasks[today] || [];
  const todayTasks = getTasksForDay(todayDate, state.every2Seed);

  // Weekly quest state
  const wk = weekKey(new Date());
  const wStats = state.weeklyStats[wk] || {};
  const wClaimed = state.weeklyQuestsClaimed[wk] || [];

  const weeklyQuests = WEEKLY_QUESTS.map((q) => ({
    ...q,
    progressVal: q.progress(wStats),
    completed: q.check(wStats),
    claimed: wClaimed.includes(q.id),
  }));

  // Boss day
  const bossDayActive = todayDate.getDay() === 0;
  const bossClaimed = (state.completedTasks[today + "_boss"] || []).includes("claimed");
  const allTodayDone = todayTasks.every((t) => todayDone.includes(t.id));

  // Meals for today
  const todayMeals = state.meals[today] || [];

  // ── Lifting derivations ──
  const todayLiftType = liftTypeForDate(todayDate, state.liftDay1); // 'upper'|'lower'|'rest'
  const todayRoutine = state.routines[todayLiftType] || [];
  const todayLiftLog = state.liftLogs[today] || { type: todayLiftType, ex: {} };
  const liftComplete = todayDone.includes("lift");
  const liftDoneCount = todayRoutine.filter((r) => todayLiftLog.ex[r.id]?.done).length;

  // Recently logged meals, deduped by name (most recent first) — for one-tap re-logging.
  const recentMeals = (() => {
    const seen = new Set();
    const out = [];
    const dates = Object.keys(state.meals).sort().reverse();
    for (const d of dates) {
      const items = state.meals[d] || [];
      for (let i = items.length - 1; i >= 0; i--) {
        const m = items[i];
        const key = m.name.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
        if (out.length >= 8) return out;
      }
    }
    return out;
  })();

  // Most recent prior session for a routine exercise (by exId) — top weight set.
  const lastLiftSessionFor = (exId) => {
    const dates = Object.keys(state.liftLogs)
      .filter((d) => d < today)
      .sort()
      .reverse();
    for (const d of dates) {
      const exLog = state.liftLogs[d]?.ex?.[exId];
      if (exLog && exLog.sets.length) {
        const top = exLog.sets.reduce((a, b) => (b.weight > a.weight ? b : a));
        return { date: d, weight: top.weight, reps: top.reps, sets: exLog.sets.length };
      }
    }
    return null;
  };

  // Progressive-overload reminder: once per ISO week, on training days, for the
  // compound (main) lifts that have prior history to beat.
  const overloadDue =
    (todayLiftType === "upper" || todayLiftType === "lower") &&
    state.lastOverloadWeek !== wk &&
    todayRoutine.some((r) => r.tag === "compound" && lastLiftSessionFor(r.id));
  const overloadLifts = todayRoutine
    .filter((r) => r.tag === "compound")
    .map((r) => ({ name: r.name, last: lastLiftSessionFor(r.id) }))
    .filter((x) => x.last);

  return {
    state,
    todayTasks,
    todayDone,
    weeklyQuests,
    bossDayActive,
    bossClaimed,
    allTodayDone,
    pendingMilestone,
    xpToasts,
    completeTask,
    claimWeeklyQuest,
    claimBossDay,
    dismissMilestone,
    wk,
    wStats,
    todayMeals,
    recentMeals,
    nutritionGoals: state.nutritionGoals,
    addMeal,
    deleteMeal,
    setNutritionGoals,
    prs: state.prs,
    importData,

    // Lifting
    liftDay1: state.liftDay1,
    setLiftDay1,
    routines: state.routines,
    addRoutineExercise,
    updateRoutineExercise,
    removeRoutineExercise,
    moveRoutineExercise,
    todayLiftType,
    todayRoutine,
    todayLiftLog,
    liftComplete,
    liftDoneCount,
    addLiftSet,
    deleteLiftSet,
    toggleExerciseDone,
    lastLiftSessionFor,
    overloadDue,
    overloadLifts,
    dismissOverload: () => setState((prev) => ({ ...prev, lastOverloadWeek: wk })),
  };
}
