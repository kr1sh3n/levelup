// Draws the shareable stats card onto a canvas.
//
// It is a collectible-style card: a holo frame, an art window, and the numbers
// that say where you are. Colours are read from the live CSS custom properties,
// so the card matches whichever theme is active without a second palette to
// keep in sync. Drawing happens at CARD_SCALE so the saved PNG stays sharp.

import { LEVEL_TITLES, SKILL_COLORS, SKILL_LABELS, XP_PER_LEVEL, getLevelTitle, playerName } from "./gameData";

export const CARD_W = 640;
export const CARD_H = 896; // 5:7, the usual trading-card proportion
const CARD_SCALE = 2;

const SKILLS = ["fitness", "mind", "creator", "health"];
// Same maths the Profile tab uses, so the card never disagrees with the app.
const SKILL_XP_PER_LEVEL = 500;
const skillLevel = (xp) => Math.floor(xp / SKILL_XP_PER_LEVEL) + 1;
const skillFrac = (xp) => (xp % SKILL_XP_PER_LEVEL) / SKILL_XP_PER_LEVEL;

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// The theme's palette, read once per render.
function palette() {
  return {
    accent: cssVar("--accent", "#8a2fc4"),
    accentHot: cssVar("--accent-hot", "#ff2d95"),
    accentLight: cssVar("--accent-light", "#e3b8ff"),
    neon: cssVar("--neon", "#c04bf0"),
    neonDeep: cssVar("--neon-deep", "#2d0d4a"),
    surface: cssVar("--surface-solid", "#1c102c"),
    bg: cssVar("--bg", "#0b0714"),
    text: cssVar("--text", "#f2e7fb"),
    muted: cssVar("--text-muted", "#9a84b5"),
    border: cssVar("--border-strong", "rgba(190,90,220,0.42)"),
    onAccent: cssVar("--on-accent", "#ffffff"),
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, { font, size, colour, align = "left", baseline = "alphabetic" }) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

const DISPLAY = "'Press Start 2P', monospace";
const BODY = "'VT323', monospace";

// Diagonal translucent bands plus a few sparkles: the holo shimmer.
function holo(ctx, x, y, w, h, p) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  for (let i = 0; i <= 10; i++) {
    g.addColorStop(i / 10, i % 2 ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.02)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = "screen";
  // Deterministic sparkles, so the same card renders identically every time.
  for (let i = 0; i < 48; i++) {
    const sx = x + ((i * 97 + 31) % w);
    const sy = y + ((i * 193 + 17) % h);
    ctx.fillStyle = i % 4 === 0 ? p.accentHot : p.accentLight;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 1 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Fits an image inside a box without distorting it. Pixel art is snapped to a
// whole-number scale so nearest-neighbour upscaling stays crisp.
function drawContain(ctx, img, x, y, w, h, pixelArt) {
  const scale = Math.min(w / img.width, h / img.height);
  const k = pixelArt ? Math.max(1, Math.floor(scale)) : scale;
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.imageSmoothingEnabled = !pixelArt;
  ctx.drawImage(img, Math.round(x + (w - dw) / 2), Math.round(y + (h - dh) / 2), Math.round(dw), Math.round(dh));
  ctx.imageSmoothingEnabled = true;
}

function statTile(ctx, x, y, w, h, label, value, p) {
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  text(ctx, String(value), x + w / 2, y + h * 0.44, { font: DISPLAY, size: 20, colour: p.text, align: "center", baseline: "middle" });
  text(ctx, label, x + w / 2, y + h * 0.78, { font: BODY, size: 21, colour: p.muted, align: "center", baseline: "middle" });
}

/**
 * Draws the card. `data` is a plain snapshot, so the layout stays easy to reason
 * about: { name, level, title, totalXp, xpInLevel, streak, bestStreak,
 * workouts, goalsDone, skillXp, topMuscle, date }.
 */
// Each call takes a ticket; a render that finishes after a newer one started
// is dropped, so switching themes can never leave the previous palette painted.
const renderTickets = new WeakMap();

export async function renderCard(canvas, data, theme) {
  const ticket = (renderTickets.get(canvas) || 0) + 1;
  renderTickets.set(canvas, ticket);

  // Fonts must be ready, or the first render falls back to a system face.
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* draw with whatever is loaded */
    }
  }
  const [art, scene] = await Promise.all([loadImage(theme?.cardArt), loadImage(theme?.cardScene)]);
  if (renderTickets.get(canvas) !== ticket) return;

  // Read the colours only now, after the waits above: the theme may have
  // changed while fonts and images were loading.
  const p = palette();
  canvas.width = CARD_W * CARD_SCALE;
  canvas.height = CARD_H * CARD_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);

  // ── Frame ──
  const frame = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  frame.addColorStop(0, p.accent);
  frame.addColorStop(0.45, p.accentHot);
  frame.addColorStop(1, p.neon);
  ctx.fillStyle = frame;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 26);
  ctx.fill();
  holo(ctx, 0, 0, CARD_W, CARD_H, p);

  const M = 16;
  ctx.fillStyle = p.surface;
  roundRect(ctx, M, M, CARD_W - M * 2, CARD_H - M * 2, 18);
  ctx.fill();

  // ── Header: name, level, title ──
  text(ctx, data.name.toUpperCase(), 44, 76, { font: DISPLAY, size: 20, colour: p.text });
  const badgeW = 118;
  const badgeX = CARD_W - 44 - badgeW;
  roundRect(ctx, badgeX, 48, badgeW, 42, 6);
  ctx.fillStyle = p.accentHot;
  ctx.fill();
  text(ctx, `LVL ${data.level}`, badgeX + badgeW / 2, 70, { font: DISPLAY, size: 15, colour: p.onAccent, align: "center", baseline: "middle" });
  text(ctx, data.title.toUpperCase(), 44, 106, { font: BODY, size: 25, colour: p.accentLight });

  // ── Art window ──
  const ax = 44;
  const ay = 128;
  const aw = CARD_W - 88;
  const ah = 342;
  ctx.save();
  roundRect(ctx, ax, ay, aw, ah, 10);
  ctx.clip();
  if (scene) {
    ctx.imageSmoothingEnabled = false;
    const k = Math.max(aw / scene.width, ah / scene.height);
    ctx.drawImage(scene, ax, ay - 30, scene.width * k, scene.height * k);
    ctx.imageSmoothingEnabled = true;
  } else {
    const bg = ctx.createLinearGradient(ax, ay, ax, ay + ah);
    bg.addColorStop(0, p.neonDeep);
    bg.addColorStop(1, p.bg);
    ctx.fillStyle = bg;
    ctx.fillRect(ax, ay, aw, ah);
  }
  if (art) drawContain(ctx, art, ax + 40, ay + 20, aw - 80, ah - 60, !!theme?.pixelArt);
  else text(ctx, String(data.level), ax + aw / 2, ay + ah / 2, { font: DISPLAY, size: 96, colour: p.accentLight, align: "center", baseline: "middle" });
  ctx.restore();
  holo(ctx, ax, ay, aw, ah, p);
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 2;
  roundRect(ctx, ax, ay, aw, ah, 10);
  ctx.stroke();

  // ── XP bar ──
  const bx = 44;
  const by = 500;
  const bw = CARD_W - 88;
  text(ctx, `${data.totalXp.toLocaleString()} XP`, bx, by - 10, { font: BODY, size: 25, colour: p.text });
  text(ctx, `${data.xpInLevel} / ${XP_PER_LEVEL}`, bx + bw, by - 10, { font: BODY, size: 25, colour: p.muted, align: "right" });
  roundRect(ctx, bx, by, bw, 14, 7);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  const pct = Math.max(0.02, Math.min(1, data.xpInLevel / XP_PER_LEVEL));
  const fill = ctx.createLinearGradient(bx, 0, bx + bw * pct, 0);
  fill.addColorStop(0, p.accent);
  fill.addColorStop(1, p.accentHot);
  roundRect(ctx, bx, by, bw * pct, 14, 7);
  ctx.fillStyle = fill;
  ctx.fill();

  // ── Stat tiles ──
  const tiles = [
    ["Streak", data.streak],
    ["Best", data.bestStreak],
    ["Workouts", data.workouts],
    ["Goals", data.goalsDone],
  ];
  const gap = 12;
  const tw = (CARD_W - 88 - gap * 3) / 4;
  tiles.forEach(([label, value], i) => statTile(ctx, 44 + i * (tw + gap), 544, tw, 76, label, value, p));

  // ── Skills ──
  text(ctx, "SKILL TREES", 44, 656, { font: DISPLAY, size: 11, colour: p.muted });
  SKILLS.forEach((key, i) => {
    const y = 684 + i * 34;
    const xp = data.skillXp?.[key] || 0;
    const lvl = skillLevel(xp);
    const frac = skillFrac(xp);
    text(ctx, SKILL_LABELS[key] || key, 44, y, { font: BODY, size: 25, colour: p.text });
    const barX = 190;
    const barW = CARD_W - 88 - (barX - 44) - 72;
    roundRect(ctx, barX, y - 12, barW, 10, 5);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();
    if (frac > 0.01) {
      roundRect(ctx, barX, y - 12, barW * Math.min(1, frac), 10, 5);
      ctx.fillStyle = SKILL_COLORS[key]?.color || p.neon;
      ctx.fill();
    }
    text(ctx, `Lv ${lvl}`, CARD_W - 44, y, { font: BODY, size: 25, colour: p.accentLight, align: "right" });
  });

  // ── Footer ──
  const fy = CARD_H - 48;
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(44, fy - 26);
  ctx.lineTo(CARD_W - 44, fy - 26);
  ctx.stroke();
  text(ctx, "PDASH", 44, fy, { font: DISPLAY, size: 12, colour: p.accentLight });
  if (data.topMuscle) {
    text(ctx, data.topMuscle, CARD_W / 2, fy, { font: BODY, size: 22, colour: p.muted, align: "center" });
  }
  text(ctx, data.date, CARD_W - 44, fy, { font: BODY, size: 22, colour: p.muted, align: "right" });

  return canvas;
}

// Snapshot of the game state the card shows.
export function cardData(state, level, xpInLevel, extra = {}, user = null) {
  return {
    name: playerName(state, user).slice(0, 16),
    level,
    title: getLevelTitle(level) || LEVEL_TITLES[1] || "Rookie",
    totalXp: state.totalXp || 0,
    xpInLevel,
    streak: state.streak || 0,
    bestStreak: state.bestStreak ?? state.streak ?? 0,
    workouts: (state.workoutXpDates || []).length,
    goalsDone: (state.goals || []).filter((g) => g.completed).length,
    skillXp: state.skillXp || {},
    date: new Date().toISOString().slice(0, 10),
    ...extra,
  };
}
