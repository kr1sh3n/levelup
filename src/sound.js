// The rest-timer chime.
//
// iPhones only let a page make sound from an AudioContext that was started by
// a tap. The old code created a fresh context when the timer ran out - not a
// tap - so on iOS it was silently blocked. Here one shared context is created
// and resumed on the next tap anywhere in the app (START, + SET, ...), so it
// is already unlocked when the timer ends.
let ctx = null;

function context() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  return ctx;
}

export function unlockSound() {
  try {
    const c = context();
    if (c && c.state !== "running") c.resume();
  } catch {
    /* no audio on this device */
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlockSound, { passive: true });
  document.addEventListener("keydown", unlockSound);
}

// Three short rising beeps: easy to hear over gym music.
export function chime() {
  try {
    const c = context();
    if (!c) return;
    if (c.state !== "running") c.resume();
    [0, 0.22, 0.44].forEach((t, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.type = "square";
      o.frequency.value = 660 + i * 220;
      const at = c.currentTime + t;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      o.start(at);
      o.stop(at + 0.2);
    });
  } catch {
    /* audio not available: silent fallback */
  }
}
