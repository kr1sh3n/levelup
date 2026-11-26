import { Fragment, useState, useEffect, useRef } from "react";
import { WEEKDAY_SHORT, LIFT_XP, getStreakMultiplier } from "./gameData";
import { THEMES, themeOf } from "./themes";
import { LIBRARY } from "./muscles/exercises";
import { DEFAULT_REPS, DEFAULT_REST, REST_OPTIONS, TEMPLATES, restLabel, supersetGroups } from "./templates";
import { askConfirm } from "./confirm";
import { chime } from "./sound";
import { cancelRestPush, enablePush, pushConfigured, pushEnabled, scheduleRestPush } from "./push";
import { PR_LABEL, recordsList } from "./prs";

// Offered as suggestions while typing an exercise name. Picking one of these
// also means the muscle map knows which muscles it works.
const LIBRARY_NAMES = [...new Set(LIBRARY.map((e) => e.name))].sort((a, b) => a.localeCompare(b));

// ── Rest timer ────────────────────────────────────────────────────────────────
function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function restChoices(current) {
  return REST_OPTIONS.includes(current) ? REST_OPTIONS : [...REST_OPTIONS, current].sort((a, b) => a - b);
}

// `signal` changes ({ n, sec }) each time a set is logged → auto-start with that exercise's rest.
//
// The countdown is kept as an end time, not a number ticked down each second:
// an iPhone pauses a page's timers while it is in the background, so a
// ticking counter came back with time still on it. Now it is always right,
// and the "rest over" push (if turned on) fires from the server on time.
function RestTimer({ signal }) {
  const [duration, setDuration] = useState(DEFAULT_REST);
  const [endAt, setEndAt] = useState(null); // running: when it ends
  const [pausedLeft, setPausedLeft] = useState(DEFAULT_REST); // stopped: seconds left
  const [now, setNow] = useState(() => Date.now());
  const [justDone, setJustDone] = useState(false);
  // Rings until you tap RESET (or start another rest), so it can't be missed.
  const [ringing, setRinging] = useState(false);
  const [notify, setNotify] = useState(pushEnabled);
  const [notifyMsg, setNotifyMsg] = useState(null);
  const durationRef = useRef(duration);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const running = endAt !== null;
  const timeLeft = running ? Math.max(0, Math.ceil((endAt - now) / 1000)) : pausedLeft;

  function start(sec) {
    const end = Date.now() + sec * 1000;
    setEndAt(end);
    setNow(Date.now());
    setJustDone(false);
    setRinging(false);
    scheduleRestPush(end);
  }

  useEffect(() => {
    if (!signal.n) return;
    const sec = signal.sec > 0 ? signal.sec : durationRef.current;
    const t = setTimeout(() => {
      setDuration(sec);
      start(sec);
    }, 0);
    return () => clearTimeout(t);
  }, [signal]);

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running]);

  useEffect(() => {
    if (!running || now < endAt) return;
    const t = setTimeout(() => {
      setEndAt(null);
      setPausedLeft(0);
      setJustDone(true);
      setRinging(true);
    }, 0);
    return () => clearTimeout(t);
  }, [running, now, endAt]);

  // The chime repeats every 1.5 s until stopped.
  useEffect(() => {
    if (!ringing) return;
    const ring = () => {
      chime();
      try { navigator.vibrate?.(300); } catch { /* no-op */ }
    };
    ring();
    const id = setInterval(ring, 1500);
    return () => clearInterval(id);
  }, [ringing]);

  function pickLength(sec) {
    setRinging(false);
    setDuration(sec);
    setEndAt(null);
    setPausedLeft(sec);
    setJustDone(false);
    cancelRestPush();
  }
  function toggle() {
    setRinging(false);
    if (running) {
      setPausedLeft(timeLeft);
      setEndAt(null);
      cancelRestPush();
    } else start(timeLeft === 0 ? duration : timeLeft);
  }
  function reset() {
    setRinging(false);
    setEndAt(null);
    setPausedLeft(duration);
    setJustDone(false);
    cancelRestPush();
  }
  async function turnOnNotify() {
    setNotifyMsg(null);
    try {
      await enablePush();
      setNotify(true);
      setNotifyMsg("You'll get a notification when rest is over.");
      if (running) scheduleRestPush(endAt);
    } catch (err) {
      setNotifyMsg(err.message || "Couldn't turn on notifications.");
    }
  }

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
        <button className={`rest-btn ${ringing ? "ringing" : ""}`} onClick={reset}>{ringing ? "🔔 STOP" : "RESET"}</button>
      </div>
      {pushConfigured() && !notify && (
        <button type="button" className="link-btn notify-link" onClick={turnOnNotify}>
          🔔 Notify me when rest is over
        </button>
      )}
      {notifyMsg && <div className="rest-note">{notifyMsg}</div>}
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
// Short form for lists: "40×5", "BW×12".
const short = (x) => `${Number(x.weight) > 0 ? x.weight : "BW"}×${x.reps}`;
const shortWithDrops = (x) => [short(x), ...(x.drops || []).map(short)].join(" → ");

// Turns a kg field into a number: commas allowed, blank or negative refused.
function parseKg(raw) {
  const w = String(raw).trim().replace(",", ".");
  if (w === "" || Number.isNaN(Number(w)) || Number(w) < 0) return null;
  return w;
}

// ── Today's session ──────────────────────────────────────────────────────────
function DropForm({ onAdd, onCancel, bodyweight }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [err, setErr] = useState(null);
  function submit(e) {
    e.preventDefault();
    const w = bodyweight ? "0" : parseKg(weight);
    if (w === null) return setErr("Enter the lighter weight.");
    if (!(Number(reps) > 0)) return setErr("Enter the reps.");
    onAdd(w, reps);
  }
  return (
    <>
      <form className="set-form drop-form" onSubmit={submit} noValidate>
        <span className="drop-arrow">↳</span>
        {!bodyweight && (
          <input className="meal-input small" type="text" inputMode="decimal" autoComplete="off" placeholder="kg" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Drop weight in kg" autoFocus />
        )}
        <span className="set-x">×</span>
        <input className="meal-input small" type="text" inputMode="numeric" autoComplete="off" placeholder="reps" value={reps} onChange={(e) => setReps(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Drop reps" autoFocus={bodyweight} />
        <button type="submit" className="add-set-btn">ADD</button>
        <button type="button" className="mini-btn ghost" onClick={onCancel}>CANCEL</button>
      </form>
      {err && <div className="form-msg err">{err}</div>}
    </>
  );
}

function SetRow({ set, index, onDelete, onDeleteDrop, onAddDrop, locked, bodyweight }) {
  const [dropping, setDropping] = useState(false);
  return (
    <>
      <div className="set-row">
        <span className="set-num">Set {index + 1}</span>
        <span className="set-vol">
          {weightText(set.weight)} × {set.reps}
          {(set.drops || []).map((d, j) => (
            <span key={j} className="drop-part">
              {" → "}{short(d)}
              {!locked && (
                <button type="button" className="drop-del" onClick={() => onDeleteDrop(j)} aria-label={`Remove drop ${j + 1}`}>×</button>
              )}
            </span>
          ))}
        </span>
        {set.rir != null && <span className="rir-tag">RIR {set.rir}</span>}
        {set.pr && <span className="pr-tag" title="Personal record">{set.prKind && set.prKind !== "first" ? `PR · ${PR_LABEL[set.prKind]}` : "PR"}</span>}
        {!locked && !dropping && (
          <button type="button" className="mini-btn ghost drop-btn" onClick={() => setDropping(true)} title="Drop set: lower the weight and keep going">+ DROP</button>
        )}
        {!locked && (
          <button className="del-btn small" onClick={onDelete} aria-label={`Delete set ${index + 1}`}>×</button>
        )}
      </div>
      {dropping && (
        <DropForm
          bodyweight={bodyweight}
          onCancel={() => setDropping(false)}
          onAdd={(w, r) => { onAddDrop(w, r); setDropping(false); }}
        />
      )}
    </>
  );
}

function ExerciseLogCard({ ex, day, log, store, onSetAdded, superset }) {
  const { addSet, deleteSet, addDrop, deleteDrop, toggleExerciseDone, lastSessionFor } = store;
  const last = lastSessionFor(ex);
  // Everything is typed by hand: nothing is prefilled from earlier sets.
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [err, setErr] = useState(null);
  // Bodyweight exercises (pull-ups, dips): no kg to type. Starts on if last
  // time was all bodyweight.
  const [bw, setBw] = useState(() => !!last && last.sets.every((x) => !(Number(x.weight) > 0)));
  const locked = !!log?.completedAt;
  const exLog = log?.ex[ex.id] || { sets: [], done: false };

  // In a super set, rest comes after the last exercise of the group; the
  // others go straight on to the next one.
  const restAfter = superset && !superset.last ? null : ex.restSec;

  function submit(e) {
    e.preventDefault();
    const w = bw ? "0" : parseKg(weight);
    if (w === null) {
      setErr("Enter the weight you lifted, or tap BW for bodyweight.");
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
    onSetAdded(restAfter);
  }

  return (
    <div className={`exercise-card ${exLog.done ? "done" : ""} ${superset ? "in-superset" : ""}`}>
      <div className="exercise-head">
        <div className="exercise-headinfo">
          <div className="exercise-name">
            {superset && <span className="ss-tag">{superset.label}</span>}
            {ex.name}
          </div>
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
        {last ? (
          <>
            Last time <span className="last-date">({fmtShortDate(last.date)})</span>:{" "}
            {last.sets.map((x, i) => (
              <span key={i} className="last-set">{i > 0 && " · "}{shortWithDrops(x)}</span>
            ))}
          </>
        ) : (
          "No history yet"
        )}
      </div>

      {exLog.sets.map((s, i) => (
        <SetRow
          key={i}
          set={s}
          index={i}
          locked={locked}
          bodyweight={bw}
          onDelete={() => deleteSet(day.id, ex.id, i)}
          onDeleteDrop={(j) => deleteDrop(day.id, ex.id, i, j)}
          onAddDrop={(w, r) => { addDrop(day.id, ex.id, i, w, r); onSetAdded(restAfter); }}
        />
      ))}

      {!locked && (
        <>
          <form className="set-form" onSubmit={submit} noValidate>
            {bw ? (
              <span className="bw-chip" aria-label="Bodyweight">Bodyweight</span>
            ) : (
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
            )}
            <button
              type="button"
              className={`bw-toggle ${bw ? "on" : ""}`}
              onClick={() => { setBw(!bw); setErr(null); }}
              aria-pressed={bw}
              title="Bodyweight exercise (no added weight)"
            >
              BW
            </button>
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
          {superset && !superset.last && <div className="ss-next">Superset: go straight to {superset.nextName}, no rest.</div>}
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
          <Fragment key={ex.id}>
          <div className="builder-row">
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
              onClick={async () => (await askConfirm(`Remove "${ex.name}" from this workout?`, { okLabel: "REMOVE" })) && deleteExercise(day.id, ex.id)}
              aria-label={`Remove ${ex.name}`}
            >
              ×
            </button>
          </div>
          {/* The super set switch sits between the two exercises it joins, so
              it's clear exactly which pair it means. */}
          {idx < day.exercises.length - 1 && (
            <button
              type="button"
              className={`ss-join ${ex.supersetNext ? "on" : ""}`}
              onClick={() => store.toggleSuperset(day.id, ex.id)}
              aria-pressed={!!ex.supersetNext}
              aria-label={
                ex.supersetNext
                  ? `${ex.name} and ${day.exercises[idx + 1].name} are a superset. Tap to split them.`
                  : `Make ${ex.name} and ${day.exercises[idx + 1].name} a superset`
              }
            >
              {ex.supersetNext ? "⛓ SUPERSET · tap to split" : "+ superset with the next one"}
            </button>
          )}
          </Fragment>
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
              onClick={async () =>
                (await askConfirm(
                  `Delete "${day.name}" and its ${day.exercises.length} exercise${day.exercises.length === 1 ? "" : "s"}? Past workout history is kept.`,
                  { okLabel: "DELETE" }
                )) && deleteDay(day.id)
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
        onClick={async () =>
          (await askConfirm(
            `Delete all ${days.length} workout${days.length === 1 ? "" : "s"} and start over? Your history and PRs are kept.`,
            { okLabel: "START OVER" }
          )) && clearPlan()
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
  const prList = recordsList(state);

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
          {(() => {
            let letter = 0;
            return supersetGroups(activeDay.exercises).map((group) => {
              const onSetAdded = (sec) => sec !== null && setRestSignal((s) => ({ n: s.n + 1, sec }));
              if (group.length === 1) {
                const ex = group[0];
                return <ExerciseLogCard key={ex.id} ex={ex} day={activeDay} log={activeLog} store={store} onSetAdded={onSetAdded} />;
              }
              const L = String.fromCharCode(65 + letter++);
              return (
                <div key={group[0].id} className="superset-group">
                  <div className="superset-title">SUPERSET {L} <span className="ss-sub">· back to back, then rest</span></div>
                  {group.map((ex, i) => (
                    <ExerciseLogCard
                      key={ex.id}
                      ex={ex}
                      day={activeDay}
                      log={activeLog}
                      store={store}
                      onSetAdded={onSetAdded}
                      superset={{ label: `${L}${i + 1}`, last: i === group.length - 1, nextName: group[i + 1]?.name }}
                    />
                  ))}
                </div>
              );
            });
          })()}
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
              <span className="pr-record-val">{p.weight > 0 ? `${p.weight} kg × ${p.reps}` : `BW × ${p.bwReps}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
