import { useState } from "react";
import { MEAL_NAME_SUGGESTIONS } from "./gameData";

const MACROS = [
  { key: "protein", label: "Protein", color: "var(--blue)" },
  { key: "carbs", label: "Carbs", color: "var(--orange)" },
  { key: "fats", label: "Fats", color: "var(--pink)" },
];

function sumMacros(items) {
  return items.reduce(
    (acc, m) => ({
      cal: acc.cal + (Number(m.cal) || 0),
      protein: acc.protein + (Number(m.protein) || 0),
      carbs: acc.carbs + (Number(m.carbs) || 0),
      fats: acc.fats + (Number(m.fats) || 0),
    }),
    { cal: 0, protein: 0, carbs: 0, fats: 0 }
  );
}

const r1 = (n) => Math.round(n * 10) / 10;
const macroLine = (m) => `${Math.round(m.cal)} kcal · P${r1(m.protein)} · C${r1(m.carbs)} · F${r1(m.fats)}`;

function MacroBar({ label, value, goal, color, unit = "g" }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const over = goal > 0 && value > goal;
  return (
    <div className="macro-row">
      <div className="macro-head">
        <span style={{ color }}>{label}</span>
        <span className={`macro-nums ${over ? "over" : ""}`}>
          {r1(value)} <span className="macro-goal">/ {goal}{unit}</span>
        </span>
      </div>
      <div className="skill-bar">
        <div
          className="skill-bar-fill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 65%, transparent))`,
            boxShadow: `0 0 8px color-mix(in srgb, ${color} 40%, transparent)`,
          }}
        />
      </div>
    </div>
  );
}

// ── Food item form (used for plan items, logged entries, and manual logging) ──
const BLANK_FOOD = { name: "", qty: "", cal: "", protein: "", carbs: "", fats: "" };

function FoodForm({ initial = BLANK_FOOD, submitLabel, onSubmit, onCancel, children }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
    if (!onCancel) setForm(BLANK_FOOD);
  }

  return (
    <form className="edit-form inset" onSubmit={submit}>
      {children}
      <div className="form-grid food-name">
        <input className="meal-input" placeholder="Food item *" value={form.name} onChange={set("name")} maxLength={60} required aria-label="Food item" />
        <input className="meal-input" placeholder="Qty (100 g)" value={form.qty} onChange={set("qty")} maxLength={20} aria-label="Quantity" />
      </div>
      <div className="macro-inputs">
        <input className="meal-input small" type="number" inputMode="decimal" min="0" step="any" placeholder="kcal" value={form.cal} onChange={set("cal")} aria-label="Calories" />
        <input className="meal-input small" type="number" inputMode="decimal" min="0" step="any" placeholder="P (g)" value={form.protein} onChange={set("protein")} aria-label="Protein grams" />
        <input className="meal-input small" type="number" inputMode="decimal" min="0" step="any" placeholder="C (g)" value={form.carbs} onChange={set("carbs")} aria-label="Carbs grams" />
        <input className="meal-input small" type="number" inputMode="decimal" min="0" step="any" placeholder="F (g)" value={form.fats} onChange={set("fats")} aria-label="Fats grams" />
      </div>
      <div className="form-actions">
        <button type="submit" className="claim-btn">{submitLabel}</button>
        {onCancel && <button type="button" className="claim-btn ghost" onClick={onCancel}>CANCEL</button>}
      </div>
    </form>
  );
}

function FoodRow({ item, where, onEdit, onDelete }) {
  return (
    <div className="meal-item">
      <div className="meal-main">
        <div className="meal-name">
          {item.name}
          {item.qty && <span className="meal-qty"> · {item.qty}</span>}
        </div>
        <div className="meal-macros">{macroLine(item)}</div>
      </div>
      <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${item.name} (${where})`} title="Edit">✎</button>
      <button className="del-btn" onClick={onDelete} aria-label={`Delete ${item.name} (${where})`} title="Delete">×</button>
    </div>
  );
}

const editable = (i) => ({
  name: i.name,
  qty: i.qty || "",
  cal: i.cal,
  protein: i.protein,
  carbs: i.carbs,
  fats: i.fats,
});

// ── Targets + totals ─────────────────────────────────────────────────────────
function NutritionSummary({ store, totals, planTotals }) {
  const { setNutritionGoals } = store;
  const nutritionGoals = store.state.nutritionGoals;
  const [editing, setEditing] = useState(false);
  const [goalForm, setGoalForm] = useState(nutritionGoals);
  const calPct = nutritionGoals.cal > 0 ? Math.min(100, Math.round((totals.cal / nutritionGoals.cal) * 100)) : 0;
  const remaining = nutritionGoals.cal - totals.cal;

  return (
    <div className="card">
      <div className="card-title split-title">
        <span>Today&apos;s Nutrition</span>
        <button className="link-btn" onClick={() => { setGoalForm(nutritionGoals); setEditing(!editing); }}>
          {editing ? "Close" : "Edit Targets"}
        </button>
      </div>

      {editing ? (
        <form
          className="goal-editor"
          onSubmit={(e) => {
            e.preventDefault();
            setNutritionGoals(goalForm);
            setEditing(false);
          }}
        >
          {[
            ["cal", "Calories (kcal)"],
            ["protein", "Protein (g)"],
            ["carbs", "Carbs (g)"],
            ["fats", "Fats (g)"],
          ].map(([k, label]) => (
            <label key={k} className="goal-field">
              <span>{label}</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={goalForm[k]}
                onChange={(e) => setGoalForm({ ...goalForm, [k]: e.target.value })}
              />
            </label>
          ))}
          <button type="submit" className="claim-btn">SAVE TARGETS</button>
        </form>
      ) : (
        <>
          <div className="cal-summary">
            <div className="cal-big">{Math.round(totals.cal)}</div>
            <div className="cal-sub">/ {nutritionGoals.cal} kcal</div>
          </div>
          <div className="cal-remaining">
            {remaining >= 0 ? `${Math.round(remaining)} kcal remaining` : `${Math.round(-remaining)} kcal over target`}
          </div>
          <div className="skill-bar" style={{ marginBottom: 16 }}>
            <div className="skill-bar-fill" style={{ width: `${calPct}%`, background: "linear-gradient(90deg, var(--green), #16a34a)", boxShadow: "0 0 8px rgba(74,222,128,0.4)" }} />
          </div>
          {MACROS.map((m) => (
            <MacroBar key={m.key} label={m.label} value={totals[m.key]} goal={nutritionGoals[m.key]} color={m.color} />
          ))}
          {planTotals && (
            <div className="plan-vs-target">
              Diet plan totals: {macroLine(planTotals)}
              {nutritionGoals.cal > 0 && ` (${Math.round((planTotals.cal / nutritionGoals.cal) * 100)}% of target)`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Today's food log ─────────────────────────────────────────────────────────
function FoodLog({ store, slotNames }) {
  const { todayMeals, addFood, updateFood, deleteFood, recentFoods } = store;
  const [slot, setSlot] = useState(slotNames[0]);
  const [editingId, setEditingId] = useState(null);
  const activeSlot = slotNames.includes(slot) ? slot : slotNames[0];
  const groups = [...new Set([...slotNames, ...todayMeals.map((m) => m.slot)])];

  return (
    <>
      <div className="card">
        <div className="card-title">Log Food</div>
        <div className="slot-tabs wrap">
          {slotNames.map((s) => (
            <button key={s} className={`slot-tab ${activeSlot === s ? "active" : ""}`} onClick={() => setSlot(s)}>{s}</button>
          ))}
        </div>
        {recentFoods.length > 0 && (
          <div className="quick-add">
            <div className="quick-add-label">Quick add to {activeSlot}</div>
            <div className="suggest-row">
              {recentFoods.map((m) => (
                <button key={m.key} className="suggest-chip" onClick={() => addFood(activeSlot, m)}>
                  + {m.name} <span className="chip-kcal">{Math.round(m.cal)}kcal</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <FoodForm submitLabel={`ADD TO ${activeSlot.toUpperCase()}`} onSubmit={(f) => addFood(activeSlot, f)} />
      </div>

      {groups.map((s) => {
        const items = todayMeals.filter((m) => m.slot === s);
        if (!items.length) return null;
        const t = sumMacros(items);
        return (
          <div key={s}>
            <div className="section-head" style={{ color: "var(--green)" }}>
              {s}
              <span className="section-total">{Math.round(t.cal)} kcal</span>
            </div>
            {items.map((m) =>
              editingId === m.id ? (
                <div key={m.id} className="card">
                  <FoodForm
                    initial={editable(m)}
                    submitLabel="SAVE"
                    onSubmit={(f) => { updateFood(m.id, f); setEditingId(null); }}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <FoodRow
                  key={m.id}
                  item={m}
                  where={`logged ${s}`}
                  onEdit={() => setEditingId(m.id)}
                  onDelete={() => window.confirm(`Remove "${m.name}" from today's log?`) && deleteFood(m.id)}
                />
              )
            )}
          </div>
        );
      })}

      {todayMeals.length === 0 && (
        <div className="card empty-state">
          <div className="empty-title">Nothing logged today</div>
          <div className="empty-desc">Log a meal from your diet plan in one tap, or add foods above.</div>
        </div>
      )}
    </>
  );
}

// ── Diet plan builder ────────────────────────────────────────────────────────
function PlanMeal({ meal, idx, count, store, open, onToggle, loggedToday }) {
  const { renamePlanMeal, deletePlanMeal, movePlanMeal, addPlanItem, updatePlanItem, deletePlanItem, logPlanMeal } = store;
  const [name, setName] = useState(meal.name);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const t = sumMacros(meal.items);

  return (
    <div className={`day-block ${open ? "open" : ""}`}>
      <div className="builder-row">
        <div className="builder-arrows">
          <button onClick={() => movePlanMeal(meal.id, -1)} disabled={idx === 0} aria-label={`Move ${meal.name} up`}>▲</button>
          <button onClick={() => movePlanMeal(meal.id, 1)} disabled={idx === count - 1} aria-label={`Move ${meal.name} down`}>▼</button>
        </div>
        <button className="builder-main as-button" onClick={onToggle}>
          <div className="builder-name">
            {meal.name}
            {loggedToday && <span className="logged-tag">LOGGED</span>}
          </div>
          <div className="builder-meta">
            {meal.items.length} item{meal.items.length === 1 ? "" : "s"} · {macroLine(t)}
          </div>
        </button>
        <button className="icon-btn" onClick={onToggle} aria-label={`Edit ${meal.name}`} title="Edit">{open ? "▾" : "✎"}</button>
        <button
          className="del-btn small"
          onClick={() => window.confirm(`Delete "${meal.name}" from your diet plan?`) && deletePlanMeal(meal.id)}
          aria-label={`Delete ${meal.name}`}
          title="Delete"
        >
          ×
        </button>
      </div>

      {open && (
        <div className="day-editor">
          <form
            className="rename-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) renamePlanMeal(meal.id, name);
            }}
          >
            <input className="meal-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-label="Meal name" />
            <button type="submit" className="add-set-btn" disabled={!name.trim() || name.trim() === meal.name}>RENAME</button>
          </form>

          {meal.items.length === 0 && !adding && <div className="builder-empty">No food items yet — add what this meal contains.</div>}
          {meal.items.map((item) =>
            editingId === item.id ? (
              <FoodForm
                key={item.id}
                initial={editable(item)}
                submitLabel="SAVE ITEM"
                onSubmit={(f) => { updatePlanItem(meal.id, item.id, f); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <FoodRow
                key={item.id}
                item={item}
                where={`${meal.name} plan`}
                onEdit={() => { setEditingId(item.id); setAdding(false); }}
                onDelete={() => window.confirm(`Remove "${item.name}"?`) && deletePlanItem(meal.id, item.id)}
              />
            )
          )}

          {adding ? (
            <FoodForm
              submitLabel="ADD ITEM"
              onSubmit={(f) => { addPlanItem(meal.id, f); setAdding(false); }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button className="claim-btn ghost" onClick={() => { setAdding(true); setEditingId(null); }}>+ ADD FOOD ITEM</button>
          )}
        </div>
      )}

      {meal.items.length > 0 && (
        <button className="claim-btn log-plan-btn" onClick={() => logPlanMeal(meal.id)}>
          {loggedToday ? `LOG ${meal.name.toUpperCase()} AGAIN` : `LOG ${meal.name.toUpperCase()} FOR TODAY`}
        </button>
      )}
    </div>
  );
}

function DietPlan({ store }) {
  const { state, addPlanMeal, todayMeals } = store;
  const meals = state.dietPlan.meals;
  const [openId, setOpenId] = useState(null);
  const [newMeal, setNewMeal] = useState("");
  const suggestions = MEAL_NAME_SUGGESTIONS.filter((s) => !meals.some((m) => m.name.toLowerCase() === s.toLowerCase()));

  function add(name) {
    if (!name.trim()) return;
    addPlanMeal(name);
    setNewMeal("");
  }

  return (
    <div className="card">
      <div className="card-title">My Diet Plan</div>
      {meals.length === 0 && (
        <div className="builder-empty">
          Plan your day of eating — add meals like Breakfast, Lunch, Snacks and Dinner, fill them with food items,
          then log a whole meal in one tap.
        </div>
      )}
      {meals.map((meal, idx) => (
        <PlanMeal
          key={meal.id}
          meal={meal}
          idx={idx}
          count={meals.length}
          store={store}
          open={openId === meal.id}
          onToggle={() => setOpenId(openId === meal.id ? null : meal.id)}
          loggedToday={todayMeals.some((m) => m.slot === meal.name)}
        />
      ))}

      <form className="rename-row" onSubmit={(e) => { e.preventDefault(); add(newMeal); }}>
        <input className="meal-input" placeholder="New meal name" value={newMeal} onChange={(e) => setNewMeal(e.target.value)} maxLength={30} />
        <button type="submit" className="add-set-btn" disabled={!newMeal.trim()}>+ MEAL</button>
      </form>
      {suggestions.length > 0 && (
        <div className="suggest-row">
          {suggestions.map((s) => (
            <button key={s} className="suggest-chip" onClick={() => add(s)}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Meals tab ────────────────────────────────────────────────────────────────
export default function MealsTab({ store }) {
  const { state, today } = store;
  const todayMeals = state.meals[today] || [];
  const planMeals = state.dietPlan.meals;
  const totals = sumMacros(todayMeals);
  const planTotals = planMeals.length ? sumMacros(planMeals.flatMap((m) => m.items)) : null;

  const slotNames = planMeals.length ? planMeals.map((m) => m.name) : MEAL_NAME_SUGGESTIONS;

  // Recently logged foods (deduped by name, newest first) for one-tap re-logging.
  const recentFoods = [];
  const seen = new Set();
  for (const d of Object.keys(state.meals).sort().reverse()) {
    const items = state.meals[d] || [];
    for (let i = items.length - 1; i >= 0 && recentFoods.length < 8; i--) {
      const key = items[i].name.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      recentFoods.push({ ...items[i], key });
    }
    if (recentFoods.length >= 8) break;
  }

  const ctx = { ...store, todayMeals, recentFoods };

  return (
    <div className="page">
      <NutritionSummary store={store} totals={totals} planTotals={planTotals} />
      <DietPlan store={ctx} />
      <FoodLog store={ctx} slotNames={slotNames} />
    </div>
  );
}
