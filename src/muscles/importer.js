// Spreadsheet import: CSV / XLSX rows -> sets per day.
// Pure functions except readFileSheets (which reads a File in the browser).

import { resolveExercise } from "./exercises";

const pad = (n) => String(n).padStart(2, "0");

function validYmd(y, m, d) {
  if (y < 1990 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// ── CSV ─────────────────────────────────────────────────────────────────────
// Excel's "CSV UTF-8" starts the file with a byte-order mark.
const BOM = String.fromCharCode(0xfeff);
const stripBom = (text) => (text.startsWith(BOM) ? text.slice(1) : text);

function countOutsideQuotes(line, delim) {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === delim && !q) n++;
  }
  return n;
}

export function detectDelimiter(text) {
  const line = stripBom(text).split(/\r?\n/).find((l) => l.trim()) || "";
  const best = [",", ";", "\t"].map((d) => [d, countOutsideQuotes(line, d)]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const s = stripBom(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      endRow();
    } else cell += ch;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

// ── Files ───────────────────────────────────────────────────────────────────
// -> [{ name, rows }]; rows are arrays of string | number | Date | null.
export async function readFileSheets(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    const sheets = await readExcelFile(file);
    return sheets.map((s) => ({ name: s.sheet, rows: s.data }));
  }
  if (/\.(csv|tsv|txt)$/.test(name)) {
    return [{ name: "Sheet", rows: parseDelimited(await file.text()) }];
  }
  throw new Error("Please choose a .xlsx or .csv file. In Google Sheets or Excel: File > Download > CSV.");
}

const isBlank = (c) => c === "" || c == null;
const cellStr = (c) => (c instanceof Date ? "" : String(c ?? "").trim());

// Finds the header row: the first of the opening rows with 3+ filled cells that are mostly text.
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const filled = rows[i].filter((c) => !isBlank(c));
    const texty = filled.filter((c) => typeof c === "string" && /[a-z]/i.test(c) && Number.isNaN(Number(c)));
    if (filled.length >= 3 && texty.length >= Math.ceil(filled.length * 0.7)) return i;
  }
  return 0;
}

const normHeader = (h) => cellStr(h).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// -> { headers, body } for one sheet.
export function tableFromRows(rows) {
  if (!rows.length) return { headers: [], body: [] };
  const h = findHeaderRow(rows);
  return { headers: rows[h].map(cellStr), body: rows.slice(h + 1) };
}

// Joins several sheets that share the same columns (e.g. one tab per month).
export function combineSheets(sheets) {
  const tables = sheets.map((s) => ({ name: s.name, ...tableFromRows(s.rows) })).filter((t) => t.headers.length);
  if (!tables.length) return { headers: [], body: [], used: [], skipped: [] };
  const key = (t) => t.headers.map(normHeader).join("|");
  const first = key(tables[0]);
  const used = [];
  const skipped = [];
  const body = [];
  for (const t of tables) {
    if (key(t) === first) {
      used.push(t.name);
      body.push(...t.body);
    } else skipped.push(t.name);
  }
  return { headers: tables[0].headers, body, used, skipped };
}

// ── Column mapping ──────────────────────────────────────────────────────────
export const FIELDS = ["date", "exercise", "weight", "reps", "sets", "rir", "warmup"];

const RULES = {
  date: [/\b(date|datetime|timestamp)\b/, /^(start time|day)$/],
  exercise: [/\b(exercise|movement|lift)\b/, /^name$/],
  weight: [/\b(weight|load|kg|lbs?|pounds?)\b/],
  reps: [/\b(reps?|repetitions)\b/],
  sets: [/^(sets|no of sets|number of sets|sets completed|total sets|set count|working sets)$/],
  rir: [/\brir\b/, /reps? in reserve/, /^rpe$/],
  warmup: [/warm/, /^(set type|type)$/],
};

// -> { mapping: { field: columnIndex | -1 }, unit: "kg" | "lb" }
export function guessMapping(headers) {
  const norm = headers.map(normHeader);
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, -1]));
  const taken = new Set();
  for (const field of FIELDS) {
    for (const re of RULES[field]) {
      const i = norm.findIndex((h, idx) => !taken.has(idx) && re.test(h));
      if (i >= 0) {
        mapping[field] = i;
        taken.add(i);
        break;
      }
    }
  }
  const wh = mapping.weight >= 0 ? norm[mapping.weight] : "";
  // An RPE column is the same idea upside down (RPE 10 = nothing left = RIR 0),
  // so remember which scale the sheet uses and convert on the way in.
  const rh = mapping.rir >= 0 ? norm[mapping.rir] : "";
  return {
    mapping,
    unit: /\b(lb|lbs|pound|pounds)\b/.test(wh) ? "lb" : "kg",
    rirScale: /\brpe\b/.test(rh) ? "rpe" : "rir",
  };
}

// ── Cell parsing ────────────────────────────────────────────────────────────
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const monthNum = (s) => MONTHS[s.slice(0, 4).toLowerCase()] || MONTHS[s.slice(0, 3).toLowerCase()] || null;

export function parseDateCell(v, order = "dmy") {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const atUtcMidnight = v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0;
    return atUtcMidnight
      ? validYmd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate())
      : validYmd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return validYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s,].*)?$/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})(?:[T\s,].*)?$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return order === "mdy" ? validYmd(y, a, b) : validYmd(y, b, a);
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{2,4})/);
  if (m && monthNum(m[2])) return validYmd(+m[3] < 100 ? 2000 + +m[3] : +m[3], monthNum(m[2]), +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})/);
  if (m && monthNum(m[1])) return validYmd(+m[3] < 100 ? 2000 + +m[3] : +m[3], monthNum(m[1]), +m[2]);
  if (/^\d{5}$/.test(s)) return parseDateCell(Number(s));
  return null;
}

// Looks at the date column to decide day-first vs month-first.
// -> { order: "dmy" | "mdy", ambiguous }
export function inferDateOrder(cells) {
  let dayFirst = false;
  let monthFirst = false;
  let numeric = 0;
  for (const c of cells) {
    if (typeof c !== "string") continue;
    const m = c.trim().match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
    if (!m) continue;
    numeric++;
    if (+m[1] > 12) dayFirst = true;
    if (+m[2] > 12) monthFirst = true;
  }
  if (dayFirst && !monthFirst) return { order: "dmy", ambiguous: false };
  if (monthFirst && !dayFirst) return { order: "mdy", ambiguous: false };
  return { order: "dmy", ambiguous: numeric > 0 };
}

export function parseNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v ?? "").trim().replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const isWarmupCell = (v) => /^(1|true|yes|y|w|warm.?up|warm up)$/i.test(String(v ?? "").trim());

// ── Rows -> sets ────────────────────────────────────────────────────────────
// -> { sets: [{ date, name, weight, reps, warmup }], skipped: [{ line, reason }] }
// A sheet may record either reps in reserve or RPE; both end up as RIR.
function toRir(value, scale) {
  if (value == null || Number.isNaN(value)) return null;
  const n = scale === "rpe" ? 10 - value : value;
  return Math.max(0, Math.min(10, Math.round(n)));
}

export function rowsToSets(body, mapping, { order = "dmy", unit = "kg", rirScale = "rir" } = {}) {
  const sets = [];
  const skipped = [];
  body.forEach((row, i) => {
    if (row.every(isBlank)) return;
    const line = i + 2;
    const name = mapping.exercise >= 0 ? cellStr(row[mapping.exercise]) : "";
    if (!name) {
      skipped.push({ line, reason: "no exercise name" });
      return;
    }
    const rawDate = mapping.date >= 0 ? row[mapping.date] : null;
    const date = parseDateCell(rawDate, order);
    if (!date) {
      skipped.push({ line, reason: `couldn't read the date "${cellStr(rawDate)}"` });
      return;
    }
    let weight = mapping.weight >= 0 ? parseNumber(row[mapping.weight]) : null;
    if (weight != null && unit === "lb") weight = Math.round(weight * 0.45359237 * 10) / 10;
    const reps = mapping.reps >= 0 ? parseNumber(row[mapping.reps]) : null;

    let count = 1;
    if (mapping.sets >= 0) {
      count = Math.round(parseNumber(row[mapping.sets]) ?? 0);
      if (count < 1) {
        skipped.push({ line, reason: "no set count" });
        return;
      }
      count = Math.min(count, 30);
    } else if (reps == null && weight == null) {
      skipped.push({ line, reason: "no reps or weight" });
      return;
    }
    const warmup = mapping.warmup >= 0 && isWarmupCell(row[mapping.warmup]);
    const rir = mapping.rir >= 0 ? toRir(parseNumber(row[mapping.rir]), rirScale) : null;
    for (let k = 0; k < count; k++) {
      sets.push({ date, name, weight: weight ?? 0, reps: reps ?? 0, warmup, rir });
    }
  });
  return { sets, skipped };
}

export function groupByDate(sets) {
  const out = {};
  for (const s of sets) {
    const row = { name: s.name, weight: s.weight, reps: s.reps };
    if (s.warmup) row.warmup = true;
    if (s.rir != null) row.rir = s.rir;
    (out[s.date] ||= []).push(row);
  }
  return out;
}

// Per distinct exercise name: how many sets, and which muscles it resolves to (null = unknown).
export function summarizeExercises(sets, overrides = {}) {
  const map = new Map();
  for (const s of sets) {
    if (s.warmup) continue;
    const e = map.get(s.name) || { name: s.name, sets: 0 };
    e.sets++;
    map.set(s.name, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, match: resolveExercise(e.name, overrides) }))
    .sort((a, b) => Number(!!a.match) - Number(!!b.match) || b.sets - a.sets);
}
