import { useState, useEffect, useRef } from "react";
import { LIFT_TYPE_LABEL, LIFT_CUES, LIFT_PATTERN, WEEKDAY_SHORT } from "./gameData";

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

function RestTimer({ startSignal }) {
  const [duration, setDuration] = useState(90);
  const [timeLeft, setTimeLeft] = useState(90);
  const [running, setRunning] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const durationRef = useRef(duration);
  durationRef.current = duration;

  useEffect(() => {
    if (startSignal === 0) return;
    setTimeLeft(durationRef.current);
    setJustDone(false);
    setRunning(true);
  }, [startSignal]);

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

// ── Cycle editor ──────────────────────────────────────────────────────────────
function CycleEditor({ store }) {
  const { liftDay1, setLiftDay1 } = store;
  const [open, setOpen] = useState(false);
  const todayDow = new Date().getDay();

  return (
    <div className="card">
      <div className="card-title cycle-head">
        <span>Training Cycle</span>
        <span className="link-btn" onClick={() => setOpen(!open)}>{open ? "Close" : "Edit"}</span>
      </div>
      <div className="cycle-row">
        {WEEKDAY_SHORT.map((d, i) => {
          const offset = ((i - liftDay1) % 7 + 7) % 7;
          const type = LIFT_PATTERN[offset];
          return (
            <div key={i} className={`cycle-day ${type} ${i === todayDow ? "is-today" : ""}`}>
              <span className="cycle-dow">{d}</span>
              <span className="cycle-mark">{type === "upper" ? "U" : type === "lower" ? "L" : "·"}</span>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="day1-picker">
          <div className="day1-label">Day 1 (first Upper day) starts on:</div>
          <div className="day1-btns">
            {WEEKDAY_SHORT.map((d, i) => (
              <button key={i} className={`day1-btn ${liftDay1 === i ? "active" : ""}`} onClick={() => setLiftDay1(i)}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Overload banner ───────────────────────────────────────────────────────────
function OverloadBanner({ store }) {
  const { overloadDue, overloadLifts, dismissOverload } = store;
  if (!overloadDue) return null;
  return (
    <div className="card overload-banner">
      <div className="overload-title">PROGRESSIVE OVERLOAD WEEK</div>
      <div className="overload-desc">Beat last week on your main lifts — add a rep or a little weight:</div>
      {overloadLifts.map((l) => (
        <div key={l.name} className="overload-row">
          <span>{l.name}</span>
          <span className="overload-target">{l.last.weight}kg × {l.last.reps}</span>
        </div>
      ))}
      <button className="claim-btn ghost" onClick={dismissOverload}>GOT IT</button>
    </div>
  );
}

// ── Set row ───────────────────────────────────────────────────────────────────
function SetRow({ set, index, onDelete }) {
  return (
    <div className="set-row">
      <span className="set-num">Set {index + 1}</span>
      <span className="set-vol">{set.weight} kg × {set.reps}</span>
      {set.pr && <span className="pr-tag">PR</span>}
      <button className="del-btn small" onClick={onDelete}>×</button>
    </div>
  );
}

// ── Training-day exercise card ────────────────────────────────────────────────
function ExerciseLogCard({ ex, store, onSetAdded }) {
  const { todayLiftLog, addLiftSet, deleteLiftSet, toggleExerciseDone, lastLiftSessionFor } = store;
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const exLog = todayLiftLog.ex[ex.id] || { sets: [], done: false };
  const last = lastLiftSessionFor(ex.id);

  function submit(e) {
    e.preventDefault();
    if (!reps) return;
    addLiftSet(ex.id, ex.name, weight, reps);
    setReps("");
    onSetAdded?.();
  }

  return (
    <div className={`exercise-card ${exLog.done ? "done" : ""} ${ex.tag}`}>
      <div className="exercise-head">
        <div className="exercise-headinfo">
          <div className="exercise-name">
            {ex.name}
            <span className={`tag-badge ${ex.tag}`}>{ex.tag === "compound" ? "Compound" : "Isolation"}</span>
          </div>
          <div className="exercise-target">{ex.targetSets} sets · {ex.repLow}–{ex.repHigh} reps</div>
          <div className="exercise-cue">{LIFT_CUES[ex.tag]}</div>
        </div>
        <button
          className={`done-check ${exLog.done ? "on" : ""}`}
          onClick={() => toggleExerciseDone(ex.id)}
          title="Mark exercise done"
        >
          {exLog.done ? "✓" : ""}
        </button>
      </div>

      <div className="exercise-last">
        {last ? `Last: ${last.weight}kg × ${last.reps} (${last.sets} ${last.sets === 1 ? "set" : "sets"})` : "No history yet — set a baseline!"}
      </div>

      {exLog.sets.map((s, i) => (
        <SetRow key={i} set={s} index={i} onDelete={() => deleteLiftSet(ex.id, i)} />
      ))}

      <form className="set-form" onSubmit={submit}>
        <input className="meal-input small" type="number" inputMode="decimal" placeholder="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
        <span className="set-x">×</span>
        <input className="meal-input small" type="number" inputMode="numeric" placeholder="reps" value={reps} onChange={(e) => setReps(e.target.value)} />
        <button type="submit" className="add-set-btn">+ SET</button>
      </form>
    </div>
  );
}

// ── Routine builder ───────────────────────────────────────────────────────────
const BLANK = { name: "", tag: "compound", targetSets: 3, repLow: 8, repHigh: 12 };

function RoutineBuilder({ store }) {
  const { routines, addRoutineExercise, updateRoutineExercise, removeRoutineExercise, moveRoutineExercise } = store;
  const [type, setType] = useState("upper");
  const [form, setForm] = useState(BLANK);
  const list = routines[type] || [];

  function add(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    addRoutineExercise(type, form);
    setForm(BLANK);
  }

  return (
    <div className="card">
      <div className="card-title">Routine Builder</div>
      <div className="slot-tabs">
        <button className={`slot-tab ${type === "upper" ? "active" : ""}`} onClick={() => setType("upper")}>Upper Day</button>
        <button className={`slot-tab ${type === "lower" ? "active" : ""}`} onClick={() => setType("lower")}>Lower Day</button>
      </div>

      {list.length === 0 && <div className="builder-empty">No exercises yet. Add your first {type} lift below.</div>}

      {list.map((ex, idx) => (
        <div key={ex.id} className="builder-row">
          <div className="builder-arrows">
            <button onClick={() => moveRoutineExercise(type, ex.id, -1)} disabled={idx === 0}>▲</button>
            <button onClick={() => moveRoutineExercise(type, ex.id, 1)} disabled={idx === list.length - 1}>▼</button>
          </div>
          <div className="builder-main">
            <div className="builder-name">{ex.name}</div>
            <div className="builder-meta">{ex.targetSets} × {ex.repLow}–{ex.repHigh}</div>
          </div>
          <button
            className={`tag-toggle ${ex.tag}`}
            onClick={() => updateRoutineExercise(type, ex.id, { tag: ex.tag === "compound" ? "isolation" : "compound" })}
            title="Toggle Compound / Isolation"
          >
            {ex.tag === "compound" ? "Comp" : "Iso"}
          </button>
          <button className="del-btn small" onClick={() => removeRoutineExercise(type, ex.id)}>×</button>
        </div>
      ))}

      <form className="builder-form" onSubmit={add}>
        <input className="meal-input" placeholder="Exercise name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="builder-form-row">
          <button type="button" className={`tag-toggle ${form.tag}`} onClick={() => setForm({ ...form, tag: form.tag === "compound" ? "isolation" : "compound" })}>
            {form.tag === "compound" ? "Compound" : "Isolation"}
          </button>
          <label className="mini-field">
            <span>Sets</span>
            <input type="number" value={form.targetSets} onChange={(e) => setForm({ ...form, targetSets: e.target.value })} />
          </label>
          <label className="mini-field">
            <span>Reps</span>
            <input type="number" value={form.repLow} onChange={(e) => setForm({ ...form, repLow: e.target.value })} />
            <span className="dash">–</span>
            <input type="number" value={form.repHigh} onChange={(e) => setForm({ ...form, repHigh: e.target.value })} />
          </label>
        </div>
        <button type="submit" className="claim-btn">ADD EXERCISE</button>
      </form>
    </div>
  );
}

// ── Gym tab ───────────────────────────────────────────────────────────────────
export default function GymTab({ store }) {
  const { todayLiftType, todayRoutine, liftComplete, liftDoneCount, prs } = store;
  const [restSignal, setRestSignal] = useState(0);
  const isTraining = todayLiftType === "upper" || todayLiftType === "lower";
  const prList = Object.values(prs).sort((a, b) => b.maxWeight - a.maxWeight);

  return (
    <div className="page">
      <div className="card">
        <div className="card-title">Today&apos;s Session</div>
        <div className="workout-type">{LIFT_TYPE_LABEL[todayLiftType]}</div>
        {isTraining && todayRoutine.length > 0 && (
          <div className={`lift-progress-text ${liftComplete ? "complete" : ""}`}>
            {liftComplete ? `✓ Lift complete — ${todayRoutine.length} exercises done` : `${liftDoneCount} / ${todayRoutine.length} exercises done`}
          </div>
        )}
      </div>

      <CycleEditor store={store} />

      {isTraining ? (
        todayRoutine.length === 0 ? (
          <div className="card builder-empty big">
            Your <strong>{todayLiftType}</strong> routine is empty. Build it in the Routine Builder below to start logging.
          </div>
        ) : (
          <>
            <OverloadBanner store={store} />
            <RestTimer startSignal={restSignal} />
            {todayRoutine.map((ex) => (
              <ExerciseLogCard key={ex.id} ex={ex} store={store} onSetAdded={() => setRestSignal((n) => n + 1)} />
            ))}
          </>
        )
      ) : (
        <div className="card rest-day-card">
          <div className="rest-day-title">Rest Day</div>
          <div className="rest-day-desc">Recover and grow — no lifting scheduled today.</div>
        </div>
      )}

      <RoutineBuilder store={store} />

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
