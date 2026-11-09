// Theme presets. Colours live in App.css under :root[data-theme="…"]; this
// file holds what JS needs (labels, picker swatches, confetti, browser chrome,
// and optional artwork that replaces the default pixel icons).
import kittyLogo from "./assets/kitty-logo.png";
import monsterCan from "./assets/monster-can.png";
import batmanHead from "./assets/batman-head.png";
import batmanScene from "./assets/batman-scene.png";
import batSprite from "./assets/bat-sprite.png";

export const THEMES = {
  arcade: {
    label: "Arcade Red",
    icon: null,
    swatch: "linear-gradient(135deg, #07050b 0%, #3a0a12 45%, #dc2626 100%)",
    iconColor: "#ff6b6b",
    confetti: ["#dc2626", "#ef4444", "#f43f5e", "#fca5a5"],
    metaColor: "#07050b",
  },
  batman: {
    label: "Batman",
    icon: "bat",
    swatch: `url(${batmanScene}) center 18% / cover`,
    iconColor: "#c9bdf7",
    confetti: ["#7c5cd6", "#a58cf0", "#c9c3f2", "#e0b04a"],
    metaColor: "#0d0a16",
    logoImage: batmanHead,
    gymImage: batSprite,
    pixelArt: true, // gymImage is a nearest-neighbour sprite: keep it crisp
  },
  kitty: {
    label: "Hello Kitty",
    icon: "bow",
    swatch: "linear-gradient(135deg, #f6cfdf 0%, #e7a9c1 50%, #e0559a 100%)",
    iconColor: "#b8003a",
    confetti: ["#e0559a", "#f6b0cf", "#b8003a", "#ffffff"],
    metaColor: "#e7a9c1",
    logoImage: kittyLogo,
    swatchImage: kittyLogo,
    gymImage: monsterCan,
  },
};

export const THEME_IDS = Object.keys(THEMES);
const STORAGE_KEY = "pdash_theme";

export function themeOf(id) {
  return THEMES[id] ? id : "arcade";
}

// Applies the theme to the page and remembers it on this device, so the
// sign-in screen and first paint already use it (see the script in index.html).
export function applyTheme(id) {
  const theme = themeOf(id);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEMES[theme].metaColor);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage blocked — theme still applies for this session */
  }
}
