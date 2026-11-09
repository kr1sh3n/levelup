import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import "./App.css";
import AuthGate from "./AuthGate";
import { useGameStore } from "./useGameStore";
import MealsTab from "./MealsTab";
import GymTab from "./GymTab";
import PixelIcon from "./PixelIcon";
import {
  getLevel,
  getXpInCurrentLevel,
  getLevelTitle,
  getStreakMultiplier,
  SKILL_COLORS,
  SKILL_LABELS,
  XP_PER_LEVEL,
  GOAL_XP,
  BOSS_XP,
} from "./gameData";
import { addDays } from "./storage";
import { THEMES, THEME_IDS, applyTheme, themeOf } from "./themes";

const SKILL_ORDER = ["fitness", "mind", "creator", "health"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(key) {
  if (!key) return "";
  const [, m, d] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

// "Due today" / "Overdue · Nov 3" / "Due Nov 20" relative to today.
function DeadlineBadge({ deadline, today, done }) {
  if (!deadline) return null;
  if (done) return <span className="deadline-badge muted">{fmtDate(deadline)}</span>;
  if (deadline < today) return <span className="deadline-badge overdue">Overdue · {fmtDate(deadline)}</span>;
  if (deadline === today) return <span className="deadline-badge today">Due today</span>;
  if (deadline === addDays(today, 1)) return <span className="deadline-badge">Due tomorrow</span>;
  return <span className="deadline-badge">Due {fmtDate(deadline)}</span>;
}

// Sort: incomplete first, then by deadline (none last), then oldest first.
function byDeadline(a, b) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  if (a.completed) return (b.completedAt || "").localeCompare(a.completedAt || "");
  if (a.deadline !== b.deadline) {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  }
  return a.createdAt - b.createdAt;
}

function confirmDelete(what) {
  return window.confirm(`Delete ${what}? This can't be undone.`);
}

// ── Shared ───────────────────────────────────────────────────────────────────

function XpBar({ current, max, color, glow, height = 6 }) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  return (
    <div className="xp-bar" style={{ height }}>
      <div
        className="xp-bar-fill"
        style={{
          width: `${pct}%`,
          background: color ? `linear-gradient(90deg, ${color}, ${color}cc)` : undefined,
          boxShadow: glow ? `0 0 8px ${glow}` : undefined,
        }}
      />
    </div>
  );
}

function SkillRows({ skillXp }) {
  return SKILL_ORDER.map((skill) => {
    const xp = skillXp[skill] || 0;
    const level = Math.floor(xp / 500) + 1;
    const { color, glow } = SKILL_COLORS[skill];
    return (
      <div key={skill} className="skill-row">
        <div className="skill-info">
          <div className="skill-name">
            <span style={{ color }}>{SKILL_LABELS[skill]}</span>
            <span className="skill-lvl">Lv {level}</span>
          </div>
          <XpBar current={xp % 500} max={500} color={color} glow={glow} height={6} />
        </div>
      </div>
    );
  });
}

function EmptyState({ title, children }) {
  return (
    <div className="card empty-state">
      <div className="empty-title">{title}</div>
      <div className="empty-desc">{children}</div>
    </div>
  );
}

// ── Today: goals ─────────────────────────────────────────────────────────────

const BLANK_GOAL = { title: "", description: "", deadline: "", skill: "" };

function GoalForm({ initial = BLANK_GOAL, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit(form);
  }

  return (
    <form className="card edit-form" onSubmit={submit}>
      <input className="meal-input" placeholder="Goal title *" value={form.title} onChange={set("title")} maxLength={80} autoFocus required />
      <textarea
        className="meal-input textarea"
        placeholder="Description (optional)"
        value={form.description}
        onChange={set("description")}
        maxLength={500}
        rows={2}
      />
      <div className="form-grid two">
        <label className="field">
          <span>Deadline</span>
          <input className="meal-input" type="date" value={form.deadline} onChange={set("deadline")} />
        </label>
        <label className="field">
          <span>Skill (XP goes to)</span>
          <select className="meal-input" value={form.skill} onChange={set("skill")}>
            <option value="">None</option>
            {SKILL_ORDER.map((s) => (
              <option key={s} value={s}>{SKILL_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="claim-btn">{submitLabel}</button>
        <button type="button" className="claim-btn ghost" onClick={onCancel}>CANCEL</button>
      </div>
    </form>
  );
}

function GoalItem({ goal, today, multiplier, store, editing, onEdit, onCancelEdit }) {
  if (editing) {
    return (
      <GoalForm
        initial={{ title: goal.title, description: goal.description, deadline: goal.deadline, skill: goal.skill }}
        submitLabel="SAVE GOAL"
        onSubmit={(f) => {
          store.updateGoal(goal.id, {
            title: f.title.trim(),
            description: f.description.trim(),
            deadline: f.deadline,
            skill: f.skill,
          });
          onCancelEdit();
        }}
        onCancel={onCancelEdit}
      />
    );
  }
  const accent = goal.skill ? SKILL_COLORS[goal.skill].color : "var(--purple)";
  const xp = Math.round(GOAL_XP * multiplier);
  return (
    <div className={`task-item goal-item ${goal.completed ? "done" : ""}`} style={{ "--accent": accent }}>
      <button
        type="button"
        className="task-check"
        onClick={() => store.toggleGoal(goal.id)}
        aria-label={goal.completed ? `Mark "${goal.title}" as not done` : `Complete "${goal.title}"`}
        title={goal.completed ? "Mark as not done" : "Mark complete"}
      >
        {goal.completed ? "✓" : ""}
      </button>
      <div className="task-info">
        <div className="task-label">{goal.title}</div>
        {goal.description && <div className="item-desc">{goal.description}</div>}
        <div className="item-meta">
          <DeadlineBadge deadline={goal.deadline} today={today} done={goal.completed} />
          {goal.skill && <span className="skill-chip" style={{ color: accent }}>{SKILL_LABELS[goal.skill]}</span>}
          {!goal.completed && !goal.xpAwarded && <span className="task-xp">+{xp} XP</span>}
        </div>
      </div>
      <div className="item-actions">
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Edit "${goal.title}"`} title="Edit">✎</button>
        <button
          type="button"
          className="del-btn small"
          onClick={() => confirmDelete(`"${goal.title}"`) && store.deleteGoal(goal.id)}
          aria-label={`Delete "${goal.title}"`}
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function WorkoutCard({ store, setTab }) {
  const { activeDay, activeLog, state } = store;
  let label = "No plan yet";
  let sub = "Create your workout plan in the Gym tab →";
  let done = false;
  if (state.workoutPlan.days.length) {
    if (!activeDay) {
      const anyScheduled = state.workoutPlan.days.some((d) => d.weekdays?.length);
      label = anyScheduled ? "Rest Day" : "Your choice";
      sub = "Pick any workout from your plan in Gym →";
    } else {
      const total = activeDay.exercises.length;
      const doneCount = activeDay.exercises.filter((e) => activeLog?.ex[e.id]?.done).length;
      done = !!activeLog?.completedAt;
      label = activeDay.name;
      sub = done
        ? "Workout complete ✓"
        : total
        ? `${doneCount}/${total} exercises · tap to train →`
        : "No exercises yet — add some in Gym →";
    }
  }
  return (
    <div
      className={`task-item lift-card ${done ? "done" : ""}`}
      style={{ "--accent": SKILL_COLORS.fitness.color }}
      onClick={() => setTab("gym")}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setTab("gym")}
    >
      <div className="task-info">
        <div className="task-label">Workout · {label}</div>
        <div className="task-xp">{sub}</div>
      </div>
      <div className="task-check">{done ? "✓" : ""}</div>
    </div>
  );
}

function TodayTab({ store, setTab }) {
  const { state, today, bossDayActive, bossClaimed, allDueDone, goalsDueToday, claimBossDay } = store;
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [view, setView] = useState("active");
  const multiplier = getStreakMultiplier(state.streak);

  const goals = [...state.goals].sort(byDeadline);
  const active = goals.filter((g) => !g.completed);
  const completed = goals.filter((g) => g.completed);
  const shown = view === "active" ? active : completed;

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
            It&apos;s Sunday! Complete all {goalsDueToday.length} goal{goalsDueToday.length === 1 ? "" : "s"} due today
            to claim the bonus.
          </div>
          <button className="claim-btn" disabled={!allDueDone || bossClaimed} onClick={claimBossDay}>
            {bossClaimed ? "✓ CLAIMED" : allDueDone ? `CLAIM +${BOSS_XP} XP` : "FINISH TODAY'S GOALS FIRST"}
          </button>
        </div>
      )}

      <div className="section-head px-head" style={{ color: SKILL_COLORS.fitness.color }}>
        {THEMES[themeOf(state.theme)].gymImage ? (
          <img
            className={`section-img ${THEMES[themeOf(state.theme)].pixelArt ? "pixel-art" : ""}`}
            src={THEMES[themeOf(state.theme)].gymImage}
            alt=""
          />
        ) : (
          <PixelIcon name="dumbbell" size={18} />
        )}
        Training
      </div>
      <WorkoutCard store={store} setTab={setTab} />

      <div className="section-head px-head head-with-action" style={{ color: "var(--purple-light)" }}>
        <PixelIcon name="star" size={16} />
        My Goals
      </div>

      {adding ? (
        <GoalForm
          submitLabel="ADD GOAL"
          onSubmit={(g) => {
            store.addGoal(g);
            setAdding(false);
            setView("active");
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button className="claim-btn add-btn" onClick={() => { setAdding(true); setEditingId(null); }}>
          + NEW GOAL
        </button>
      )}

      {goals.length > 0 && (
        <div className="slot-tabs list-tabs">
          <button className={`slot-tab ${view === "active" ? "active" : ""}`} onClick={() => setView("active")}>
            Active ({active.length})
          </button>
          <button className={`slot-tab ${view === "done" ? "active" : ""}`} onClick={() => setView("done")}>
            Completed ({completed.length})
          </button>
        </div>
      )}

      {goals.length === 0 && !adding && (
        <EmptyState title="No goals yet">
          Add your first personal goal — give it a deadline and a skill, and earn XP when you complete it.
        </EmptyState>
      )}
      {goals.length > 0 && shown.length === 0 && (
        <EmptyState title={view === "active" ? "All clear!" : "Nothing completed yet"}>
          {view === "active" ? "Every goal is done. Add a new one to keep levelling up." : "Tick a goal's box to complete it."}
        </EmptyState>
      )}

      {shown.map((g) => (
        <GoalItem
          key={g.id}
          goal={g}
          today={today}
          multiplier={multiplier}
          store={store}
          editing={editingId === g.id}
          onEdit={() => { setEditingId(g.id); setAdding(false); }}
          onCancelEdit={() => setEditingId(null)}
        />
      ))}
    </div>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────

function ActivityHeatmap({ activityLog, today }) {
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const key = addDays(today, -i);
    days.push({ key, xp: activityLog[key] || 0 });
  }
  const max = Math.max(...days.map((d) => d.xp), 1);
  const level = (xp) => (xp === 0 ? "" : xp / max < 0.25 ? "lvl1" : xp / max < 0.5 ? "lvl2" : xp / max < 0.75 ? "lvl3" : "lvl4");
  const [y, m, d] = days[0].key.split("-").map(Number);
  const firstDow = new Date(y, m - 1, d).getDay();

  return (
    <div className="activity-block">
      <div className="field-label">Activity — last 4 weeks</div>
      <div className="heatmap-labels">
        {["S", "M", "T", "W", "T", "F", "S"].map((l, i) => (
          <div key={i} className="heatmap-label">{l}</div>
        ))}
      </div>
      <div className="heatmap">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`p${i}`} className="heatmap-day pad" />
        ))}
        {days.map((day) => (
          <div key={day.key} className={`heatmap-day ${level(day.xp)}`} title={`${day.key}: ${day.xp} XP`} />
        ))}
      </div>
    </div>
  );
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SYNC_LABEL = {
  local: "Saved on this device",
  loading: "Loading your data…",
  saving: "Saving…",
  synced: "All changes synced",
  offline: "Offline — will sync when back online",
  error: "Sync failed — will retry",
};

function displayName(store) {
  return store.state.profileName || store.user?.email?.split("@")[0]?.toUpperCase() || "PLAYER 1";
}

function ProfileTab({ store }) {
  const { state, importData, cloud, user, syncStatus, signOut } = store;
  const level = getLevel(state.totalXp);
  const xpInLevel = getXpInCurrentLevel(state.totalXp);
  const multiplier = getStreakMultiplier(state.streak);
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  function flash(text, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  function exportData() {
    download(`pdash-backup-${store.today}.json`, JSON.stringify(state, null, 2), "application/json");
    flash("✓ Backup downloaded");
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!window.confirm("Importing will REPLACE all current progress with the backup. Continue?")) return;
        importData(parsed);
        flash("✓ Backup restored");
      } catch (err) {
        flash("✗ " + (err.message || "Couldn't read that file"), false);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="page">
      <div className="profile-avatar">{level}</div>
      {editingName ? (
        <form
          className="name-form"
          onSubmit={(e) => {
            e.preventDefault();
            store.setProfileName(nameDraft);
            setEditingName(false);
          }}
        >
          <input className="meal-input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={24} autoFocus placeholder="Player name" />
          <div className="form-actions">
            <button type="submit" className="claim-btn">SAVE</button>
            <button type="button" className="claim-btn ghost" onClick={() => setEditingName(false)}>CANCEL</button>
          </div>
        </form>
      ) : (
        <div className="profile-name">
          {displayName(store)}{" "}
          <button
            className="icon-btn inline"
            onClick={() => { setNameDraft(state.profileName || displayName(store)); setEditingName(true); }}
            aria-label="Edit player name"
            title="Edit name"
          >
            ✎
          </button>
        </div>
      )}
      <div className="profile-title">PLAYER 1 · LVL {level} · {getLevelTitle(level)}</div>

      {cloud && (
        <div className="card">
          <div className="card-title">Account</div>
          <div className="account-row">
            <div>
              <div className="reminder-name">{user.email}</div>
              <div className={`reminder-desc sync-${syncStatus}`}>{SYNC_LABEL[syncStatus]}</div>
            </div>
            <button className="claim-btn ghost small-btn" onClick={signOut}>SIGN OUT</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Theme</div>
        <div className="theme-grid" role="radiogroup" aria-label="App theme">
          {THEME_IDS.map((id) => {
            const t = THEMES[id];
            const active = themeOf(state.theme) === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`theme-option ${active ? "active" : ""}`}
                onClick={() => store.setTheme(id)}
              >
                <span className="theme-swatch" style={{ background: t.swatch, color: t.iconColor }}>
                  {t.swatchImage ? (
                    <img className="swatch-img" src={t.swatchImage} alt="" />
                  ) : !t.logoImage && t.icon && (
                    <span className="swatch-icon">
                      <PixelIcon name={t.icon} size={t.icon === "bat" ? 34 : 26} />
                    </span>
                  )}
                </span>
                <span className="theme-name">{t.label}</span>
                <span className="theme-check">{active ? "ACTIVE" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Progress to Next Level</div>
        <div className="xp-bar-label">
          <span className="xp-current">{xpInLevel} XP</span>
          <span>{XP_PER_LEVEL} XP</span>
        </div>
        <XpBar current={xpInLevel} max={XP_PER_LEVEL} height={10} />
      </div>

      <div className="card">
        <div className="card-title">Skill Trees</div>
        <SkillRows skillXp={state.skillXp} />
      </div>

      <div className="card">
        <div className="card-title">Stats</div>
        <div className="mini-stats">
          {[
            { label: "Streak", value: state.streak, accent: true },
            { label: "Multiplier", value: `${multiplier}x` },
            { label: "Best Streak", value: state.longestStreak },
            { label: "Total XP", value: state.totalXp.toLocaleString() },
            { label: "Goals Done", value: state.goals.filter((g) => g.completed).length },
            { label: "Workouts", value: Object.values(state.workoutLogs).filter((l) => l.completedAt).length },
          ].map((s) => (
            <div key={s.label} className="mini-stat">
              <div className={`mini-stat-value ${s.accent ? "accent" : ""}`}>{s.value}</div>
              <div className="mini-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
        <ActivityHeatmap activityLog={state.activityLog} today={store.today} />
      </div>

      <div className="card backup-card">
        <div className="backup-row">
          <div className="backup-info">
            <div className="backup-title">Backup</div>
            <div className="backup-sub">{cloud ? "Synced to your account" : "Saved on this device only"}</div>
          </div>
          <button className="mini-btn" onClick={exportData}>Export</button>
          <button className="mini-btn ghost" onClick={() => fileRef.current?.click()}>Import</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: "none" }} />
      </div>

      {msg && <div className={`form-msg floating ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
    </div>
  );
}

// ── Milestone overlay ────────────────────────────────────────────────────────

function MilestoneOverlay({ milestone, onDismiss, colors }) {
  useEffect(() => {
    if (!milestone) return;
    const end = Date.now() + 2000;
    let raf;
    const frame = () => {
      confetti({ particleCount: 6, spread: 70, origin: { y: 0.6 }, colors });
      if (Date.now() < end) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [milestone, colors]);

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
    sub = "You completed every goal due today. You are unstoppable.";
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

// ── Header ───────────────────────────────────────────────────────────────────

function Header({ store }) {
  const { state, cloud, syncStatus } = store;
  const level = getLevel(state.totalXp);
  const xpInLevel = getXpInCurrentLevel(state.totalXp);
  const { icon: themeIcon, logoImage } = THEMES[themeOf(state.theme)];

  return (
    <div className="header">
      <div className="header-top">
        <div className="logo-row">
          {logoImage ? (
            <img className="logo-img" src={logoImage} alt="" />
          ) : themeIcon && (
            <span className="logo-icon">
              <PixelIcon name={themeIcon} size={themeIcon === "bat" ? 30 : 24} />
            </span>
          )}
          <div className="logo">PDASH</div>
        </div>
        <div className="header-right">
          <div className="level-badge">LVL {level}</div>
          <div className="level-title">{getLevelTitle(level)}</div>
        </div>
      </div>
      <div>
        <div className="xp-bar-label">
          <span className="xp-current">{xpInLevel} XP</span>
          <span>{XP_PER_LEVEL} XP to next level</span>
        </div>
        <XpBar current={xpInLevel} max={XP_PER_LEVEL} height={8} />
      </div>
      <div className="header-bottom">
        <div className="streak-badge px-streak"><PixelIcon name="flame" size={14} />{state.streak} DAY STREAK</div>
        {cloud && (
          <div className={`sync-pill sync-${syncStatus}`} title={SYNC_LABEL[syncStatus]}>
            <span className="sync-dot" />
            {syncStatus === "synced" ? "SYNCED" : syncStatus === "saving" ? "SAVING" : syncStatus === "loading" ? "LOADING" : syncStatus === "offline" ? "OFFLINE" : "RETRY"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "today", label: "Today" },
  { id: "meals", label: "Meals" },
  { id: "gym", label: "Gym" },
  { id: "profile", label: "Profile" },
];

function Dashboard({ user }) {
  const [tab, setTab] = useState("today");
  const store = useGameStore(user);
  const theme = themeOf(store.state.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="app">
      <Header store={store} />

      {tab === "today" && <TodayTab store={store} setTab={setTab} />}
      {tab === "meals" && <MealsTab store={store} />}
      {tab === "gym" && <GymTab store={store} />}
      {tab === "profile" && <ProfileTab store={store} />}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="toast-container">
        {store.xpToasts.map((toast) => (
          <div key={toast.id} className="toast">{toast.text}</div>
        ))}
      </div>

      <MilestoneOverlay milestone={store.pendingMilestone} onDismiss={store.dismissMilestone} colors={THEMES[theme].confetti} />
    </div>
  );
}

export default function App() {
  // Keyed by user so signing in as someone else mounts a fresh, isolated store.
  return <AuthGate>{(user) => <Dashboard key={user?.id || "local"} user={user} />}</AuthGate>;
}
