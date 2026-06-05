import { useState, useEffect, useRef } from "react";

// Workout type by weekday (matches the workout tasks): Mon/Wed upper, Tue/Thu lower.
function workoutTypeToday() {
  const d = new Date().getDay();
  if (d === 1 || d === 3) return "Upper Body";
  if (d === 2 || d === 4) return "Lower Body";
  return "Free / Rest Day";
}

const SUGGESTED = {
  "Upper Body": ["Bench Press", "Overhead Press", "Barbell Row", "Pull-up", "Bicep Curl"],
  "Lower Body": ["Squat", "Deadlift", "Leg Press", "Romanian Deadlift", "Calf Raise"],
  "Free / Rest Day": ["Squat", "Bench Press", "Deadlift"],
};

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

  // Auto-start when a set is logged (startSignal increments).
  useEffect(() => {
    if (startSignal === 0) return;
    setTimeLeft(durationRef.current);
    setJustDone(false);
    setRunning(true);
  }, [startSignal]);

  // Countdown tick.
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
    if (timeLeft === 0) {
      setTimeLeft(duration);
      setJustDone(false);
      setRunning(true);
    } else {
      setRunning((r) => !r);
    }
  }

  function reset() {
    setRunning(false);
    setTimeLeft(duration);
    setJustDone(false);
  }

  return (
    <div className={`card rest-timer ${running ? "ticking" : ""} ${justDone ? "done" : ""}`}>
      <div className="card-title">Rest Timer</div>
      <div className="rest-display">{justDone ? "DONE!" : fmt(timeLeft)}</div>
      <div className="rest-presets">
        {PRESETS.map((p) => (
          <button
            key={p}
            className={`rest-preset ${duration === p ? "active" : ""}`}
            onClick={() => pickPreset(p)}
          >
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

function SetRow({ set, onDelete }) {
  return (
    <div className="set-row">
      <span className="set-vol">{set.weight} kg × {set.reps}</span>
      {set.pr && <span className="pr-tag">PR</span>}
      <button className="del-btn small" onClick={onDelete}>×</button>
    </div>
  );
}

function ExerciseCard({ ex, store, onSetAdded }) {
  const { addSet, deleteSet, deleteExercise, lastSessionFor, prs } = store;
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const last = lastSessionFor(ex.name);
  const pr = prs[ex.name.toLowerCase().trim()];

  function submit(e) {
    e.preventDefault();
    if (!reps) return;
    addSet(ex.id, weight, reps);
    setReps("");
    // keep weight for convenience between sets
    onSetAdded?.();
  }

  return (
    <div className="exercise-card">
      <div className="exercise-head">
        <div>
          <div className="exercise-name">{ex.name}</div>
          {last ? (
            <div className="exercise-last">Last: {last.weight}kg × {last.reps} ({last.sets} sets)</div>
          ) : (
            <div className="exercise-last">First time — set a baseline!</div>
          )}
        </div>
        <button className="del-btn" onClick={() => deleteExercise(ex.id)}>×</button>
      </div>

      {pr && (
        <div className="pr-line">Best: {pr.maxWeight}kg · {pr.maxVolume} vol</div>
      )}

      {ex.sets.map((s, i) => (
        <SetRow key={i} set={s} onDelete={() => deleteSet(ex.id, i)} />
      ))}

      <form className="set-form" onSubmit={submit}>
        <input className="meal-input small" type="number" placeholder="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
        <span className="set-x">×</span>
        <input className="meal-input small" type="number" placeholder="reps" value={reps} onChange={(e) => setReps(e.target.value)} />
        <button type="submit" className="add-set-btn">+ SET</button>
      </form>
    </div>
  );
}

export default function GymTab({ store }) {
  const { todayWorkout, addExercise, prs } = store;
  const [name, setName] = useState("");
  const [restSignal, setRestSignal] = useState(0);
  const type = workoutTypeToday();
  const suggestions = SUGGESTED[type] || [];
  const usedNames = new Set(todayWorkout.map((e) => e.name.toLowerCase().trim()));

  function add(n) {
    if (!n.trim()) return;
    addExercise(n);
    setName("");
  }

  const prList = Object.values(prs).sort((a, b) => b.maxWeight - a.maxWeight);

  return (
    <div className="page">
      <div className="card">
        <div className="card-title">Today&apos;s Session</div>
        <div className="workout-type">{type}</div>
      </div>

      <RestTimer startSignal={restSignal} />

      {todayWorkout.map((ex) => (
        <ExerciseCard key={ex.id} ex={ex} store={store} onSetAdded={() => setRestSignal((n) => n + 1)} />
      ))}

      <div className="card">
        <div className="card-title">Add Exercise</div>
        <form onSubmit={(e) => { e.preventDefault(); add(name); }}>
          <input className="meal-input" placeholder="Exercise name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="claim-btn">ADD EXERCISE</button>
        </form>
        <div className="suggest-row">
          {suggestions.filter((s) => !usedNames.has(s.toLowerCase())).map((s) => (
            <button key={s} className="suggest-chip" onClick={() => add(s)}>+ {s}</button>
          ))}
        </div>
      </div>

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
