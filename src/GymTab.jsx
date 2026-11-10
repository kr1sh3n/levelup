import { useState, useEffect, useRef } from "react";
import { WEEKDAY_SHORT, LIFT_XP, getStreakMultiplier } from "./gameData";
import { THEMES, themeOf } from "./themes";

// ── Rest timer ────────────────────────────────────────────────────────────────
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* audio not available — silent fallback */
  }
}

const PRESETS = [60, 90, 120, 180];

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// `signal` changes ({ n, sec }) each time a set is logged → auto-start with that exercise's rest.
function RestTimer({ signal }) {
  const [duration, setDuration] = useState(90);
  const [timeLeft, setTimeLeft] = useState(90);
  const [running, setRunning] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const durationRef = useRef(duration);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (!signal.n) return;
    const sec = signal.sec > 0 ? signal.sec : durationRef.current;
    const t = setTimeout(() => {
      setDuration(sec);
      setTimeLeft(sec);
      setJustDone(false);
      setRunning(true);
    }, 0);
    return () => clearTimeout(t);
  }, [signal]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setRunning(false);
          setJustDone(true);
          try { navigator.vibrate?.(200); } catch { /* no-op */ }
          beep();
          setTimeout(() => setJustDone(false), 2500);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  function pickPreset(sec) {
    setDuration(sec);
    setTimeLeft(sec);
    setRunning(false);
    setJustDone(false);
  }
  function toggle() {
    if (timeLeft === 0) { setTimeLeft(duration); setJustDone(false); setRunning(true); }
    else setRunning((r) => !r);
  }
  function reset() { setRunning(false); setTimeLeft(duration); setJustDone(false); }

  return (
    <div className={`card rest-timer ${running ? "ticking" : ""} ${justDone ? "done" : ""}`}>
      <div className="card-title">Rest Timer</div>
      <div className="rest-display">{justDone ? "DONE!" : fmt(timeLeft)}</div>
      <div className="rest-presets">
        {PRESETS.map((p) => (
          <button key={p} className={`rest-preset ${duration === p ? "active" : ""}`} onClick={() => pickPreset(p)}>
            {fmt(p)}
          </button>
        ))}
      </div>
      <div className="rest-controls">
        <button className="rest-btn primary" onClick={toggle}>
          {running ? "PAUSE" : timeLeft === 0 ? "RESTART" : "START"}
        </button>
        <button className="rest-btn" onClick={reset}>RESET</button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function targetLine(ex) {
  const parts = [`${ex.sets} sets`];
  if (ex.reps) parts.push(`${ex.reps} reps`);
  if (ex.targetWeight !== "" && ex.targetWeight != null) parts.push(`${ex.targetWeight} kg`);
  if (ex.restSec) parts.push(`rest ${fmt(ex.restSec)}`);
  return parts.join(" · ");
}

function weekdaysLabel(weekdays) {
  if (!weekdays?.length) return "Not scheduled";
  if (weekdays.length === 7) return "Every day";
  return [...weekdays].sort().map((d) => WEEKDAY_SHORT[d]).join(", ");
}

const fmtShortDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

// ── Today's session ──────────────────────────────────────────────────────────
function SetRow({ set, index, onDelete, locked }) {
  return (
    <div className="set-row">
      <span className="set-num">Set {index + 1}</span>
      <span className="set-vol">{set.weight} kg × {set.reps}</span>
      {set.rir != null && <span className="rir-tag">RIR {set.rir}</span>}
      {set.pr && <span className="pr-tag">PR</span>}
      {set.warmup && <span className="pr-tag warm-tag">WARM-UP</span>}
      {!locked && (
        <button className="del-btn small" onClick={onDelete} aria-label={`Delete set ${index + 1}`}>×</button>
      )}
    </div>
  );
}

function ExerciseLogCard({ ex, day, log, store, onSetAdded }) {
  const { addSet, deleteSet, toggleExerciseDone, lastSessionFor } = store;
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [warmup, setWarmup] = useState(false);
  const [rir, setRir] = useState("");
  const locked = !!log?.completedAt;
  const exLog = log?.ex[ex.id] || { sets: [], done: false };
  const last = lastSessionFor(ex.id);

  function submit(e) {
    e.preventDefault();
    if (!reps || Number(reps) <= 0) return;
    addSet(day.id, ex, weight, reps, { warmup, rir });
    setReps("");
    setWarmup(false);
    setRir("");
    onSetAdded(warmup ? 0 : ex.restSec);
  }

  return (
    <div className={`exercise-card ${exLog.done ? "done" : ""}`}>
      <div className="exercise-head">
        <div className="exercise-headinfo">
          <div className="exercise-name">{ex.name}</div>
          <div className="exercise-target">{targetLine(ex)}</div>
          {ex.notes && <div className="exercise-cue">{ex.notes}</div>}
        </div>
        <button
          className={`done-check ${exLog.done ? "on" : ""}`}
          onClick={() => toggleExerciseDone(day.id, ex.id)}
          disabled={locked}
          aria-label={exLog.done ? `Unmark ${ex.name}` : `Mark ${ex.name} done`}
          title="Mark exercise done"
        >
          {exLog.done ? "✓" : ""}
        </button>
      </div>

      <div className="exercise-last">
        {last ? `Last: ${last.weight}kg × ${last.reps} (${last.sets} ${last.sets === 1 ? "set" : "sets"})` : "No history yet — set a baseline!"}
      </div>

      {exLog.sets.map((s, i) => (
        <SetRow key={i} set={s} index={i} locked={locked} onDelete={() => deleteSet(day.id, ex.id, i)} />
      ))}

      {!locked && (
        <form className="set-form" onSubmit={submit}>
          <input
            className="meal-input small"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            placeholder={ex.targetWeight !== "" && ex.targetWeight != null ? `${ex.targetWeight} kg` : "kg"}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            aria-label={`${ex.name} weight in kg`}
          />
          <span className="set-x">×</span>
          <input
            className="meal-input small"
            type="number"
            inputMode="numeric"
            min="1"
            placeholder="reps"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            aria-label={`${ex.name} reps`}
          />
          {!warmup && (
            <select
              className="rir-select"
              value={rir}
              onChange={(e) => setRir(e.target.value)}
              aria-label={`${ex.name} reps in reserve`}
              title="Reps in reserve: how many more reps you could have done"
            >
              <option value="">RIR</option>
              <option value="0">0 — failure</option>
              <option value="1">1 left</option>
              <option value="2">2 left</option>
              <option value="3">3 left</option>
              <option value="4">4 left</option>
              <option value="5">5+ left</option>
            </select>
          )}
          <button
            type="button"
            className={`warmup-toggle ${warmup ? "on" : ""}`}
            onClick={() => setWarmup(!warmup)}
            aria-pressed={warmup}
            title="Warm-up sets are saved but don't count towards your muscle map"
          >
            W
          </button>
          <button type="submit" className="add-set-btn">+ SET</button>
        </form>
      )}
    </div>
  );
}

function SessionCard({ store }) {
  const { state, activeDay, activeLog, scheduledDay, selectWorkoutDay, finishWorkout, reopenWorkout } = store;
  const days = state.workoutPlan.days;
  const done = !!activeLog?.completedAt;
  const total = activeDay?.exercises.length || 0;
  const doneCount = activeDay ? activeDay.exercises.filter((e) => activeLog?.ex[e.id]?.done).length : 0;
  const setCount = activeLog ? Object.values(activeLog.ex).reduce((n, e) => n + e.sets.length, 0) : 0;
  const hasProgress = setCount > 0 || doneCount > 0;
  const xp = Math.round(LIFT_XP * getStreakMultiplier(state.streak));
  const earnedToday = state.workoutXpDates.includes(store.today);

  function changeDay(e) {
    const id = e.target.value || null;
    if (hasProgress && !window.confirm("Switching workouts clears the sets you've logged today. Continue?")) return;
    selectWorkoutDay(id);
  }

  const { gymImage, pixelArt } = THEMES[themeOf(state.theme)];

  return (
    <div className={`card ${gymImage ? "session-with-art" : ""}`}>
      {gymImage && <img className={`session-art ${pixelArt ? "pixel-art wide" : ""}`} src={gymImage} alt="" />}
      <div className="card-title">Today&apos;s Session</div>
      <div className="workout-type">
        {activeDay ? activeDay.name : days.some((d) => d.weekdays?.length) ? "Rest Day" : "Pick a Workout"}
      </div>
      {scheduledDay && activeDay?.id !== scheduledDay.id && (
        <div className="exercise-last">Scheduled today: {scheduledDay.name}</div>
      )}
      {activeDay && total > 0 && (
        <div className={`lift-progress-text ${done ? "complete" : ""}`}>
          {done ? `✓ Workout complete — ${setCount} sets logged` : `${doneCount} / ${total} exercises done · ${setCount} sets`}
        </div>
      )}

      {!done && (
        <label className="field session-picker">
          <span>Train today</span>
          <select className="meal-input" value={activeDay?.id || ""} onChange={changeDay}>
            <option value="">No workout today</option>
            {days.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      )}

      {activeDay && total > 0 && !done && (
        <button className="claim-btn" disabled={!hasProgress} onClick={() => finishWorkout(activeDay.id)}>
          {hasProgress ? (earnedToday ? "FINISH WORKOUT" : `FINISH WORKOUT (+${xp} XP)`) : "LOG A SET TO FINISH"}
        </button>
      )}
      {done && (
        <button className="claim-btn ghost" onClick={reopenWorkout}>REOPEN TO EDIT</button>
      )}
    </div>
  );
}

// ── Plan builder ─────────────────────────────────────────────────────────────
const BLANK_EX = { name: "", sets: 3, reps: "8-12", targetWeight: "", restSec: 90, notes: "" };

function ExerciseForm({ initial = BLANK_EX, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  }

  return (
    <form className="builder-form edit-form inset" onSubmit={submit}>
      <input className="meal-input" placeholder="Exercise name *" value={form.name} onChange={set("name")} maxLength={60} autoFocus required />
      <div className="form-grid four">
        <label className="field">
          <span>Sets</span>
          <input className="meal-input" type="number" inputMode="numeric" min="1" max="20" value={form.sets} onChange={set("sets")} />
        </label>
        <label className="field">
          <span>Reps</span>
          <input className="meal-input" placeholder="8-12" value={form.reps} onChange={set("reps")} maxLength={12} />
        </label>
        <label className="field">
          <span>Target kg</span>
          <input className="meal-input" type="number" inputMode="decimal" min="0" step="0.5" placeholder="—" value={form.targetWeight} onChange={set("targetWeight")} />
        </label>
        <label className="field">
          <span>Rest (s)</span>
          <input className="meal-input" type="number" inputMode="numeric" min="0" max="900" step="15" value={form.restSec} onChange={set("restSec")} />
        </label>
      </div>
      <input className="meal-input" placeholder="Notes (form cues, tempo, machine settings…)" value={form.notes} onChange={set("notes")} maxLength={200} />
      <div className="form-actions">
        <button type="submit" className="claim-btn">{submitLabel}</button>
        <button type="button" className="claim-btn ghost" onClick={onCancel}>CANCEL</button>
      </div>
    </form>
  );
}

function DayEditor({ day, store, onClose }) {
  const { updateDay, addExercise, updateExercise, deleteExercise, moveExercise } = store;
  const [name, setName] = useState(day.name);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const otherDays = store.state.workoutPlan.days.filter((d) => d.id !== day.id);

  function toggleWeekday(i) {
    const has = day.weekdays.includes(i);
    updateDay(day.id, { weekdays: has ? day.weekdays.filter((d) => d !== i) : [...day.weekdays, i].sort() });
  }

  return (
    <div className="day-editor">
      <form
        className="rename-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) updateDay(day.id, { name: name.trim() });
        }}
      >
        <input className="meal-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Workout day name" />
        <button type="submit" className="add-set-btn" disabled={!name.trim() || name.trim() === day.name}>RENAME</button>
      </form>

      <div className="day1-label">Scheduled on (optional — leave empty to train it whenever you like)</div>
      <div className="day1-btns">
        {WEEKDAY_SHORT.map((d, i) => {
          const clash = otherDays.find((o) => o.weekdays.includes(i));
          return (
            <button
              key={i}
              type="button"
              className={`day1-btn ${day.weekdays.includes(i) ? "active" : ""}`}
              onClick={() => toggleWeekday(i)}
              title={clash ? `Also scheduled: ${clash.name}` : undefined}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div className="day1-label">Exercises</div>
      {day.exercises.length === 0 && !adding && <div className="builder-empty">No exercises yet — add your first one.</div>}
      {day.exercises.map((ex, idx) =>
        editingId === ex.id ? (
          <ExerciseForm
            key={ex.id}
            initial={{ ...ex, targetWeight: ex.targetWeight ?? "" }}
            submitLabel="SAVE EXERCISE"
            onSubmit={(f) => { updateExercise(day.id, ex.id, f); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={ex.id} className="builder-row">
            <div className="builder-arrows">
              <button onClick={() => moveExercise(day.id, ex.id, -1)} disabled={idx === 0} aria-label={`Move ${ex.name} up`}>▲</button>
              <button onClick={() => moveExercise(day.id, ex.id, 1)} disabled={idx === day.exercises.length - 1} aria-label={`Move ${ex.name} down`}>▼</button>
            </div>
            <div className="builder-main">
              <div className="builder-name">{ex.name}</div>
              <div className="builder-meta">{targetLine(ex)}</div>
              {ex.notes && <div className="builder-meta notes">{ex.notes}</div>}
            </div>
            <button className="icon-btn" onClick={() => { setEditingId(ex.id); setAdding(false); }} aria-label={`Edit ${ex.name}`} title="Edit">✎</button>
            <button
              className="del-btn small"
              onClick={() => window.confirm(`Delete "${ex.name}"?`) && deleteExercise(day.id, ex.id)}
              aria-label={`Delete ${ex.name}`}
              title="Delete"
            >
              ×
            </button>
          </div>
        )
      )}

      {adding ? (
        <ExerciseForm
          submitLabel="ADD EXERCISE"
          onSubmit={(f) => { addExercise(day.id, f); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button className="claim-btn ghost" onClick={() => { setAdding(true); setEditingId(null); }}>+ ADD EXERCISE</button>
      )}
      <button className="link-btn done-link" onClick={onClose}>Done editing {day.name}</button>
    </div>
  );
}

function PlanBuilder({ store }) {
  const { state, addDay, deleteDay, moveDay, clearPlan } = store;
  const days = state.workoutPlan.days;
  const [openId, setOpenId] = useState(null);
  const [newDay, setNewDay] = useState("");

  function add(name) {
    if (!name.trim()) return;
    addDay(name);
    setNewDay("");
  }

  return (
    <div className="card">
      <div className="card-title">My Workout Plan</div>
      {days.length === 0 && (
        <div className="builder-empty">
          Your plan, your rules. Add as many workout days as you like, name them anything, fill them with
          your own exercises, and optionally pin them to weekdays — or just pick one whenever you train.
        </div>
      )}

      {days.map((day, idx) => (
        <div key={day.id} className={`day-block ${openId === day.id ? "open" : ""}`}>
          <div className="builder-row">
            <div className="builder-arrows">
              <button onClick={() => moveDay(day.id, -1)} disabled={idx === 0} aria-label={`Move ${day.name} up`}>▲</button>
              <button onClick={() => moveDay(day.id, 1)} disabled={idx === days.length - 1} aria-label={`Move ${day.name} down`}>▼</button>
            </div>
            <button className="builder-main as-button" onClick={() => setOpenId(openId === day.id ? null : day.id)}>
              <div className="builder-name">{day.name}</div>
              <div className="builder-meta">
                {day.exercises.length} exercise{day.exercises.length === 1 ? "" : "s"} · {weekdaysLabel(day.weekdays)}
              </div>
            </button>
            <button className="icon-btn" onClick={() => setOpenId(openId === day.id ? null : day.id)} aria-label={`Edit ${day.name}`} title="Edit">
              {openId === day.id ? "▾" : "✎"}
            </button>
            <button
              className="del-btn small"
              onClick={() =>
                window.confirm(`Delete "${day.name}" and its ${day.exercises.length} exercises? Past workout history is kept.`) &&
                deleteDay(day.id)
              }
              aria-label={`Delete ${day.name}`}
              title="Delete"
            >
              ×
            </button>
          </div>
          {openId === day.id && <DayEditor day={day} store={store} onClose={() => setOpenId(null)} />}
        </div>
      ))}

      <form className="rename-row" onSubmit={(e) => { e.preventDefault(); add(newDay); }}>
        <input
          className="meal-input"
          placeholder={days.length ? "Add another workout day" : "Name your first workout day"}
          value={newDay}
          onChange={(e) => setNewDay(e.target.value)}
          maxLength={40}
          aria-label="New workout day name"
        />
        <button type="submit" className="add-set-btn" disabled={!newDay.trim()}>+ DAY</button>
      </form>
      {days.length > 0 && (
        <button
          className="link-btn done-link"
          onClick={() =>
            window.confirm(
              `Clear your whole plan (${days.length} workout day${days.length === 1 ? "" : "s"}) and start from scratch? Workout history and PRs are kept.`
            ) && clearPlan()
          }
        >
          Clear plan &amp; start from scratch
        </button>
      )}
    </div>
  );
}

function WorkoutHistory({ state }) {
  const entries = Object.entries(state.workoutLogs)
    .filter(([, l]) => l.completedAt)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 10);
  if (!entries.length) return null;
  return (
    <div className="card">
      <div className="card-title">Workout History</div>
      {entries.map(([date, l]) => {
        const sets = Object.values(l.ex).flatMap((e) => e.sets);
        const volume = sets.reduce((v, s) => v + s.weight * s.reps, 0);
        return (
          <div key={date} className="pr-record">
            <span className="pr-record-name">
              {l.dayName}
              <span className="history-date"> · {fmtShortDate(date)}</span>
            </span>
            <span className="history-meta">{sets.length} sets · {Math.round(volume).toLocaleString()} kg</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Gym tab ───────────────────────────────────────────────────────────────────
export default function GymTab({ store }) {
  const { state, activeDay, activeLog } = store;
  const [restSignal, setRestSignal] = useState({ n: 0, sec: 0 });
  const prList = Object.values(state.prs).sort((a, b) => b.maxWeight - a.maxWeight);

  return (
    <div className="page">
      {state.workoutPlan.days.length > 0 && <SessionCard store={store} />}

      {activeDay && activeDay.exercises.length === 0 && (
        <div className="card builder-empty big">
          <strong>{activeDay.name}</strong> has no exercises yet. Add some in the plan below.
        </div>
      )}

      {activeDay && activeDay.exercises.length > 0 && (
        <>
          {!activeLog?.completedAt && <RestTimer signal={restSignal} />}
          {activeDay.exercises.map((ex) => (
            <ExerciseLogCard
              key={ex.id}
              ex={ex}
              day={activeDay}
              log={activeLog}
              store={store}
              onSetAdded={(sec) => setRestSignal((s) => ({ n: s.n + 1, sec }))}
            />
          ))}
        </>
      )}

      <PlanBuilder store={store} />
      <WorkoutHistory state={state} />

      {prList.length > 0 && (
        <div className="card">
          <div className="card-title">Personal Records</div>
          {prList.map((p) => (
            <div key={p.name} className="pr-record">
              <span className="pr-record-name">{p.name}</span>
              <span className="pr-record-val">{p.maxWeight} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
