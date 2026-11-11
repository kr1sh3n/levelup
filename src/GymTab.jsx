import { useState, useEffect, useRef } from "react";
import { WEEKDAY_SHORT, LIFT_XP, getStreakMultiplier } from "./gameData";
import { THEMES, themeOf } from "./themes";
import { LIBRARY } from "./muscles/exercises";
import { DEFAULT_REPS, DEFAULT_REST, REST_OPTIONS, TEMPLATES, restLabel } from "./templates";

// Offered as suggestions while typing an exercise name. Picking one of these
// also means the muscle map knows which muscles it works.
const LIBRARY_NAMES = [...new Set(LIBRARY.map((e) => e.name))].sort((a, b) => a.localeCompare(b));

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

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Rest lengths for a select: the standard 2-5 minutes, plus whatever an older
// exercise was saved with so it is not silently changed.
function restChoices(current) {
  const n = Number(current);
  return REST_OPTIONS.includes(n) || !n ? REST_OPTIONS : [...REST_OPTIONS, n].sort((a, b) => a - b);
}

// `signal` changes ({ n, sec }) each time a set is logged → auto-start with that exercise's rest.
function RestTimer({ signal }) {
  const [duration, setDuration] = useState(DEFAULT_REST);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_REST);
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

  function pickLength(sec) {
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

  // One compact row: the timer used to fill the screen above the exercises.
  return (
    <div className={`card rest-timer compact ${running ? "ticking" : ""} ${justDone ? "done" : ""}`}>
      <div className="rest-row">
        <div className="rest-label">Rest</div>
        <div className="rest-display">{justDone ? "DONE!" : fmt(timeLeft)}</div>
        <select className="meal-input rest-select" value={duration} onChange={(e) => pickLength(Number(e.target.value))} aria-label="Rest length">
          {restChoices(duration).map((p) => (
            <option key={p} value={p}>{restLabel(p)}</option>
          ))}
        </select>
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
  if (ex.restSec) parts.push(`rest ${restLabel(ex.restSec)}`);
  return parts.join(" · ");
}

function weekdaysLabel(weekdays) {
  if (!weekdays?.length) return "Any day";
  if (weekdays.length === 7) return "Every day";
  return [...weekdays].sort().map((d) => WEEKDAY_SHORT[d]).join(", ");
}

const fmtShortDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

const weightText = (w) => (Number(w) > 0 ? `${w} kg` : "Bodyweight");

// ── Today's session ──────────────────────────────────────────────────────────
function SetRow({ set, index, onDelete, locked }) {
  return (
    <div className="set-row">
      <span className="set-num">Set {index + 1}</span>
      <span className="set-vol">{weightText(set.weight)} × {set.reps}</span>
      {set.rir != null && <span className="rir-tag">RIR {set.rir}</span>}
      {set.pr && <span className="pr-tag">PR</span>}
      {!locked && (
        <button className="del-btn small" onClick={onDelete} aria-label={`Delete set ${index + 1}`}>×</button>
      )}
    </div>
  );
}

function ExerciseLogCard({ ex, day, log, store, onSetAdded }) {
  const { addSet, deleteSet, toggleExerciseDone, lastSessionFor } = store;
  // Everything is typed by hand: nothing is prefilled from earlier sets.
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [err, setErr] = useState(null);
  const locked = !!log?.completedAt;
  const exLog = log?.ex[ex.id] || { sets: [], done: false };
  const last = lastSessionFor(ex.id);

  function submit(e) {
    e.preventDefault();
    const w = weight.trim().replace(",", ".");
    // A blank weight used to be saved as 0 kg. Ask instead (0 = bodyweight).
    if (w === "" || Number.isNaN(Number(w)) || Number(w) < 0) {
      setErr("Enter the weight you lifted (0 for bodyweight).");
      return;
    }
    if (!reps || !(Number(reps) > 0)) {
      setErr("Enter how many reps you did.");
      return;
    }
    setErr(null);
    addSet(day.id, ex, w, reps, { rir });
    setWeight("");
    setReps("");
    setRir("");
    onSetAdded(ex.restSec);
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
          type="button"
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
        {last ? `Last time: ${weightText(last.weight)} × ${last.reps} (${last.sets} ${last.sets === 1 ? "set" : "sets"})` : "No history yet"}
      </div>

      {exLog.sets.map((s, i) => (
        <SetRow key={i} set={s} index={i} locked={locked} onDelete={() => deleteSet(day.id, ex.id, i)} />
      ))}

      {!locked && (
        <>
          <form className="set-form" onSubmit={submit} noValidate>
            <input
              className="meal-input small"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="kg"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              aria-label={`${ex.name} weight in kg`}
            />
            <span className="set-x">×</span>
            <input
              className="meal-input small"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="reps"
              value={reps}
              onChange={(e) => setReps(e.target.value.replace(/[^0-9]/g, ""))}
              aria-label={`${ex.name} reps`}
            />
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
            <button type="submit" className="add-set-btn">+ SET</button>
          </form>
          {err && <div className="form-msg err">{err}</div>}
        </>
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

  function pick(id) {
    selectWorkoutDay(id);
  }

  const { gymImage, pixelArt } = THEMES[themeOf(state.theme)];

  // Nothing started yet: one big button per workout, instead of a dropdown
  // labelled "No workout today" that nobody recognised as the way in.
  if (!activeDay) {
    const ordered = scheduledDay ? [scheduledDay, ...days.filter((d) => d.id !== scheduledDay.id)] : days;
    return (
      <div className={`card ${gymImage ? "session-with-art" : ""}`}>
        {gymImage && <img className={`session-art ${pixelArt ? "pixel-art wide" : ""}`} src={gymImage} alt="" />}
        <div className="card-title">Today&apos;s Session</div>
        <div className="workout-type">Start a workout</div>
        <div className="start-list">
          {ordered.map((d) => (
            <button key={d.id} type="button" className="start-day-btn" onClick={() => pick(d.id)}>
              <span className="start-day-name">{d.name}</span>
              <span className="start-day-meta">
                {d.exercises.length} exercise{d.exercises.length === 1 ? "" : "s"}
                {scheduledDay?.id === d.id ? " · scheduled today" : ""}
              </span>
              <span className="start-day-go">START ▶</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${gymImage ? "session-with-art" : ""}`}>
      {gymImage && <img className={`session-art ${pixelArt ? "pixel-art wide" : ""}`} src={gymImage} alt="" />}
      <div className="card-title">Today&apos;s Session</div>
      <div className="workout-type">{activeDay.name}</div>
      {total > 0 && (
        <div className={`lift-progress-text ${done ? "complete" : ""}`}>
          {done ? `✓ Workout complete — ${setCount} ${setCount === 1 ? "set" : "sets"} logged` : `${doneCount} / ${total} exercises done · ${setCount} ${setCount === 1 ? "set" : "sets"}`}
        </div>
      )}

      {total > 0 && !done && (
        <button className="claim-btn" disabled={!hasProgress} onClick={() => finishWorkout(activeDay.id)}>
          {hasProgress ? (earnedToday ? "FINISH WORKOUT" : `FINISH WORKOUT (+${xp} XP)`) : "LOG A SET TO FINISH"}
        </button>
      )}
      {done && <button className="claim-btn ghost" onClick={reopenWorkout}>REOPEN TO EDIT</button>}
      {/* Tapped the wrong one? Until the first set is logged, the other
          workouts stay one tap away. After that the list goes away. */}
      {!done && !hasProgress && days.length > 1 && (
        <div className="start-other">
          <span>Wrong workout?</span>
          {days.filter((d) => d.id !== activeDay.id).map((d) => (
            <button key={d.id} type="button" className="mini-btn" onClick={() => pick(d.id)}>
              {d.name} ▶
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Plan builder ─────────────────────────────────────────────────────────────
const BLANK_EX = { name: "", sets: 3, reps: DEFAULT_REPS, restSec: DEFAULT_REST, notes: "" };

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
      <input
        className="meal-input"
        list="exercise-library"
        placeholder="Exercise — start typing, e.g. Bench Press"
        value={form.name}
        onChange={set("name")}
        maxLength={60}
        autoFocus
        required
      />
      <div className="form-grid three">
        <label className="field">
          <span>Sets</span>
          <input className="meal-input" type="number" inputMode="numeric" min="1" max="20" value={form.sets} onChange={set("sets")} />
        </label>
        <label className="field">
          <span>Reps</span>
          <input className="meal-input" placeholder={DEFAULT_REPS} value={form.reps} onChange={set("reps")} maxLength={12} />
        </label>
        <label className="field">
          <span>Rest</span>
          <select className="meal-input" value={form.restSec} onChange={(e) => setForm({ ...form, restSec: Number(e.target.value) })}>
            {restChoices(form.restSec).map((s) => (
              <option key={s} value={s}>{restLabel(s)}</option>
            ))}
          </select>
        </label>
      </div>
      <input className="meal-input" placeholder="Notes (optional)" value={form.notes} onChange={set("notes")} maxLength={200} />
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
  const [adding, setAdding] = useState(day.exercises.length === 0);
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
        <input className="meal-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Workout name" />
        <button type="submit" className="add-set-btn" disabled={!name.trim() || name.trim() === day.name}>RENAME</button>
      </form>

      <div className="day1-label">Exercises</div>
      {day.exercises.map((ex, idx) =>
        editingId === ex.id ? (
          <ExerciseForm
            key={ex.id}
            initial={{ ...ex, restSec: ex.restSec || DEFAULT_REST }}
            submitLabel="SAVE"
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
            <button className="mini-btn" onClick={() => { setEditingId(ex.id); setAdding(false); }} aria-label={`Edit ${ex.name}`}>EDIT</button>
            <button
              className="del-btn small"
              onClick={() => window.confirm(`Remove "${ex.name}" from this workout?`) && deleteExercise(day.id, ex.id)}
              aria-label={`Remove ${ex.name}`}
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

      <div className="day1-label">Which days? (optional — leave empty to train it any day)</div>
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

      <button className="claim-btn done-btn" onClick={onClose}>✓ DONE EDITING</button>
    </div>
  );
}

function StarterPlans({ store }) {
  return (
    <div className="starter-list">
      {TEMPLATES.map((t) => (
        <button key={t.id} type="button" className="starter-btn" onClick={() => store.applyTemplate(t.days)}>
          <span className="starter-name">{t.name}</span>
          <span className="starter-blurb">{t.blurb}</span>
          <span className="starter-days">{t.days.map((d) => d.name).join(" · ")}</span>
        </button>
      ))}
    </div>
  );
}

function PlanBuilder({ store }) {
  const { state, addDay, deleteDay, moveDay, clearPlan } = store;
  const days = state.workoutPlan.days;
  const [openId, setOpenId] = useState(null);
  const [newDay, setNewDay] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  function add(name) {
    if (!name.trim()) return;
    addDay(name);
    setNewDay("");
  }

  const newDayForm = (
    <form className="rename-row" onSubmit={(e) => { e.preventDefault(); add(newDay); }}>
      <input
        className="meal-input"
        placeholder={days.length ? "Name a new workout, e.g. Arms" : "Name your workout, e.g. Chest day"}
        value={newDay}
        onChange={(e) => setNewDay(e.target.value)}
        maxLength={40}
        aria-label="New workout name"
      />
      <button type="submit" className="add-set-btn" disabled={!newDay.trim()}>+ ADD</button>
    </form>
  );

  // First visit: a ready-made plan is one tap away. Building your own is still
  // there, one step back, for people who know what they want.
  if (days.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Choose a plan</div>
        <div className="builder-empty">New to lifting? Pick a starter plan — you can change any of it later.</div>
        <StarterPlans store={store} />
        {showCustom ? (
          newDayForm
        ) : (
          <button type="button" className="claim-btn ghost" onClick={() => setShowCustom(true)}>OR BUILD MY OWN</button>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">My Workouts</div>

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
            <button
              className={`mini-btn ${openId === day.id ? "on" : ""}`}
              onClick={() => setOpenId(openId === day.id ? null : day.id)}
              aria-expanded={openId === day.id}
            >
              {openId === day.id ? "CLOSE" : "EDIT"}
            </button>
            <button
              className="del-btn small"
              onClick={() =>
                window.confirm(`Delete "${day.name}" and its ${day.exercises.length} exercises? Past workout history is kept.`) &&
                deleteDay(day.id)
              }
              aria-label={`Delete ${day.name}`}
            >
              ×
            </button>
          </div>
          {openId === day.id && <DayEditor day={day} store={store} onClose={() => setOpenId(null)} />}
        </div>
      ))}

      {newDayForm}

      <button
        className="claim-btn ghost small-btn subtle-danger"
        onClick={() =>
          window.confirm(
            `Delete all ${days.length} workout${days.length === 1 ? "" : "s"} and start over? Your history and PRs are kept.`
          ) && clearPlan()
        }
      >
        START OVER
      </button>
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
  const prList = Object.values(state.prs).filter((p) => p.maxWeight > 0).sort((a, b) => b.maxWeight - a.maxWeight);

  return (
    <div className="page">
      <datalist id="exercise-library">
        {LIBRARY_NAMES.map((n) => <option key={n} value={n} />)}
      </datalist>

      {state.workoutPlan.days.length > 0 && <SessionCard store={store} />}

      {activeDay && activeDay.exercises.length === 0 && (
        <div className="card builder-empty big">
          <strong>{activeDay.name}</strong> has no exercises yet. Tap EDIT on it below to add some.
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
