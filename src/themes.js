// Theme presets. Colours live in App.css under :root[data-theme="…"]; this
// file holds what JS needs (labels, picker swatches, confetti, browser chrome,
// and optional artwork that replaces the default pixel icons).
import kittyLogo from "./assets/kitty-logo.png";
import monsterCan from "./assets/monster-can.png";
import phantomHead from "./assets/phantom-head.png";
import phantomScene from "./assets/phantom-scene.png";
import phantomSprite from "./assets/phantom-sprite.png";
import phantomCard from "./assets/phantom-card.png";

export const THEMES = {
  arcade: {
    label: "Arcade Red",
    icon: null,
    swatch: "linear-gradient(135deg, #07050b 0%, #3a0a12 45%, #dc2626 100%)",
    iconColor: "#ff6b6b",
    confetti: ["#dc2626", "#ef4444", "#f43f5e", "#fca5a5"],
    metaColor: "#07050b",
    mapBase: "#86697a",
    mapFloor: "#2a1822",
    mapNone: "#55505f",
  },
  phantom: {
    label: "Phantom",
    icon: "ghost",
    swatch: `url(${phantomScene}) center 22% / cover`,
    iconColor: "#e3b8ff",
    confetti: ["#8a2fc4", "#c04bf0", "#ff2d95", "#f0c2ff"],
    metaColor: "#0b0714",
    mapBase: "#7b5aa6",
    mapFloor: "#1c0f2c",
    mapNone: "#4a3f63",
    logoImage: phantomHead,
    gymImage: phantomSprite,
    cardArt: phantomCard,
    cardScene: phantomScene,
    pixelArt: true, // the art is nearest-neighbour pixel art: keep it crisp
  },
  kitty: {
    label: "Hello Kitty",
    icon: "bow",
    swatch: "linear-gradient(135deg, #f6cfdf 0%, #e7a9c1 50%, #e0559a 100%)",
    iconColor: "#b8003a",
    confetti: ["#e0559a", "#f6b0cf", "#b8003a", "#ffffff"],
    metaColor: "#e7a9c1",
    mapBase: "#eab9cf",
    mapFloor: "#d98aae",
    mapNone: "#b07c97",
    logoImage: kittyLogo,
    swatchImage: kittyLogo,
    cardArt: kittyLogo,
    gymImage: monsterCan,
  },
};

export const THEME_IDS = Object.keys(THEMES);
const STORAGE_KEY = "pdash_theme";

export function themeOf(id) {
  return THEMES[id] ? id : "arcade";
}

// The theme remembered on this device. The sign-in screen renders before any
// user state exists, so it has nothing else to go on.
export function savedTheme() {
  try {
    return themeOf(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "arcade";
  }
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
