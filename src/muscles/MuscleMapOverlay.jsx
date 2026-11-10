import { useEffect, useMemo, useRef, useState } from "react";
import MuscleViewer from "./MuscleViewer";
import ImportDialog, { AssignDialog } from "./ImportDialog";
import { GROUP_IDS, MUSCLE_GROUPS, groupLabel } from "./taxonomy";
import { GOALS, GOAL_IDS, ZONE_KEYS, ZONE_LABEL, colorFor, goalOf, legendItems, recoveryColorFor, recoveryLegendItems, zoneFor } from "./targets";
import { HARD_SET_RIR, collectSets, computeVolumes, dataBounds, daysBetween, latestOffset, makeResolver, dayLabel, periodRange, rangeLabel, weekStart, weeklyHistory } from "./volume";
import { makeDemoSets } from "./demo";
import { agoText, computeRecovery, readyList, recoveryText, restingList } from "./recovery";
import { balanceChecks, describeGroup, focusList, overList, suggestExercises, targetBand } from "./insights";
import { THEMES, themeOf } from "../themes";

const round1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function periodTitle(kind, offset, from, to) {
  if (kind === "rolling") return offset === 0 ? `Last 7 days · ${rangeLabel(from, to)}` : `7 days to ${dayLabel(to)}`;
  if (offset === 0) return `This week · ${rangeLabel(from, to)}`;
  if (offset === 1) return `Last week · ${rangeLabel(from, to)}`;
  return `Week of ${rangeLabel(from, to)}`;
}

// A bar from 0 to the "very high" threshold, coloured by zone, with a marker at `value`.
function BandBar({ value, goal }) {
  const from = GOALS[goalOf(goal)].from;
  const cap = from.extreme * 1.15;
  const stops = ZONE_KEYS.map((z, i) => {
    const start = (from[z] / cap) * 100;
    const end = i + 1 < ZONE_KEYS.length ? (from[ZONE_KEYS[i + 1]] / cap) * 100 : 100;
    return `${colorFor(Math.max(from[z], 0.5), goal)} ${start}% ${end}%`;
  });
  return (
    <div className="mm-band" style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }}>
      <div className="mm-band-marker" style={{ left: `${Math.min(100, (value / cap) * 100)}%` }} />
    </div>
  );
}

function GroupDetail({ group, volumes, prevVolumes, goal, colorOf, history, planNames, onClear, recovery, planDays, onAddToPlan }) {
  const v = volumes.byGroup[group];
  const p = prevVolumes.byGroup[group];
  const info = describeGroup(group, volumes, goal);
  const { min, max } = targetBand(goal);
  const delta = round1(v.effective - p.effective);
  const color = colorOf(v.effective);
  const exercises = [...v.exercises.values()].sort((a, b) => b.direct * 2 + b.indirect - (a.direct * 2 + a.indirect));
  const suggestions = v.effective < min ? suggestExercises(group, planNames) : [];
  // Which exercise the user is picking a day for, and the last one added.
  const [picking, setPicking] = useState(null);
  const [added, setAdded] = useState(null);
  const top = Math.max(max * 1.2, ...history.map((w) => w.totals[group]));

  return (
    <div className="card mm-detail">
      <div className="mm-detail-head">
        <div>
          <div className="mm-detail-name">{groupLabel(group)}</div>
          <div className="mm-detail-inc">{MUSCLE_GROUPS[group].includes}</div>
        </div>
        <button type="button" className="icon-btn" onClick={onClear} aria-label="Close muscle details">×</button>
      </div>

      <div className="mm-detail-num">
        <span className="mm-big" style={{ color }}>{fmt(round1(v.effective))}</span>
        <span className="mm-unit">weekly sets</span>
        <span className="mm-zone-chip" style={{ borderColor: color, color }}>{ZONE_LABEL[zoneFor(v.effective, goal)]}</span>
      </div>
      <BandBar value={v.effective} goal={goal} />
      <div className="mm-band-legend">
        <span>0</span>
        <span>{min}</span>
        <span>{max}</span>
        <span>{GOALS[goalOf(goal)].from.extreme}+</span>
      </div>

      <p className="mm-advice">{info.summary}. {info.advice}</p>

      <div className="mm-recovery-line">
        <span className="mm-recovery-dot" style={{ background: recovery.color }} />
        <div>
          <strong>Last trained: {agoText(recovery.row.daysSince).toLowerCase()}</strong>
          <div className="mm-fine">{recoveryText(recovery.row)}</div>
        </div>
      </div>

      <div className="mm-facts">
        <div><strong>{v.direct}</strong> direct</div>
        <div><strong>{v.indirect}</strong> indirect</div>
        <div><strong>{v.days.size}</strong> day{v.days.size === 1 ? "" : "s"}</div>
        <div className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>
          <strong>{delta > 0 ? "+" : ""}{fmt(delta)}</strong> vs before
        </div>
        {v.rated > 0 && <div><strong>{v.hard}</strong> near failure</div>}
      </div>

      {v.rated > 0 && (
        <p className="mm-fine">
          {v.hard} of {v.rated} rated set{v.rated === 1 ? " was" : "s were"} taken within {HARD_SET_RIR} reps of failure
          (average {fmt(v.avgRir)} in reserve). Sets left well short of failure still count, but push growth less.
        </p>
      )}

      {exercises.length > 0 && (
        <>
          <div className="field-label">What counted</div>
          {exercises.slice(0, 6).map((e) => (
            <div key={e.name} className="mm-ex-row">
              <span>{e.name}</span>
              <span>{e.direct ? `${e.direct} direct` : ""}{e.direct && e.indirect ? " + " : ""}{e.indirect ? `${e.indirect} helper` : ""}</span>
            </div>
          ))}
        </>
      )}

      <div className="field-label">Last 8 weeks</div>
      {/* Every bar carries its number and the productive band is drawn behind them,
          so the chart reads without a mouse to hover with. */}
      <div className="mm-history">
        <div
          className="mm-history-band"
          style={{ bottom: `${(min / top) * 100}%`, height: `${(Math.min(max, top) - min) / top * 100}%` }}
          aria-hidden="true"
        />
        {history.map((w, i) => {
          const value = round1(w.totals[group]);
          const isLast = i === history.length - 1;
          return (
            <div key={w.from} className="mm-history-col">
              <span className="mm-history-val">{fmt(value)}</span>
              <div
                className={`mm-history-bar ${isLast ? "last" : ""}`}
                style={{ height: `${Math.max(3, (w.totals[group] / top) * 100)}%`, background: colorOf(w.totals[group]) }}
              />
              <span className="mm-history-tick">{isLast ? "now" : `−${history.length - 1 - i}`}</span>
            </div>
          );
        })}
      </div>
      <div className="mm-fine mm-history-key">
        Weekly sets, oldest first. The band marks the {min}–{max} range; numbers are sets.
      </div>

      {suggestions.length > 0 && (
        <>
          <div className="field-label">Ways to add volume</div>
          <div className="suggest-row">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                className={`suggest-chip ${picking === s.name ? "on" : ""}`}
                onClick={() => { setAdded(null); setPicking(picking === s.name ? null : s.name); }}
                aria-expanded={picking === s.name}
              >
                {s.name}{s.inPlan ? " (in your plan)" : ""} +
              </button>
            ))}
          </div>
          {picking && (
            <div className="mm-addto">
              {planDays.length === 0 ? (
                <div className="mm-fine">Build a workout plan in the Gym tab first, then you can add exercises straight from here.</div>
              ) : (
                <>
                  <div className="mm-fine">Add <strong>{picking}</strong> to which day?</div>
                  <div className="suggest-row">
                    {planDays.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className="suggest-chip"
                        onClick={() => { onAddToPlan(d.id, picking); setAdded({ name: picking, day: d.name }); setPicking(null); }}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {added && (
            <div className="mm-note mm-added">
              Added <strong>{added.name}</strong> to {added.day} — 3 sets of 8–12.{" "}
              <button type="button" className="link-btn" onClick={() => onAddToPlan(null, null, true)}>Open Gym</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// "Rear Delts - 2/10 sets - ready now" is the sentence you act on; neither half
// is much use alone, so each tab shows the other's number too.
function readyWord(r) {
  if (!r) return "";
  if (r.status === "ready") return "ready now";
  if (r.status === "untrained") return "not trained";
  if (r.status === "soon") return "ready tomorrow";
  return r.readyIn <= 1 ? "ready tomorrow" : `~${r.readyIn} days to go`;
}

function RecoveryPanel({ recovery, volumes, goal, colorOf, onPick }) {
  const { min } = targetBand(goal);
  const ready = readyList(recovery, 5);
  const resting = restingList(recovery);

  return (
    <>
      <div className="card">
        <div className="card-title">Ready to train</div>
        {ready.length === 0 && <div className="builder-empty">Everything is still inside its usual recovery window. A lighter session or a rest day both work.</div>}
        {ready.map((r) => (
          <button key={r.group} type="button" className="mm-focus-row" onClick={() => onPick(r.group)}>
            <span className="mm-swatch" style={{ background: colorOf(r) }} />
            <span className="mm-focus-name">
              {groupLabel(r.group)}
              <em className="mm-sub">{fmt(round1(volumes.byGroup[r.group].effective))} / {min} sets this week</em>
            </span>
            <span className="mm-focus-nums">{agoText(r.daysSince)}</span>
          </button>
        ))}
      </div>

      {resting.length > 0 && (
        <div className="card">
          <div className="card-title">Still recovering</div>
          {resting.map((r) => (
            <button key={r.group} type="button" className="mm-focus-row" onClick={() => onPick(r.group)}>
              <span className="mm-swatch" style={{ background: colorOf(r) }} />
              <span className="mm-focus-name">
                {groupLabel(r.group)}
                <em className="mm-sub">{fmt(round1(volumes.byGroup[r.group].effective))} / {min} sets this week</em>
              </span>
              <span className="mm-focus-nums">
                {agoText(r.daysSince)}
                <em>{r.readyIn === 0 ? "today" : `~${r.readyIn}d`}</em>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mm-note">
        A rule of thumb from training research, not a readiness test: bigger sessions get a longer window, and sleep, food and stress all move it. Train sore muscles if they feel fine.
      </div>
    </>
  );
}

function FocusPanel({ volumes, goal, colorOf, onPick, recovery }) {
  const { min } = targetBand(goal);
  const focus = focusList(volumes, goal, 4);
  const over = overList(volumes, goal);
  const checks = balanceChecks(volumes);
  const top = GROUP_IDS.filter((g) => volumes.byGroup[g].effective > 0)
    .sort((a, b) => volumes.byGroup[b].effective - volumes.byGroup[a].effective)
    .slice(0, 3);

  return (
    <>
      <div className="card">
        <div className="card-title">Where to focus</div>
        {focus.length === 0 && <div className="builder-empty">Every muscle is in or above the productive range. Nice.</div>}
        {focus.map((f) => (
          <button key={f.group} type="button" className="mm-focus-row" onClick={() => onPick(f.group)}>
            <span className="mm-swatch" style={{ background: colorOf(f.effective) }} />
            <span className="mm-focus-name">
              {f.label}
              <em className="mm-sub">{readyWord(recovery.byGroup[f.group])}</em>
            </span>
            <span className="mm-focus-nums">
              {fmt(round1(f.effective))} / {min} sets
              <em>+{Math.ceil(f.deficit)}</em>
            </span>
          </button>
        ))}
        {over.length > 0 && (
          <div className="mm-note warn">
            Past the productive range: {over.map((o) => o.label).join(", ")}. More sets here add little.
          </div>
        )}
      </div>

      {top.length > 0 && (
        <div className="card">
          <div className="card-title">Most trained</div>
          {top.map((g) => (
            <button key={g} type="button" className="mm-focus-row" onClick={() => onPick(g)}>
              <span className="mm-swatch" style={{ background: colorOf(volumes.byGroup[g].effective) }} />
              <span className="mm-focus-name">{groupLabel(g)}</span>
              <span className="mm-focus-nums">{fmt(round1(volumes.byGroup[g].effective))} sets</span>
            </button>
          ))}
        </div>
      )}

      {checks.length > 0 && (
        <div className="card">
          <div className="card-title">Balance (rules of thumb)</div>
          {checks.map((c) => (
            <div key={c.id} className={`mm-check ${c.ok ? "ok" : "warn"}`}>
              <div className="mm-check-head">
                <span>{c.label}</span>
                <span>{c.a.label} {c.a.value} : {c.b.value} {c.b.label}</span>
              </div>
              <div className="mm-check-msg">{c.message}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function MuscleMapOverlay({ store, onClose, setTab }) {
  const { state, today } = store;
  const mm = state.muscleMap;
  const goal = goalOf(mm.goal);
  const indirect = mm.indirect ?? GOALS[goal].indirect;
  const kind = mm.period === "week" ? "week" : "rolling";
  const mode = mm.mode === "recovery" ? "recovery" : "volume";
  const theme = THEMES[themeOf(state.theme)];

  const { workoutLogs, importedSets, workoutPlan, exerciseMuscles } = state;
  const realSets = useMemo(() => collectSets({ workoutLogs, importedSets, workoutPlan }), [workoutLogs, importedSets, workoutPlan]);
  const demoSets = useMemo(() => makeDemoSets(today), [today]);
  const [demo, setDemo] = useState(false);
  const sets = demo ? demoSets : realSets;
  const hasData = sets.length > 0;

  const [offset, setOffset] = useState(() => latestOffset(realSets, today, kind));
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [labels, setLabels] = useState(true);

  const { from, to } = periodRange(kind, today, offset);
  const { from: prevFrom, to: prevTo } = periodRange(kind, today, offset + 1);
  const resolver = useMemo(() => makeResolver(exerciseMuscles), [exerciseMuscles]);
  const volumes = useMemo(() => computeVolumes(sets, { from, to, resolve: resolver, indirect }), [sets, from, to, resolver, indirect]);
  const prevVolumes = useMemo(
    () => computeVolumes(sets, { from: prevFrom, to: prevTo, resolve: resolver, indirect }),
    [sets, prevFrom, prevTo, resolver, indirect]
  );
  // Untrained muscles use a quiet per-theme colour instead of the scheme's own "none".
  const none = theme.mapNone;
  const colorOf = useMemo(() => (value) => (value > 0 ? colorFor(value, goal) : none), [goal, none]);
  // Recovery is always measured from today, so it ignores the period navigation.
  const recovery = useMemo(() => computeRecovery(sets, { today, resolve: resolver, indirect }), [sets, today, resolver, indirect]);
  const recoveryColorOf = useMemo(
    () => (row) => (row.status === "untrained" ? none : recoveryColorFor(row)),
    [none]
  );
  const colors = useMemo(
    () =>
      Object.fromEntries(
        GROUP_IDS.map((g) => [g, mode === "recovery" ? recoveryColorOf(recovery.byGroup[g]) : colorOf(volumes.byGroup[g].effective)])
      ),
    [volumes, colorOf, mode, recovery, recoveryColorOf]
  );
  const history = useMemo(
    () => (selected ? weeklyHistory(sets, weekStart(to), 8, { resolve: resolver, indirect }) : []),
    [selected, sets, to, resolver, indirect]
  );
  const sessions = useMemo(() => new Set(sets.filter((s) => !s.warmup && s.date >= from && s.date <= to).map((s) => s.date)).size, [sets, from, to]);
  const planNames = useMemo(() => workoutPlan.days.flatMap((d) => d.exercises.map((e) => e.name)), [workoutPlan]);
  const planDays = useMemo(() => workoutPlan.days.map((d) => ({ id: d.id, name: d.name })), [workoutPlan]);

  // Adding from the advice closes the loop: the suggestion lands in a real
  // workout day instead of being something to remember later.
  function addToPlan(dayId, name, goToGym) {
    if (goToGym) {
      onClose();
      setTab?.("gym");
      return;
    }
    store.addExercise(dayId, { name, sets: 3, reps: "8-12", targetWeight: "", restSec: 120, notes: "" });
  }
  const readyCount = useMemo(() => readyList(recovery, 99).filter((r) => r.status === "ready").length, [recovery]);
  const restingCount = useMemo(() => restingList(recovery).length, [recovery]);
  const legend = mode === "recovery" ? recoveryLegendItems() : legendItems(goal);

  // The weakest muscles pulse softly to draw the eye.
  const pulseGroups = useMemo(() => {
    if (!hasData) return [];
    return mode === "recovery" ? readyList(recovery, 3).map((r) => r.group) : focusList(volumes, goal, 3).map((f) => f.group);
  }, [hasData, volumes, goal, mode, recovery]);

  // Week time-lapse: step from the oldest period with data up to the latest one.
  const bounds = useMemo(() => dataBounds(sets), [sets]);
  const oldestOffset = useMemo(() => {
    if (!bounds) return 0;
    return kind === "rolling"
      ? Math.floor(daysBetween(today, bounds.min) / 7)
      : Math.max(0, Math.round(daysBetween(weekStart(today), weekStart(bounds.min)) / 7));
  }, [bounds, kind, today]);
  const latest = useMemo(() => latestOffset(sets, today, kind), [sets, today, kind]);
  const offsetRef = useRef(offset);
  useEffect(() => {
    offsetRef.current = offset;
  });
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      if (offsetRef.current <= latest) {
        setPlaying(false);
        return;
      }
      setOffset(offsetRef.current - 1);
    }, 1100);
    return () => clearInterval(id);
  }, [playing, latest]);
  const canPlay = hasData && oldestOffset > latest;
  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    setSelected(null);
    // Start from the oldest period unless the user is already partway through.
    if (offset <= latest) setOffset(oldestOffset);
    setPlaying(true);
  }

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const askView = (name) => setView((v) => ({ name, n: (v?.n || 0) + 1 }));

  function toggleDemo() {
    const next = !demo;
    setPlaying(false);
    setDemo(next);
    setSelected(null);
    // In Mon-Sun mode the demo opens on last week so it is a complete week of training.
    setOffset(next ? (kind === "week" ? 1 : 0) : latestOffset(realSets, today, kind));
  }

  function onImported(imported) {
    setDialog(null);
    setDemo(false);
    setSelected(null);
    setOffset(latestOffset(imported, today, kind));
  }

  const viewing = periodTitle(kind, offset, from, to);
  const olderThanNow = offset > 0;

  return (
    <div className="mm-overlay" role="dialog" aria-modal="true" aria-label="Muscle map">
      <div className="mm-top">
        <div className="mm-title">MUSCLE MAP</div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close muscle map">×</button>
      </div>

      <div className="mm-controls">
        <div className="slot-tabs mm-modes">
          {[["volume", "Weekly sets"], ["recovery", "Recovery"]].map(([m, label]) => (
            <button
              key={m}
              type="button"
              className={`slot-tab ${mode === m ? "active" : ""}`}
              onClick={() => { setPlaying(false); store.setMuscleMapSettings({ mode: m }); }}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "recovery" ? (
          <div className="mm-period-label mm-period-static">Days since each muscle was trained</div>
        ) : (
        <div className="mm-period">
          <button type="button" className="icon-btn" onClick={() => { setPlaying(false); setOffset(offset + 1); }} aria-label="Previous period">‹</button>
          <div className="mm-period-label">{viewing}</div>
          <button type="button" className="icon-btn" onClick={() => { setPlaying(false); setOffset(Math.max(0, offset - 1)); }} disabled={offset === 0} aria-label="Next period">›</button>
          <button type="button" className={`icon-btn mm-play ${playing ? "on" : ""}`} onClick={togglePlay} disabled={!canPlay} aria-label={playing ? "Stop the weekly time-lapse" : "Play the weekly time-lapse"} aria-pressed={playing}>
            {playing ? "■" : "▶"}
          </button>
        </div>
        )}
      </div>

      <div className="mm-stage">
        <MuscleViewer
          colors={colors}
          selected={selected}
          onSelect={setSelected}
          view={view}
          baseColor={theme.mapBase}
          floorColor={theme.mapFloor}
          pulse={pulseGroups}
          labels={labels}
        />
        <div className="mm-views">
          {[["front", "Front"], ["back", "Back"], ["left", "L"], ["right", "R"]].map(([k, l]) => (
            <button key={k} type="button" className="mm-view-btn" onClick={() => askView(k)}>{l}</button>
          ))}
          <button
            type="button"
            className={`mm-view-btn ${labels ? "on" : ""}`}
            onClick={() => setLabels(!labels)}
            aria-pressed={labels}
            aria-label={labels ? "Hide muscle names" : "Show muscle names"}
          >
            Aa
          </button>
        </div>
        <div className="mm-stats">
          {mode === "recovery" ? (
            <><strong>{readyCount}</strong> ready · <strong>{restingCount}</strong> resting</>
          ) : (
            <><strong>{volumes.counted}</strong> sets · <strong>{sessions}</strong> day{sessions === 1 ? "" : "s"}</>
          )}
        </div>
        {demo && <div className="mm-badge">DEMO DATA</div>}
      </div>

      <div className="mm-legend" role="list" aria-label="Colour legend">
        {legend.map((l) => (
          <div key={l.key} className="mm-legend-item" role="listitem">
            <span className="mm-swatch" style={{ background: l.key === "none" ? none : l.color }} />
            <span>{l.label}</span>
            <em>{l.range}</em>
          </div>
        ))}
      </div>

      <div className="mm-scroll">
        {!hasData && (
          <div className="card empty-state">
            <div className="empty-title">No training data yet</div>
            <div className="empty-desc">Import your spreadsheet, log workouts in the Gym tab, or try the demo to see how the map works.</div>
            <div className="form-actions">
              <button type="button" className="claim-btn" onClick={() => setDialog("import")}>IMPORT SPREADSHEET</button>
              <button type="button" className="claim-btn ghost" onClick={toggleDemo}>TRY DEMO</button>
            </div>
          </div>
        )}

        {hasData && olderThanNow && volumes.counted === 0 && <div className="mm-note">No sets in this period.</div>}
        {hasData && volumes.unmatched.size > 0 && (
          <div className="mm-note warn">
            {[...volumes.unmatched.values()].reduce((a, b) => a + b, 0)} sets from {volumes.unmatched.size} exercise
            {volumes.unmatched.size === 1 ? "" : "s"} aren&apos;t on the map yet.{" "}
            <button type="button" className="link-btn" onClick={() => setDialog("assign")}>Assign muscles</button>
          </div>
        )}

        {hasData && selected && (
          <GroupDetail
            group={selected}
            volumes={volumes}
            prevVolumes={prevVolumes}
            goal={goal}
            colorOf={colorOf}
            history={history}
            planNames={planNames}
            onClear={() => setSelected(null)}
            recovery={{ row: recovery.byGroup[selected], color: recoveryColorOf(recovery.byGroup[selected]) }}
            planDays={planDays}
            onAddToPlan={addToPlan}
          />
        )}
        {hasData && !selected && mode === "recovery" && <RecoveryPanel recovery={recovery} volumes={volumes} goal={goal} colorOf={recoveryColorOf} onPick={setSelected} />}
        {hasData && !selected && mode !== "recovery" && <FocusPanel volumes={volumes} goal={goal} colorOf={colorOf} onPick={setSelected} recovery={recovery} />}

        <div className="card">
          <button type="button" className="mm-settings-toggle" onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>
            <span className="card-title">Settings and data</span>
            <span>{showSettings ? "▾" : "▸"}</span>
          </button>
          {showSettings && (
            <div className="mm-settings">
              <div className="field-label">Your goal</div>
              <div className="slot-tabs">
                {GOAL_IDS.map((g) => (
                  <button key={g} type="button" className={`slot-tab ${goal === g ? "active" : ""}`} onClick={() => store.setMuscleMapSettings({ goal: g })}>
                    {GOALS[g].label}
                  </button>
                ))}
              </div>
              <p className="mm-fine">{GOALS[goal].note}</p>

              <div className="field-label">Helper sets (e.g. triceps during bench) count as</div>
              <div className="slot-tabs">
                {[[0, "0 (direct only)"], [0.5, "½ set"], [1, "1 set"]].map(([v, l]) => (
                  <button key={v} type="button" className={`slot-tab ${indirect === v ? "active" : ""}`} onClick={() => store.setMuscleMapSettings({ indirect: v })}>{l}</button>
                ))}
              </div>
              {mm.indirect != null && (
                <button type="button" className="link-btn" onClick={() => store.setMuscleMapSettings({ indirect: null })}>Use the recommended setting for this goal</button>
              )}

              <div className="field-label">Time window</div>
              <div className="slot-tabs">
                {[["week", "Mon–Sun week"], ["rolling", "Last 7 days"]].map(([k, l]) => (
                  <button key={k} type="button" className={`slot-tab ${kind === k ? "active" : ""}`} onClick={() => { store.setMuscleMapSettings({ period: k }); setOffset(latestOffset(sets, today, k)); }}>{l}</button>
                ))}
              </div>

              <div className="mm-data-actions">
                <button type="button" className="mini-btn" onClick={() => setDialog("import")}>Import spreadsheet</button>
                <button type="button" className={`mini-btn ${demo ? "" : "ghost"}`} onClick={toggleDemo}>{demo ? "Stop demo" : "Try demo data"}</button>
                {Object.keys(importedSets).length > 0 && (
                  <button
                    type="button"
                    className="mini-btn ghost"
                    onClick={() => window.confirm("Remove all imported sets? Workouts you logged in Pdash stay.") && store.clearImportedSets()}
                  >
                    Remove imported
                  </button>
                )}
              </div>
              <p className="mm-fine">
                Warm-up sets are left out. Targets come from training-volume research and are general guidance, not medical advice.
              </p>
            </div>
          )}
          <p className="mm-fine mm-credit">
            3D model: Z-Anatomy / BodyParts3D (Database Center for Life Science), CC BY-SA 4.0.
          </p>
        </div>
      </div>

      {dialog === "import" && <ImportDialog store={store} onClose={() => setDialog(null)} onImported={onImported} />}
      {dialog === "assign" && <AssignDialog unmatched={volumes.unmatched} store={store} onClose={() => setDialog(null)} />}
    </div>
  );
}
