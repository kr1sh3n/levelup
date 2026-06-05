import { useState } from "react";

const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"];

const MACROS = [
  { key: "protein", label: "Protein", color: "var(--blue)", unit: "g" },
  { key: "carbs", label: "Carbs", color: "var(--orange)", unit: "g" },
  { key: "fats", label: "Fats", color: "var(--pink)", unit: "g" },
];

function MacroBar({ label, value, goal, color }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return (
    <div className="macro-row">
      <div className="macro-head">
        <span style={{ color }}>{label}</span>
        <span className="macro-nums">
          {Math.round(value)} <span className="macro-goal">/ {goal}g</span>
        </span>
      </div>
      <div className="skill-bar">
        <div
          className="skill-bar-fill"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)`, boxShadow: `0 0 8px ${color}66` }}
        />
      </div>
    </div>
  );
}

export default function MealsTab({ store }) {
  const { todayMeals, recentMeals, nutritionGoals, addMeal, deleteMeal, setNutritionGoals } = store;

  const [slot, setSlot] = useState("Breakfast");
  const [form, setForm] = useState({ name: "", cal: "", protein: "", carbs: "", fats: "" });
  const [editGoals, setEditGoals] = useState(false);
  const [goalForm, setGoalForm] = useState(nutritionGoals);

  const totals = todayMeals.reduce(
    (acc, m) => ({
      cal: acc.cal + (Number(m.cal) || 0),
      protein: acc.protein + (Number(m.protein) || 0),
      carbs: acc.carbs + (Number(m.carbs) || 0),
      fats: acc.fats + (Number(m.fats) || 0),
    }),
    { cal: 0, protein: 0, carbs: 0, fats: 0 }
  );

  const calPct = nutritionGoals.cal > 0 ? Math.min(100, Math.round((totals.cal / nutritionGoals.cal) * 100)) : 0;

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    addMeal({
      slot,
      name: form.name.trim(),
      cal: Number(form.cal) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fats: Number(form.fats) || 0,
    });
    setForm({ name: "", cal: "", protein: "", carbs: "", fats: "" });
  }

  function saveGoals() {
    setNutritionGoals({
      cal: Number(goalForm.cal) || 0,
      protein: Number(goalForm.protein) || 0,
      carbs: Number(goalForm.carbs) || 0,
      fats: Number(goalForm.fats) || 0,
    });
    setEditGoals(false);
  }

  return (
    <div className="page">
      {/* Daily summary */}
      <div className="card">
        <div className="card-title" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Today&apos;s Nutrition</span>
          <span className="link-btn" onClick={() => { setGoalForm(nutritionGoals); setEditGoals(!editGoals); }}>
            {editGoals ? "Close" : "Edit Goals"}
          </span>
        </div>

        {editGoals ? (
          <div className="goal-editor">
            {["cal", "protein", "carbs", "fats"].map((k) => (
              <label key={k} className="goal-field">
                <span>{k === "cal" ? "Calories" : k}</span>
                <input
                  type="number"
                  value={goalForm[k]}
                  onChange={(e) => setGoalForm({ ...goalForm, [k]: e.target.value })}
                />
              </label>
            ))}
            <button className="claim-btn" onClick={saveGoals}>SAVE GOALS</button>
          </div>
        ) : (
          <>
            <div className="cal-summary">
              <div className="cal-big">{Math.round(totals.cal)}</div>
              <div className="cal-sub">/ {nutritionGoals.cal} kcal</div>
            </div>
            <div className="skill-bar" style={{ marginBottom: 16 }}>
              <div className="skill-bar-fill" style={{ width: `${calPct}%`, background: "linear-gradient(90deg, var(--green), #16a34a)", boxShadow: "0 0 8px rgba(74,222,128,0.4)" }} />
            </div>
            {MACROS.map((m) => (
              <MacroBar key={m.key} label={m.label} value={totals[m.key]} goal={nutritionGoals[m.key]} color={m.color} />
            ))}
          </>
        )}
      </div>

      {/* Add meal form */}
      <div className="card">
        <div className="card-title">Log a Meal</div>

        {recentMeals.length > 0 && (
          <div className="quick-add">
            <div className="quick-add-label">Quick add</div>
            <div className="suggest-row">
              {recentMeals.map((m) => (
                <button
                  key={m.id}
                  className="suggest-chip"
                  onClick={() => addMeal({ slot, name: m.name, cal: m.cal, protein: m.protein, carbs: m.carbs, fats: m.fats })}
                >
                  + {m.name} <span className="chip-kcal">{m.cal}kcal</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="slot-tabs">
          {SLOTS.map((s) => (
            <button key={s} className={`slot-tab ${slot === s ? "active" : ""}`} onClick={() => setSlot(s)}>
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          <input
            className="meal-input"
            placeholder="What did you eat?"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="macro-inputs">
            <input className="meal-input small" type="number" placeholder="kcal" value={form.cal} onChange={(e) => setForm({ ...form, cal: e.target.value })} />
            <input className="meal-input small" type="number" placeholder="P (g)" value={form.protein} onChange={(e) => setForm({ ...form, protein: e.target.value })} />
            <input className="meal-input small" type="number" placeholder="C (g)" value={form.carbs} onChange={(e) => setForm({ ...form, carbs: e.target.value })} />
            <input className="meal-input small" type="number" placeholder="F (g)" value={form.fats} onChange={(e) => setForm({ ...form, fats: e.target.value })} />
          </div>
          <button type="submit" className="claim-btn">ADD TO {slot.toUpperCase()}</button>
        </form>
      </div>

      {/* Meals by slot */}
      {SLOTS.map((s) => {
        const items = todayMeals.filter((m) => m.slot === s);
        if (!items.length) return null;
        return (
          <div key={s}>
            <div className="section-head" style={{ color: "var(--green)" }}>{s}</div>
            {items.map((m) => (
              <div key={m.id} className="meal-item">
                <div className="meal-main">
                  <div className="meal-name">{m.name}</div>
                  <div className="meal-macros">
                    {m.cal}kcal · P{m.protein} · C{m.carbs} · F{m.fats}
                  </div>
                </div>
                <button className="del-btn" onClick={() => deleteMeal(m.id)}>×</button>
              </div>
            ))}
          </div>
        );
      })}

      {todayMeals.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
          No meals logged yet today. Fuel up!
        </div>
      )}
    </div>
  );
}
