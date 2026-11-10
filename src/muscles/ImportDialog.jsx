import { useMemo, useState } from "react";
import { LIBRARY, exerciseKey } from "./exercises";
import { GROUP_IDS, groupLabel } from "./taxonomy";
import {
  combineSheets,
  groupByDate,
  guessMapping,
  inferDateOrder,
  readFileSheets,
  rowsToSets,
  summarizeExercises,
  tableFromRows,
} from "./importer";

const FIELD_LABEL = {
  date: "Date",
  exercise: "Exercise",
  weight: "Weight",
  reps: "Reps",
  sets: "Number of sets",
  warmup: "Warm-up flag",
};
const FIELD_HELP = {
  date: "required",
  exercise: "required",
  weight: "optional",
  reps: "optional",
  sets: "only if one row covers several sets",
  warmup: "optional",
};

const TEMPLATE = [
  "Date,Exercise,Sets,Reps,Weight (kg)",
  "2026-11-02,Bench Press,4,8,80",
  "2026-11-02,Lat Pulldown,3,10,60",
  "2026-11-04,Squat,4,6,100",
  "2026-11-04,Leg Curl,3,12,40",
  "2026-11-06,Overhead Press,3,8,45",
  "",
].join("\n");

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "pdash-workouts-template.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const nextRole = (r) => (r === "direct" ? "indirect" : r === "indirect" ? undefined : "direct");

// Rows for exercises the library can't place: pick a similar exercise or tap muscles.
export function ExerciseAssignRows({ rows, draft, onChange }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="mm-assign">
      {rows.map((r) => {
        const key = exerciseKey(r.name);
        const muscles = draft[key] || {};
        const done = Object.keys(muscles).length > 0;
        return (
          <div key={key} className={`mm-assign-row ${done ? "done" : ""}`}>
            <div className="mm-assign-head">
              <div>
                <div className="mm-assign-name">{r.name}</div>
                <div className="mm-assign-sub">
                  {r.sets} set{r.sets === 1 ? "" : "s"} · {done ? Object.keys(muscles).map(groupLabel).join(", ") : "not assigned yet"}
                </div>
              </div>
              <button type="button" className="mini-btn ghost" onClick={() => setOpen(open === key ? null : key)}>
                {open === key ? "Done" : done ? "Edit" : "Assign"}
              </button>
            </div>
            {open === key && (
              <div className="mm-assign-edit">
                <label className="field">
                  <span>Same muscles as…</span>
                  <select
                    className="meal-input"
                    value=""
                    onChange={(e) => {
                      const hit = LIBRARY.find((x) => x.id === e.target.value);
                      if (hit) onChange(r.name, { ...hit.muscles });
                    }}
                  >
                    <option value="">Pick a similar exercise</option>
                    {[...LIBRARY].sort((a, b) => a.name.localeCompare(b.name)).map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </label>
                <div className="field-label">Or tap muscles: once = main muscle, twice = helper</div>
                <div className="mm-chip-grid">
                  {GROUP_IDS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`mm-chip ${muscles[g] || ""}`}
                      onClick={() => {
                        const next = { ...muscles };
                        const role = nextRole(muscles[g]);
                        if (role) next[g] = role;
                        else delete next[g];
                        onChange(r.name, next);
                      }}
                    >
                      {muscles[g] === "direct" ? "● " : muscles[g] === "indirect" ? "◐ " : ""}
                      {groupLabel(g)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Standalone: assign muscles to exercises already in the data that aren't placed yet.
export function AssignDialog({ unmatched, store, onClose }) {
  const [draft, setDraft] = useState({});
  const rows = useMemo(() => [...unmatched].map(([name, sets]) => ({ name, sets })), [unmatched]);
  const update = (name, muscles) => setDraft((d) => ({ ...d, [exerciseKey(name)]: muscles }));

  function save() {
    for (const [key, muscles] of Object.entries(draft)) store.setExerciseMuscles(key, muscles);
    onClose();
  }

  return (
    <div className="mm-dialog-backdrop" onClick={onClose}>
      <div className="mm-dialog" role="dialog" aria-modal="true" aria-label="Assign muscles" onClick={(e) => e.stopPropagation()}>
        <div className="card-title">Assign muscles</div>
        <p className="backup-note">These exercises aren&apos;t in the built-in library, so their sets aren&apos;t on the map yet.</p>
        <ExerciseAssignRows rows={rows} draft={draft} onChange={update} />
        <div className="form-actions">
          <button type="button" className="claim-btn" onClick={save} disabled={!Object.keys(draft).length}>SAVE</button>
          <button type="button" className="claim-btn ghost" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

export default function ImportDialog({ store, onClose, onImported }) {
  const [stage, setStage] = useState("pick");
  const [sheets, setSheets] = useState([]);
  const [fileName, setFileName] = useState("");
  const [choice, setChoice] = useState("0");
  const [mapping, setMapping] = useState(null);
  const [unit, setUnit] = useState("kg");
  const [rirScale, setRirScale] = useState("rir");
  const [order, setOrder] = useState({ order: "dmy", ambiguous: false });
  const [draft, setDraft] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const tableFor = (list, ch) => (ch === "all" ? combineSheets(list) : tableFromRows(list[Number(ch)]?.rows || []));
  const table = useMemo(
    () => (sheets.length ? (choice === "all" ? combineSheets(sheets) : tableFromRows(sheets[Number(choice)]?.rows || [])) : { headers: [], body: [] }),
    [sheets, choice]
  );

  function initFrom(t) {
    const g = guessMapping(t.headers);
    setMapping(g.mapping);
    setUnit(g.unit);
    setRirScale(g.rirScale);
    setOrder(inferDateOrder(g.mapping.date >= 0 ? t.body.map((r) => r[g.mapping.date]) : []));
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const read = (await readFileSheets(file)).filter((s) => s.rows.length);
      if (!read.length) throw new Error("That file looks empty.");
      const combined = combineSheets(read);
      const biggest = read.reduce((best, s, i) => (s.rows.length > read[best].rows.length ? i : best), 0);
      const ch = read.length > 1 && combined.used.length > 1 ? "all" : String(biggest);
      initFrom(tableFor(read, ch));
      setSheets(read);
      setChoice(ch);
      setFileName(file.name);
      setDraft({});
      setStage("review");
    } catch (err) {
      setError(err.message || "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  function chooseSheet(ch) {
    setChoice(ch);
    initFrom(tableFor(sheets, ch));
  }

  function setField(field, value) {
    const col = Number(value);
    setMapping((m) => ({ ...m, [field]: col }));
    if (field === "date" && col >= 0) setOrder(inferDateOrder(table.body.map((r) => r[col])));
  }

  const ready = !!mapping && mapping.date >= 0 && mapping.exercise >= 0;
  const result = useMemo(
    () => (ready ? rowsToSets(table.body, mapping, { order: order.order, unit, rirScale }) : { sets: [], skipped: [], suspect: [] }),
    [ready, table, mapping, order.order, unit, rirScale]
  );
  const overrides = store.state.exerciseMuscles;
  // Rows to assign come from the data alone, so a row stays visible (showing what was
  // picked) after it has been assigned instead of vanishing.
  const exercises = useMemo(() => summarizeExercises(result.sets, overrides), [result.sets, overrides]);
  const unmatched = exercises.filter((e) => !e.match);
  const stillUnassigned = unmatched.filter((e) => !Object.keys(draft[exerciseKey(e.name)] || {}).length).length;
  const dates = result.sets.map((s) => s.date).sort();
  const update = (name, muscles) => setDraft((d) => ({ ...d, [exerciseKey(name)]: muscles }));

  function confirm() {
    for (const [key, muscles] of Object.entries(draft)) store.setExerciseMuscles(key, muscles);
    store.importWorkoutSets(groupByDate(result.sets));
    onImported(result.sets);
  }

  return (
    <div className="mm-dialog-backdrop" onClick={onClose}>
      <div className="mm-dialog" role="dialog" aria-modal="true" aria-label="Import workouts" onClick={(e) => e.stopPropagation()}>
        <div className="card-title">Import workouts</div>

        {stage === "pick" && (
          <>
            <p className="backup-note">
              Choose a spreadsheet (.xlsx or .csv) with one row per set, or one row per exercise with a number of sets.
              It is read on this device and only the sets are saved. In Google Sheets: File &gt; Download.
            </p>
            <label className="claim-btn file-pick">
              {busy ? "READING…" : "CHOOSE FILE"}
              <input type="file" accept=".xlsx,.csv,.tsv,.txt" onChange={onFile} disabled={busy} hidden />
            </label>
            <button type="button" className="link-btn done-link" onClick={downloadTemplate}>Download a sample template (.csv)</button>
            {error && <div className="form-msg err">{error}</div>}
            <button type="button" className="claim-btn ghost" onClick={onClose}>CANCEL</button>
          </>
        )}

        {stage === "review" && mapping && (
          <>
            <p className="backup-note">{fileName}: {table.body.length} rows</p>

            {sheets.length > 1 && (
              <label className="field">
                <span>Sheet</span>
                <select className="meal-input" value={choice} onChange={(e) => chooseSheet(e.target.value)}>
                  <option value="all">All sheets that share the same columns</option>
                  {sheets.map((s, i) => (
                    <option key={i} value={String(i)}>{s.name}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="field-label">Which column is which?</div>
            <div className="mm-map">
              {Object.keys(FIELD_LABEL).map((f) => (
                <label key={f} className="mm-map-row">
                  <span>
                    {FIELD_LABEL[f]} <em>{FIELD_HELP[f]}</em>
                  </span>
                  <select className="meal-input" value={mapping[f]} onChange={(e) => setField(f, e.target.value)}>
                    <option value={-1}>{f === "date" || f === "exercise" ? "Choose a column" : "Not in my sheet"}</option>
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="mm-opts">
              <div>
                <div className="field-label">Weight unit</div>
                <div className="slot-tabs">
                  {["kg", "lb"].map((u) => (
                    <button key={u} type="button" className={`slot-tab ${unit === u ? "active" : ""}`} onClick={() => setUnit(u)}>{u}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="field-label">Dates written as</div>
                <div className="slot-tabs">
                  {[["dmy", "Day/Month"], ["mdy", "Month/Day"]].map(([k, l]) => (
                    <button key={k} type="button" className={`slot-tab ${order.order === k ? "active" : ""}`} onClick={() => setOrder({ ...order, order: k })}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
            {order.ambiguous && (
              <div className="form-msg ok">Some dates (like 03/04/2026) could be read either way. Check the date range below.</div>
            )}

            {ready && (
              <div className="mm-review">
                <div className="mm-review-line">
                  <strong>{result.sets.length}</strong> sets from <strong>{new Set(dates).size}</strong> days
                  {dates.length > 0 && <> · {dates[0]} to {dates.at(-1)}</>}
                </div>
                {result.suspect?.length > 0 && (
                  <div className="mm-review-sub warn">
                    {result.suspect.length} row{result.suspect.length === 1 ? "" : "s"} with an odd date
                    {" "}(row {result.suspect[0].line}: &quot;{result.suspect[0].raw}&quot; {result.suspect[0].reason})
                    {" "}&mdash; check for a mistyped year before importing.
                  </div>
                )}
                {result.skipped.length > 0 && (
                  <div className="mm-review-sub">
                    {result.skipped.length} row{result.skipped.length === 1 ? "" : "s"} skipped
                    {" "}(e.g. row {result.skipped[0].line}: {result.skipped[0].reason})
                  </div>
                )}
                <div className="mm-review-sub">
                  {exercises.length - unmatched.length} of {exercises.length} exercises recognised
                  {unmatched.length > 0 &&
                    (stillUnassigned > 0 ? ` · ${stillUnassigned} still need a muscle` : " · all assigned")}
                </div>
                <div className="mm-review-sub">Dates in this file replace anything imported earlier for the same dates.</div>
              </div>
            )}
            {unmatched.length > 0 && <ExerciseAssignRows rows={unmatched} draft={draft} onChange={update} />}

            <div className="form-actions">
              <button type="button" className="claim-btn" onClick={confirm} disabled={!ready || !result.sets.length}>
                IMPORT {result.sets.length || ""} SETS
              </button>
              <button type="button" className="claim-btn ghost" onClick={onClose}>CANCEL</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
