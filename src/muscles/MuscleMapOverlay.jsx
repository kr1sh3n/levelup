import { useEffect, useMemo, useRef, useState } from "react";
import MuscleViewer from "./MuscleViewer";
import ImportDialog, { AssignDialog } from "./ImportDialog";
import { GROUP_IDS, MUSCLE_GROUPS, groupLabel } from "./taxonomy";
import { GOALS, GOAL_IDS, SCHEMES, SCHEME_IDS, ZONE_KEYS, ZONE_LABEL, colorFor, goalOf, legendItems, schemeOf, zoneFor } from "./targets";
import { collectSets, computeVolumes, dataBounds, daysBetween, latestOffset, makeResolver, periodRange, rangeLabel, weekStart, weeklyHistory } from "./volume";
import { makeDemoSets } from "./demo";
import { LIBRARY, resolveExercise } from "./exercises";
import { balanceChecks, describeGroup, focusList, overList, suggestExercises, targetBand } from "./insights";
import { THEMES, themeOf } from "../themes";

const round1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function periodTitle(kind, offset, from, to) {
  if (kind === "rolling") return offset === 0 ? `Last 7 days · ${rangeLabel(from, to)}` : `7 days to ${rangeLabel(from, to).split("–").at(-1)}`;
  if (offset === 0) return `This week · ${rangeLabel(from, to)}`;
  if (offset === 1) return `Last week · ${rangeLabel(from, to)}`;
  return `Week of ${rangeLabel(from, to)}`;
}

// A bar from 0 to the "very high" threshold, coloured by zone, with a marker at `value`.
function BandBar({ value, goal, scheme }) {
  const from = GOALS[goalOf(goal)].from;
  const cap = from.extreme * 1.15;
  const stops = ZONE_KEYS.map((z, i) => {
    const start = (from[z] / cap) * 100;
    const end = i + 1 < ZONE_KEYS.length ? (from[ZONE_KEYS[i + 1]] / cap) * 100 : 100;
    return `${colorFor(Math.max(from[z], 0.5), goal, scheme)} ${start}% ${end}%`;
  });
  return (
    <div className="mm-band" style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }}>
      <div className="mm-band-marker" style={{ left: `${Math.min(100, (value / cap) * 100)}%` }} />
    </div>
  );
}

function GroupDetail({ group, volumes, prevVolumes, goal, scheme, colorOf, history, planNames, onClear, onPreview }) {
  const v = volumes.byGroup[group];
  const p = prevVolumes.byGroup[group];
  const info = describeGroup(group, volumes, goal);
  const { min, max } = targetBand(goal);
  const delta = round1(v.effective - p.effective);
  const color = colorOf(v.effective);
  const exercises = [...v.exercises.values()].sort((a, b) => b.direct * 2 + b.indirect - (a.direct * 2 + a.indirect));
  const suggestions = v.effective < min ? suggestExercises(group, planNames) : [];
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
      <BandBar value={v.effective} goal={goal} scheme={scheme} />
      <div className="mm-band-legend">
        <span>0</span>
        <span>{min}</span>
        <span>{max}</span>
        <span>{GOALS[goalOf(goal)].from.extreme}+</span>
      </div>

      <p className="mm-advice">{info.summary}. {info.advice}</p>

      <div className="mm-facts">
        <div><strong>{v.direct}</strong> direct</div>
        <div><strong>{v.indirect}</strong> indirect</div>
        <div><strong>{v.days.size}</strong> day{v.days.size === 1 ? "" : "s"}</div>
        <div className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>
          <strong>{delta > 0 ? "+" : ""}{fmt(delta)}</strong> vs before
        </div>
      </div>

      {exercises.length > 0 && (
        <>
          <div className="field-label">What counted</div>
          {exercises.slice(0, 6).map((e) => (
            <button key={e.name} type="button" className="mm-ex-row mm-ex-btn" onClick={() => onPreview(e.name)} aria-label={`Preview ${e.name}`}>
              <span>▶ {e.name}</span>
              <span>{e.direct ? `${e.direct} direct` : ""}{e.direct && e.indirect ? " + " : ""}{e.indirect ? `${e.indirect} helper` : ""}</span>
            </button>
          ))}
        </>
      )}

      <div className="field-label">Last 8 weeks</div>
      <div className="mm-history" aria-hidden="true">
        {history.map((w, i) => (
          <div key={w.from} className="mm-history-col" title={`${w.from}: ${fmt(round1(w.totals[group]))} sets`}>
            <div
              className={`mm-history-bar ${i === history.length - 1 ? "last" : ""}`}
              style={{ height: `${Math.max(3, (w.totals[group] / top) * 100)}%`, background: colorOf(w.totals[group]) }}
            />
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <>
          <div className="field-label">Ways to add volume</div>
          <div className="suggest-row">
            {suggestions.map((s) => (
              <span key={s.name} className="suggest-chip static">
                {s.name}{s.inPlan ? " (in your plan)" : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FocusPanel({ volumes, goal, colorOf, onPick }) {
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
            <span className="mm-focus-name">{f.label}</span>
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

export default function MuscleMapOverlay({ store, onClose }) {
  const { state, today } = store;
  const mm = state.muscleMap;
  const goal = goalOf(mm.goal);
  const scheme = schemeOf(mm.scheme);
  const indirect = mm.indirect ?? GOALS[goal].indirect;
  const kind = mm.period === "week" ? "week" : "rolling";
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
  const [previewName, setPreviewName] = useState(null);
  const [playing, setPlaying] = useState(false);

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
  const colorOf = useMemo(() => (value) => (value > 0 ? colorFor(value, goal, scheme) : none), [goal, scheme, none]);
  const colors = useMemo(
    () => Object.fromEntries(GROUP_IDS.map((g) => [g, colorOf(volumes.byGroup[g].effective)])),
    [volumes, colorOf]
  );
  const history = useMemo(
    () => (selected ? weeklyHistory(sets, weekStart(to), 8, { resolve: resolver, indirect }) : []),
    [selected, sets, to, resolver, indirect]
  );
  const sessions = useMemo(() => new Set(sets.filter((s) => !s.warmup && s.date >= from && s.date <= to).map((s) => s.date)).size, [sets, from, to]);
  const planNames = useMemo(() => workoutPlan.days.flatMap((d) => d.exercises.map((e) => e.name)), [workoutPlan]);
  const legend = legendItems(goal, scheme);

  // Exercise preview: the muscles an exercise works, split into main and helper.
  const previewInfo = useMemo(() => {
    if (!previewName) return null;
    const r = resolveExercise(previewName, exerciseMuscles);
    if (!r) return { name: previewName, primary: [], secondary: [] };
    const groups = Object.entries(r.muscles);
    return {
      name: r.name,
      primary: groups.filter(([, role]) => role === "direct").map(([g]) => g),
      secondary: groups.filter(([, role]) => role !== "direct").map(([g]) => g),
    };
  }, [previewName, exerciseMuscles]);
  // The weakest muscles pulse softly, except while an exercise preview is playing.
  const pulseGroups = useMemo(() => (hasData ? focusList(volumes, goal, 3).map((f) => f.group) : []), [hasData, volumes, goal]);
  const exerciseOptions = useMemo(() => [...new Set([...planNames, ...LIBRARY.map((e) => e.name)])].sort((a, b) => a.localeCompare(b)), [planNames]);

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
    setPreviewName(null);
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
    setPreviewName(null);
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
        <div className="mm-period">
          <button type="button" className="icon-btn" onClick={() => { setPlaying(false); setOffset(offset + 1); }} aria-label="Previous period">‹</button>
          <div className="mm-period-label">{viewing}</div>
          <button type="button" className="icon-btn" onClick={() => { setPlaying(false); setOffset(Math.max(0, offset - 1)); }} disabled={offset === 0} aria-label="Next period">›</button>
          <button type="button" className={`icon-btn mm-play ${playing ? "on" : ""}`} onClick={togglePlay} disabled={!canPlay} aria-label={playing ? "Stop the weekly time-lapse" : "Play the weekly time-lapse"} aria-pressed={playing}>
            {playing ? "■" : "▶"}
          </button>
        </div>
        <div className="slot-tabs mm-schemes">
          {SCHEME_IDS.map((s) => (
            <button key={s} type="button" className={`slot-tab ${scheme === s ? "active" : ""}`} onClick={() => store.setMuscleMapSettings({ scheme: s })}>
              {SCHEMES[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mm-stage">
        <MuscleViewer
          colors={colors}
          selected={selected}
          onSelect={setSelected}
          view={view}
          baseColor={theme.mapBase}
          floorColor={theme.mapFloor}
          preview={previewInfo}
          pulse={pulseGroups}
        />
        <div className="mm-views">
          {[["front", "Front"], ["back", "Back"], ["left", "L"], ["right", "R"]].map(([k, l]) => (
            <button key={k} type="button" className="mm-view-btn" onClick={() => askView(k)}>{l}</button>
          ))}
        </div>
        <div className="mm-stats">
          <strong>{volumes.counted}</strong> sets · <strong>{sessions}</strong> day{sessions === 1 ? "" : "s"}
        </div>
        {demo && <div className="mm-badge">DEMO DATA</div>}
        {previewInfo && (
          <div className="mm-preview-chip">
            <span>{previewInfo.name}</span>
            <button type="button" onClick={() => setPreviewName(null)} aria-label="Stop exercise preview">×</button>
          </div>
        )}
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

        <div className="card mm-preview-card">
          <div className="card-title">Exercise preview</div>
          <div className="mm-preview-row">
            <select className="meal-input" value={previewName || ""} onChange={(e) => { setPlaying(false); setPreviewName(e.target.value || null); }} aria-label="Pick an exercise to preview">
              <option value="">Pick an exercise…</option>
              {exerciseOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {previewName && <button type="button" className="claim-btn ghost" onClick={() => setPreviewName(null)}>STOP</button>}
          </div>
          {previewInfo ? (
            <div className="mm-preview-legend">
              {previewInfo.primary.length === 0 && previewInfo.secondary.length === 0 ? (
                <span>This exercise isn&apos;t mapped to a muscle yet.</span>
              ) : (
                <>
                  {previewInfo.primary.length > 0 && <span><b>Main:</b> {previewInfo.primary.map(groupLabel).join(", ")}</span>}
                  {previewInfo.secondary.length > 0 && <span><b>Helpers:</b> {previewInfo.secondary.map(groupLabel).join(", ")}</span>}
                </>
              )}
            </div>
          ) : (
            <div className="mm-fine">See which muscles an exercise works. Main muscles swell and glow, helpers glow softly.</div>
          )}
        </div>

        {hasData && selected && (
          <GroupDetail
            group={selected}
            volumes={volumes}
            prevVolumes={prevVolumes}
            goal={goal}
            scheme={scheme}
            colorOf={colorOf}
            history={history}
            planNames={planNames}
            onClear={() => setSelected(null)}
            onPreview={(n) => { setPlaying(false); setPreviewName(n); }}
          />
        )}
        {hasData && !selected && <FocusPanel volumes={volumes} goal={goal} colorOf={colorOf} onPick={setSelected} />}

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
