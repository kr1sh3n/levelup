// Exercise -> muscle library and the matcher that maps the free-text names in
// a workout log ("DB Shoulder Press", "Bench Press (Barbell)") onto it.
//
// A muscle's role is "direct" (prime mover, counts as a full set) or "indirect"
// (assisting, counted at a configurable fraction - see volume.js).

import { isGroup } from "./taxonomy";

// [name, aliases separated by "|", direct groups, indirect groups]
const RAW = [
  // Chest
  ["Bench Press", "bench|flat bench press|flat chest press|flat dumbbell press|flat db press|dumbbell bench press|smith machine bench press|flat smith machine press|paused bench press", "chest", "front_delts triceps"],
  ["Incline Bench Press", "incline press|incline chest press|low incline press", "chest", "front_delts triceps"],
  ["Decline Bench Press", "decline press", "chest", "triceps front_delts"],
  ["Chest Press", "machine chest press|hammer strength chest press|converging chest press", "chest", "front_delts triceps"],
  ["Push Up", "pushup|press up|diamond push up|incline push up|decline push up", "chest", "front_delts triceps abs"],
  ["Dip", "chest dip|parallel bar dip|tricep dip|weighted dip", "chest triceps", "front_delts"],
  ["Bench Dip", "triceps bench dip", "triceps", "chest front_delts"],
  ["Chest Fly", "fly|flye|pec fly|pec deck|cable fly|cable crossover|crossover|incline fly|dumbbell fly|machine fly", "chest", "front_delts"],
  ["Pullover", "dumbbell pullover|cable pullover", "lats", "chest triceps"],
  ["Landmine Press", "", "front_delts chest", "triceps"],
  // Shoulders
  ["Overhead Press", "ohp|shoulder press|military press|arnold press|push press|machine shoulder press", "front_delts", "side_delts triceps traps"],
  ["Lateral Raise", "side raise|lateral|side lateral raise|cable lateral raise|machine lateral raise", "side_delts", "traps"],
  ["Front Raise", "front delt raise|plate raise", "front_delts", "side_delts"],
  ["Rear Delt Fly", "reverse fly|rear delt raise|reverse pec deck|rear lateral raise|bent over reverse fly|cable pull apart|rear delt row", "rear_delts", "upper_back traps"],
  ["Face Pull", "rope face pull|cable face pull", "rear_delts upper_back", "side_delts traps"],
  ["Upright Row", "barbell upright row|cable upright row", "side_delts traps", "biceps front_delts"],
  ["Shrug", "trap shrug|smith shrug|shoulder shrug", "traps", "forearms"],
  // Back
  ["Pull Up", "pullup|wide grip pull up|neutral grip pull up|assisted pull up|weighted pull up", "lats", "biceps upper_back forearms rear_delts"],
  ["Chin Up", "chinup|underhand pull up", "lats biceps", "upper_back forearms"],
  ["Lat Pulldown", "pulldown|wide grip pulldown|close grip pulldown|v bar pulldown|neutral grip pulldown|cable pulldown", "lats", "biceps upper_back"],
  ["Bent Over Row", "row|barbell row|pendlay row|dumbbell row|cable row|machine row|machine lat row|low row|t bar row|chest supported row|seal row|meadows row|bent row|iso row|close grip row|wide grip row|single arm row|one arm row", "upper_back lats", "biceps rear_delts lower_back"],
  ["Inverted Row", "bodyweight row|australian pull up|ring row", "upper_back lats", "biceps rear_delts"],
  ["Straight Arm Pulldown", "straight arm pushdown|lat prayer", "lats", "triceps"],
  ["Deadlift", "conventional deadlift|sumo deadlift|trap bar deadlift|barbell deadlift", "glutes hamstrings lower_back", "quads traps upper_back forearms adductors"],
  ["Romanian Deadlift", "rdl|stiff leg deadlift|stiff legged deadlift|straight leg deadlift|single leg rdl", "hamstrings glutes", "lower_back forearms adductors"],
  ["Rack Pull", "block pull", "traps upper_back lower_back", "glutes hamstrings forearms"],
  ["Good Morning", "", "hamstrings lower_back", "glutes"],
  ["Back Extension", "hyperextension|hyper|45 degree back extension|reverse hyperextension|reverse hyper|superman", "lower_back glutes", "hamstrings"],
  // Arms
  ["Biceps Curl", "curl|bicep curl|barbell curl|dumbbell curl|ez curl|preacher curl|cable curl|incline curl|concentration curl|spider curl|bayesian curl", "biceps", "forearms"],
  ["Hammer Curl", "cross body curl|rope hammer curl", "biceps forearms", ""],
  ["Reverse Curl", "reverse barbell curl|zottman curl", "forearms", "biceps"],
  ["Triceps Pushdown", "tricep pushdown|pushdown|rope pushdown|cable pushdown|triceps pressdown|tricep pressdown|v bar pushdown", "triceps", ""],
  ["Skull Crusher", "skullcrusher|lying triceps extension|ez bar skull crusher|french press", "triceps", ""],
  ["Overhead Triceps Extension", "tricep extension|triceps extension|overhead tricep extension|cable overhead extension", "triceps", ""],
  ["Close Grip Bench Press", "cgbp|close grip bench|close grip press", "triceps chest", "front_delts"],
  ["JM Press", "jm bench press", "triceps", "chest front_delts"],
  ["Triceps Kickback", "tricep kickback", "triceps", ""],
  ["Wrist Curl", "forearm curl|barbell wrist curl", "forearms", ""],
  ["Reverse Wrist Curl", "wrist extension|reverse wrist extension", "forearms", ""],
  ["Farmers Walk", "farmer walk|farmers carry|suitcase carry|loaded carry|dead hang", "forearms traps", "abs obliques"],
  // Legs
  ["Squat", "back squat|barbell squat|high bar squat|low bar squat|goblet squat|box squat|pause squat", "quads glutes", "adductors lower_back"],
  ["Front Squat", "", "quads", "glutes adductors abs upper_back"],
  ["Hack Squat", "machine squat|pendulum squat|belt squat", "quads", "glutes adductors"],
  ["Leg Press", "45 degree leg press|horizontal leg press|single leg press", "quads", "glutes adductors"],
  ["Lunge", "walking lunge|reverse lunge|forward lunge|lateral lunge|curtsy lunge|split lunge", "quads glutes", "adductors hamstrings"],
  ["Split Squat", "bulgarian split squat|rear foot elevated split squat|rfess|bulgarian", "quads glutes", "adductors hamstrings"],
  ["Step Up", "box step up", "quads glutes", "hamstrings calves"],
  ["Leg Extension", "quad extension|knee extension", "quads", ""],
  ["Leg Curl", "hamstring curl|lying leg curl|seated leg curl|prone leg curl", "hamstrings", "calves"],
  ["Nordic Curl", "nordic hamstring curl|nordics|glute ham raise|ghr|glute ham developer", "hamstrings", "glutes lower_back"],
  ["Hip Thrust", "glute bridge|barbell hip thrust|hip bridge|single leg hip thrust", "glutes", "hamstrings adductors"],
  ["Glute Kickback", "cable kickback|donkey kick|cable glute kickback|glute kick", "glutes", ""],
  ["Hip Abduction", "abductor machine|hip abductor|abduction machine|lateral band walk|banded lateral walk|clamshell|side lying hip abduction", "glutes", ""],
  ["Hip Adduction", "adductor machine|adduction machine|copenhagen plank|cable adduction", "adductors", ""],
  ["Sumo Squat", "plie squat|goblet sumo squat", "quads glutes", "adductors"],
  ["Calf Raise", "calf press|donkey calf raise|leg press calf raise|smith calf raise|single leg calf raise|calves", "calves", ""],
  ["Tibialis Raise", "tibialis anterior raise|tib raise|toe raise|tibialis", "calves", ""],
  ["Kettlebell Swing", "kb swing|swing|american swing|russian swing", "glutes hamstrings", "lower_back forearms abs"],
  ["Pull Through", "cable pull through", "glutes hamstrings", "lower_back"],
  ["Power Clean", "clean|hang clean", "traps glutes hamstrings", "quads upper_back forearms lower_back"],
  // Core
  ["Crunch", "ab crunch|cable crunch|machine crunch|decline crunch|sit up|reverse crunch|v up|toe touch", "abs", ""],
  ["Plank", "front plank|forearm plank|hollow hold|hollow body hold|hollow body|body saw|plank hold", "abs", "obliques lower_back"],
  ["Side Plank", "side bridge", "obliques", "abs glutes"],
  ["Hanging Leg Raise", "leg raise|hanging knee raise|knee raise|captains chair|toes to bar|hanging raise", "abs", "obliques forearms"],
  ["Russian Twist", "twist|woodchop|wood chop|cable woodchop|cable chop|landmine rotation|oblique twist", "obliques", "abs"],
  ["Pallof Press", "pallof|anti rotation press", "obliques abs", ""],
  ["Ab Wheel", "ab rollout|rollout|ab roller|barbell rollout", "abs", "obliques lats"],
  ["Bicycle Crunch", "oblique crunch|side crunch|bicycle", "obliques abs", ""],
  ["Dead Bug", "bird dog", "abs", "obliques lower_back"],
];

const roles = (direct, indirect) => {
  const out = {};
  for (const g of indirect.split(" ").filter(Boolean)) out[g] = "indirect";
  for (const g of direct.split(" ").filter(Boolean)) out[g] = "direct";
  return out;
};

// ── Name normalisation ──────────────────────────────────────────────────────
// Words that describe how/where an exercise is done, not what it trains.
const NOISE = new Set([
  "barbell", "dumbbell", "db", "bb", "cable", "machine", "smith", "ez", "kettlebell", "kb",
  "band", "bodyweight", "bw", "weighted", "assisted", "plate", "bar", "trapbar", "hex", "lever",
  "single", "unilateral", "alternating", "alt", "standing", "seated", "lying",
  "with", "the", "a", "an", "on", "of", "and", "to", "in", "for", "using",
]);

function singular(t) {
  if (t.length <= 3) return t;
  if (t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (/(ches|shes|sses|xes)$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("ss") || t.endsWith("us")) return t;
  if (t.endsWith("s")) return t.slice(0, -1);
  return t;
}

export function nameTokens(name) {
  const s = String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(one|single)[\s-]*arm\b/g, " ")
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\bpush ups?\b/g, "pushup")
    .replace(/\bpull ups?\b/g, "pullup")
    .replace(/\bchin ups?\b/g, "chinup")
    .replace(/\bsit ups?\b/g, "situp")
    .replace(/\bt bar\b/g, "tbar")
    .replace(/\btrap bar\b/g, "trapbar")
    .replace(/\bez bar\b/g, "ez");
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .filter((t) => !NOISE.has(t));
}

// Order-insensitive key used to store a user's own muscle assignment.
export function exerciseKey(name) {
  return [...new Set(nameTokens(name))].sort().join(" ");
}

// ── Index ───────────────────────────────────────────────────────────────────
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const LIBRARY = RAW.map(([name, aliases, direct, indirect]) => ({
  id: slug(name),
  name,
  muscles: roles(direct, indirect),
  aliases: aliases ? aliases.split("|") : [],
}));

const exact = new Map();
const candidates = [];
for (const entry of LIBRARY) {
  for (const label of [entry.name, ...entry.aliases]) {
    const toks = [...new Set(nameTokens(label))];
    if (!toks.length) continue;
    const key = [...toks].sort().join(" ");
    if (!exact.has(key)) exact.set(key, entry);
    candidates.push({ entry, set: new Set(toks), last: nameTokens(label).at(-1) });
  }
}

export function matchExercise(name) {
  const toks = nameTokens(name);
  if (!toks.length) return null;
  const set = new Set(toks);
  const key = [...set].sort().join(" ");
  if (exact.has(key)) return { entry: exact.get(key), score: 1 };

  const last = toks.at(-1);
  let best = null;
  for (const c of candidates) {
    let inter = 0;
    for (const t of set) if (c.set.has(t)) inter++;
    if (inter < 2) continue;
    const overlap = inter / Math.min(set.size, c.set.size);
    if (overlap < 0.8) continue;
    const jacc = inter / (set.size + c.set.size - inter);
    const score = 0.5 + 0.5 * jacc;
    const tie = c.last === last ? 1 : 0;
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && tie > best.tie)) {
      best = { entry: c.entry, score, tie };
    }
  }
  return best ? { entry: best.entry, score: best.score } : null;
}

export function cleanOverride(muscles) {
  const out = {};
  for (const [g, role] of Object.entries(muscles || {})) {
    if (isGroup(g) && (role === "direct" || role === "indirect")) out[g] = role;
  }
  return out;
}

// -> { source, name, muscles } or null when the name can't be placed.
export function resolveExercise(name, overrides = {}) {
  const custom = overrides[exerciseKey(name)];
  if (custom && Object.keys(custom).length) {
    return { source: "custom", name: String(name), muscles: cleanOverride(custom) };
  }
  const m = matchExercise(name);
  return m ? { source: "library", name: m.entry.name, muscles: m.entry.muscles } : null;
}

// Library exercises that train `group` directly, for the "what to add" suggestions.
export function exercisesFor(group) {
  return LIBRARY.filter((e) => e.muscles[group] === "direct");
}
