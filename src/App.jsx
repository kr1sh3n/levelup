import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import "./App.css";
import { useGameStore } from "./useGameStore";
import MealsTab from "./MealsTab";
import GymTab from "./GymTab";
import {
  getLevel,
  getXpInCurrentLevel,
  getLevelTitle,
  getStreakMultiplier,
  SKILL_COLORS,
  SKILL_LABELS,
  XP_PER_LEVEL,
  isBossDay,
} from "./gameData";

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function groupTasksBySkill(tasks) {
  const groups = {};
  tasks.forEach((t) => {
    const key = t.skill;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  return groups;
}

const SKILL_GROUP_ORDER = ["fitness", "mind", "creator", "health"];

// ── Sub-components ────────────────────────────────────────────────────────────

function XpBar({ current, max, color, glow, height = 6 }) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  return (
    <div className="xp-bar" style={{ height }}>
      <div
        className="xp-bar-fill"
        style={{
          width: `${pct}%`,
          background: color
            ? `linear-gradient(90deg, ${color}, ${color}cc)`
            : undefined,
          boxShadow: glow ? `0 0 8px ${glow}` : undefined,
        }}
      />
    </div>
  );
}

function SkillRows({ skillXp }) {
  return SKILL_GROUP_ORDER.map((skill) => {
    const xp = skillXp[skill] || 0;
    const level = Math.floor(xp / 500) + 1;
    const inLevel = xp % 500;
    const { color, glow } = SKILL_COLORS[skill];
    return (
      <div key={skill} className="skill-row">
        <div className="skill-info">
          <div className="skill-name">
            <span style={{ color }}>{SKILL_LABELS[skill]}</span>
            <span className="skill-lvl">Lv {level}</span>
          </div>
          <XpBar current={inLevel} max={500} color={color} glow={glow} height={6} />
        </div>
      </div>
    );
  });
}

// ── Today Tab ─────────────────────────────────────────────────────────────────

function TodayTab({ store }) {
  const {
    state,
    todayTasks,
    todayDone,
    bossDayActive,
    bossClaimed,
    allTodayDone,
    completeTask,
    claimBossDay,
  } = store;

  const multiplier = getStreakMultiplier(state.streak);
  const groups = groupTasksBySkill(todayTasks);

  return (
    <div className="page">
      {multiplier > 1 && (
        <div className="multiplier-banner">
          <div className="mult-dot" />
          {multiplier}x XP Multiplier Active — {state.streak} day streak!
        </div>
      )}

      {bossDayActive && (
        <div className={`card boss-card ${!bossClaimed ? "boss-pulse" : ""}`}>
          <div className="boss-title">BOSS DAY</div>
          <div className="boss-desc">
            It&apos;s Sunday! Complete ALL tasks today to claim the Boss Day bonus.
            {allTodayDone && !bossClaimed && " You've done it — claim your reward!"}
          </div>
          <button
            className="claim-btn"
            style={{ background: bossClaimed ? undefined : "linear-gradient(135deg, #dc2626, #9333ea)" }}
            disabled={!allTodayDone || bossClaimed}
            onClick={claimBossDay}
          >
            {bossClaimed ? "✓ CLAIMED" : allTodayDone ? "CLAIM +500 XP" : "COMPLETE ALL TASKS FIRST"}
          </button>
        </div>
      )}

      {SKILL_GROUP_ORDER.filter((s) => groups[s]).map((skill) => (
        <div key={skill}>
          <div className="section-head" style={{ color: SKILL_COLORS[skill].color }}>
            {SKILL_LABELS[skill]}
          </div>
          {groups[skill].map((task) => {
            const done = todayDone.includes(task.id);
            const earned = Math.round(task.xp * multiplier);
            return (
              <div
                key={task.id}
                className={`task-item ${done ? "done" : ""}`}
                style={{ "--accent": SKILL_COLORS[task.skill].color }}
                onClick={() => !done && completeTask(task.id, task.xp, task.skill)}
              >
                <div className="task-info">
                  <div className="task-label">{task.label}</div>
                  <div className="task-xp">
                    +{earned} XP{multiplier > 1 && ` (${task.xp} × ${multiplier})`}
                  </div>
                </div>
                <div className="task-check">{done ? "✓" : ""}</div>
              </div>
            );
          })}
        </div>
      ))}

      {todayTasks.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", paddingTop: 32 }}>
          <div>No tasks today. Rest up, adventurer.</div>
        </div>
      )}
    </div>
  );
}

// ── Quests Tab ────────────────────────────────────────────────────────────────

function QuestsTab({ store }) {
  const { weeklyQuests, claimWeeklyQuest } = store;

  return (
    <div className="page">
      <div className="section-head">Weekly Quests</div>
      {weeklyQuests.map((q) => {
        const pct = Math.min(100, Math.round((q.progressVal / q.total) * 100));
        return (
          <div key={q.id} className="quest-item">
            <div className="quest-header">
              <div className="quest-label">{q.label}</div>
              <div className="quest-xp">+{q.xp} XP</div>
            </div>
            <div className="quest-bar">
              <div className="quest-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="quest-progress">
              {q.progressVal} / {q.total} {q.claimed && "· ✓ Claimed"}
            </div>
            {q.completed && !q.claimed && (
              <button className="claim-btn" onClick={() => claimWeeklyQuest(q.id, q.xp)}>
                CLAIM REWARD
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

function StatsTab({ store }) {
  const { state } = store;
  const level = getLevel(state.totalXp);

  // Build last 28 days for heatmap
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const xp = state.activityLog[key] || 0;
    days.push({ key, xp });
  }

  const maxXpDay = Math.max(...days.map((d) => d.xp), 1);

  function heatLevel(xp) {
    if (xp === 0) return "";
    const ratio = xp / maxXpDay;
    if (ratio < 0.25) return "lvl1";
    if (ratio < 0.5) return "lvl2";
    if (ratio < 0.75) return "lvl3";
    return "lvl4";
  }

  const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="page">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{state.totalXp.toLocaleString()}</div>
          <div className="stat-label">Total XP</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{level}</div>
          <div className="stat-label">Current Level</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{state.longestStreak}</div>
          <div className="stat-label">Longest Streak</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{state.bestDayXp}</div>
          <div className="stat-label">Best Day XP</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Activity — Last 4 Weeks</div>
        <div className="heatmap-labels">
          {DAY_LABELS.map((l, i) => (
            <div key={i} className="heatmap-label">{l}</div>
          ))}
        </div>
        <div className="heatmap">
          {days.map((d) => (
            <div key={d.key} className={`heatmap-day ${heatLevel(d.xp)}`} title={`${d.key}: ${d.xp} XP`} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Skill Levels</div>
        <SkillRows skillXp={state.skillXp} />
      </div>
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ store }) {
  const { state, importData } = store;
  const level = getLevel(state.totalXp);
  const xpInLevel = getXpInCurrentLevel(state.totalXp);
  const title = getLevelTitle(level);
  const multiplier = getStreakMultiplier(state.streak);
  const fileRef = useRef(null);
  const [backupMsg, setBackupMsg] = useState(null);

  function flash(msg) {
    setBackupMsg(msg);
    setTimeout(() => setBackupMsg(null), 3500);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `levelup-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash("✓ Backup downloaded");
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!window.confirm("Importing will REPLACE all current progress with the backup. Continue?")) return;
        importData(parsed);
        flash("✓ Backup restored");
      } catch (err) {
        flash("✗ " + (err.message || "Couldn't read that file"));
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="page">
      <div className="profile-avatar">{level}</div>
      <div className="profile-name">LVL {level} PLAYER</div>
      <div className="profile-title">{title}</div>

      <div className="card">
        <div className="card-title">Progress to Next Level</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
          <span style={{ color: "var(--purple-light)", fontWeight: 600 }}>{xpInLevel} XP</span>
          <span>{XP_PER_LEVEL} XP</span>
        </div>
        <XpBar current={xpInLevel} max={XP_PER_LEVEL} height={10} />
      </div>

      <div className="card">
        <div className="card-title">Skill Trees</div>
        <SkillRows skillXp={state.skillXp} />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--orange)" }}>{state.streak}</div>
          <div className="stat-label">Current Streak</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 16 }}>{multiplier}x</div>
          <div className="stat-label">XP Multiplier</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Data Backup</div>
        <p className="backup-note">
          Your progress is saved only in this browser. Export a backup file regularly so you never lose your XP, streaks &amp; PRs.
        </p>
        <div className="backup-btns">
          <button className="claim-btn" onClick={exportData}>EXPORT BACKUP</button>
          <button className="claim-btn ghost" onClick={() => fileRef.current?.click()}>IMPORT BACKUP</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: "none" }} />
        {backupMsg && <div className="backup-msg">{backupMsg}</div>}
      </div>
    </div>
  );
}

// ── Milestone Overlay ─────────────────────────────────────────────────────────

function MilestoneOverlay({ milestone, onDismiss }) {
  useEffect(() => {
    if (!milestone) return;
    const end = Date.now() + 2000;
    const frame = () => {
      confetti({ particleCount: 6, spread: 70, origin: { y: 0.6 }, colors: ["#7c3aed", "#a78bfa", "#ec4899", "#f97316"] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [milestone]);

  if (!milestone) return null;

  let title, sub;
  if (milestone.type === "levelup") {
    title = `LEVEL ${milestone.level}!`;
    sub = `You reached ${getLevelTitle(milestone.level)}. Keep grinding!`;
  } else if (milestone.type === "streak") {
    title = `${milestone.streak}-DAY STREAK!`;
    sub = `Incredible discipline. ${getStreakMultiplier(milestone.streak)}x XP multiplier unlocked!`;
  } else if (milestone.type === "pr") {
    title = "NEW PR!";
    sub = `${milestone.pr.name}: ${milestone.pr.weight}kg × ${milestone.pr.reps}. ${milestone.pr.kind === "weight" ? "Heaviest ever!" : "Best volume ever!"}`;
  } else {
    title = "BOSS DEFEATED!";
    sub = "You completed every task today. You are unstoppable.";
  }

  return (
    <div className="milestone-overlay" onClick={onDismiss}>
      <div className="milestone-card" onClick={(e) => e.stopPropagation()}>
        <div className="milestone-title">{title}</div>
        <div className="milestone-sub">{sub}</div>
        <button className="milestone-btn" onClick={onDismiss}>CONTINUE →</button>
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ state }) {
  const level = getLevel(state.totalXp);
  const xpInLevel = getXpInCurrentLevel(state.totalXp);
  const title = getLevelTitle(level);

  return (
    <div className="header">
      <div className="header-top">
        <div className="logo">LEVELUP</div>
        <div className="header-right">
          <div className="level-badge">LVL {level}</div>
          <div className="level-title">{title}</div>
        </div>
      </div>
      <div>
        <div className="xp-bar-label">
          <span className="xp-current">{xpInLevel} XP</span>
          <span>{XP_PER_LEVEL} XP to next level</span>
        </div>
        <XpBar current={xpInLevel} max={XP_PER_LEVEL} height={8} />
      </div>
      <div className="streak-badge">{state.streak} DAY STREAK</div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "today", label: "Today" },
  { id: "meals", label: "Meals" },
  { id: "gym", label: "Gym" },
  { id: "quests", label: "Quests" },
  { id: "stats", label: "Stats" },
  { id: "profile", label: "Profile" },
];

export default function App() {
  const [tab, setTab] = useState("today");
  const store = useGameStore();

  return (
    <div className="app">
      <Header state={store.state} />

      {tab === "today" && <TodayTab store={store} />}
      {tab === "meals" && <MealsTab store={store} />}
      {tab === "gym" && <GymTab store={store} />}
      {tab === "quests" && <QuestsTab store={store} />}
      {tab === "stats" && <StatsTab store={store} />}
      {tab === "profile" && <ProfileTab store={store} />}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="toast-container">
        {store.xpToasts.map((toast) => (
          <div key={toast.id} className="toast">{toast.text}</div>
        ))}
      </div>

      <MilestoneOverlay milestone={store.pendingMilestone} onDismiss={store.dismissMilestone} />
    </div>
  );
}
