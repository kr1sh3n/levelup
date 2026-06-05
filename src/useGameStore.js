import { useState, useEffect, useCallback } from "react";
import {
  getLevel,
  getStreakMultiplier,
  getTasksForDay,
  WEEKLY_QUESTS,
  XP_PER_LEVEL,
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
    workoutLog: {}, // { "YYYY-MM-DD": [ {id, name, sets: [{weight, reps}]} ] }
    prs: {}, // { exerciseKey: { name, maxWeight, maxVolume } }
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

  // ── Gym ──
  const addExercise = useCallback((name) => {
    const today = todayStr();
    setState((prev) => {
      const dayLog = prev.workoutLog[today] || [];
      return {
        ...prev,
        workoutLog: {
          ...prev.workoutLog,
          [today]: [...dayLog, { id: Date.now() + "" + Math.random(), name: name.trim(), sets: [] }],
        },
      };
    });
  }, []);

  const deleteExercise = useCallback((exId) => {
    const today = todayStr();
    setState((prev) => ({
      ...prev,
      workoutLog: { ...prev.workoutLog, [today]: (prev.workoutLog[today] || []).filter((e) => e.id !== exId) },
    }));
  }, []);

  const addSet = useCallback((exId, weight, reps) => {
    const today = todayStr();
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;
    if (r <= 0) return;
    let prResult = null;

    setState((prev) => {
      const dayLog = prev.workoutLog[today] || [];
      const ex = dayLog.find((e) => e.id === exId);
      if (!ex) return prev;
      const key = ex.name.toLowerCase().trim();
      const volume = w * r;
      const prevPr = prev.prs[key] || { name: ex.name, maxWeight: 0, maxVolume: 0 };

      const isWeightPr = w > prevPr.maxWeight;
      const isVolumePr = volume > prevPr.maxVolume;
      if (isWeightPr || isVolumePr) {
        prResult = { name: ex.name, kind: isWeightPr ? "weight" : "volume", weight: w, reps: r };
      }

      const newPrs = {
        ...prev.prs,
        [key]: {
          name: ex.name,
          maxWeight: Math.max(prevPr.maxWeight, w),
          maxVolume: Math.max(prevPr.maxVolume, volume),
        },
      };

      const newDayLog = dayLog.map((e) =>
        e.id === exId ? { ...e, sets: [...e.sets, { weight: w, reps: r, pr: isWeightPr }] } : e
      );

      return { ...prev, workoutLog: { ...prev.workoutLog, [today]: newDayLog }, prs: newPrs };
    });

    registerActivity();
    if (prResult) {
      awardXp("fitness", 25, "+25 XP NEW PR!");
      setTimeout(() => setPendingMilestone({ type: "pr", pr: prResult }), 300);
    }
  }, [awardXp, registerActivity]);

  const deleteSet = useCallback((exId, setIdx) => {
    const today = todayStr();
    setState((prev) => {
      const dayLog = prev.workoutLog[today] || [];
      const newDayLog = dayLog.map((e) =>
        e.id === exId ? { ...e, sets: e.sets.filter((_, i) => i !== setIdx) } : e
      );
      return { ...prev, workoutLog: { ...prev.workoutLog, [today]: newDayLog } };
    });
  }, []);

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

  // Meals & gym for today
  const todayMeals = state.meals[today] || [];
  const todayWorkout = state.workoutLog[today] || [];

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

  // Most recent prior session for a given exercise name (top weight set).
  const lastSessionFor = (name) => {
    const key = name.toLowerCase().trim();
    const dates = Object.keys(state.workoutLog)
      .filter((d) => d < today)
      .sort()
      .reverse();
    for (const d of dates) {
      const ex = (state.workoutLog[d] || []).find((e) => e.name.toLowerCase().trim() === key);
      if (ex && ex.sets.length) {
        const top = ex.sets.reduce((a, b) => (b.weight > a.weight ? b : a));
        return { date: d, weight: top.weight, reps: top.reps, sets: ex.sets.length };
      }
    }
    return null;
  };

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
    todayWorkout,
    prs: state.prs,
    addExercise,
    addSet,
    deleteSet,
    deleteExercise,
    lastSessionFor,
    importData,
  };
}
