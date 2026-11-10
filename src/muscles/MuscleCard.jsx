import { lazy, Suspense, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GROUP_IDS, groupLabel } from "./taxonomy";
import { GOALS, colorFor, goalOf, schemeOf } from "./targets";
import { collectSets, computeVolumes, latestOffset, periodRange, rangeLabel } from "./volume";
import { focusList } from "./insights";

// The 3D viewer (and three.js) is only downloaded when the map is opened.
const loadOverlay = () => import("./MuscleMapOverlay");
const MuscleMapOverlay = lazy(loadOverlay);

export default function MuscleCard({ store }) {
  const { state, today } = store;
  const [open, setOpen] = useState(false);
  const mm = state.muscleMap;
  const goal = goalOf(mm.goal);
  const scheme = schemeOf(mm.scheme);
  const indirect = mm.indirect ?? GOALS[goal].indirect;
  const kind = mm.period === "week" ? "week" : "rolling";
  const { workoutLogs, importedSets, workoutPlan, exerciseMuscles } = state;

  const summary = useMemo(() => {
    const sets = collectSets({ workoutLogs, importedSets, workoutPlan });
    if (!sets.length) return null;
    const offset = latestOffset(sets, today, kind);
    const { from, to } = periodRange(kind, today, offset);
    const v = computeVolumes(sets, { from, to, overrides: exerciseMuscles, indirect });
    const top = GROUP_IDS.filter((g) => v.byGroup[g].effective > 0)
      .sort((a, b) => v.byGroup[b].effective - v.byGroup[a].effective)
      .slice(0, 3);
    const label =
      kind === "rolling"
        ? offset === 0 ? "Last 7 days" : `7 days to ${rangeLabel(from, to).split("–").at(-1)}`
        : offset === 0 ? "This week" : `Week of ${rangeLabel(from, to)}`;
    return { offset, label, v, top, focus: focusList(v, goal, 3) };
  }, [workoutLogs, importedSets, workoutPlan, exerciseMuscles, today, indirect, goal, kind]);

  return (
    <div className="card">
      <div className="card-title">Muscle Map</div>
      {!summary ? (
        <p className="backup-note">
          See every muscle on a 3D body, coloured by how many sets you&apos;ve done, with research-based advice on where to focus.
          Import your training spreadsheet or log workouts in Gym.
        </p>
      ) : (
        <>
          <div className="mm-card-period">{summary.label}</div>
          <div className="mm-card-row">
            <span className="mm-card-label">Most trained</span>
            <span className="mm-card-chips">
              {summary.top.map((g) => (
                <span key={g} className="mm-card-chip" style={{ borderColor: colorFor(summary.v.byGroup[g].effective, goal, scheme) }}>
                  {groupLabel(g)} {Math.round(summary.v.byGroup[g].effective * 10) / 10}
                </span>
              ))}
            </span>
          </div>
          {summary.focus.length > 0 && (
            <div className="mm-card-row">
              <span className="mm-card-label">Focus on</span>
              <span className="mm-card-chips">
                {summary.focus.map((f) => (
                  <span key={f.group} className="mm-card-chip" style={{ borderColor: colorFor(f.effective, goal, scheme) }}>
                    {f.label} {Math.round(f.effective * 10) / 10}
                  </span>
                ))}
              </span>
            </div>
          )}
        </>
      )}
      <button type="button" className="claim-btn" onMouseEnter={loadOverlay} onFocus={loadOverlay} onClick={() => setOpen(true)}>
        OPEN MUSCLE MAP
      </button>
      {/* Portalled to <body>: the card's hover transform would otherwise trap a fixed overlay inside it. */}
      {open &&
        createPortal(
          <Suspense fallback={<div className="mm-overlay mm-loading">Loading 3D…</div>}>
            <MuscleMapOverlay store={store} onClose={() => setOpen(false)} />
          </Suspense>,
          document.body
        )}
    </div>
  );
}
