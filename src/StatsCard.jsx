import { useCallback, useEffect, useRef, useState } from "react";
import { CARD_H, CARD_W, cardData, renderCard } from "./cardRender";
import { GROUP_IDS, groupLabel } from "./muscles/taxonomy";
import { collectSets, computeVolumes, latestOffset, makeResolver, periodRange } from "./muscles/volume";
import { getLevel, getXpInCurrentLevel } from "./gameData";
import { THEMES, themeOf } from "./themes";

// The stats card: a collectible-style summary of where you are, drawn to a
// canvas so it can be saved as an image or handed to the OS share sheet.
// Styled from the active theme's CSS variables, so every theme gets its own.
export default function StatsCard({ store }) {
  const { state, today } = store;
  const canvasRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const themeId = themeOf(state.theme);
  const theme = THEMES[themeId];
  const level = getLevel(state.totalXp);
  const xpInLevel = getXpInCurrentLevel(state.totalXp);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The muscle map's headline fact earns its place on the card.
    let topMuscle = "";
    try {
      const sets = collectSets(state);
      if (sets.length) {
        const kind = state.muscleMap?.period === "week" ? "week" : "rolling";
        const { from, to } = periodRange(kind, today, latestOffset(sets, today, kind));
        const v = computeVolumes(sets, { from, to, resolve: makeResolver(state.exerciseMuscles) });
        const best = GROUP_IDS.map((g) => ({ g, n: v.byGroup[g].effective })).sort((a, b) => b.n - a.n)[0];
        if (best?.n > 0) topMuscle = `Most trained: ${groupLabel(best.g)}`;
      }
    } catch {
      /* the card is still worth showing without it */
    }
    await renderCard(canvas, cardData(state, level, xpInLevel, { topMuscle }), theme);
  }, [state, today, level, xpInLevel, theme]);

  useEffect(() => {
    draw();
  }, [draw]);

  const toBlob = () =>
    new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob(resolve, "image/png");
    });

  const fileName = `pdash-card-${new Date().toISOString().slice(0, 10)}.png`;

  async function save() {
    const blob = await toBlob();
    if (!blob) throw new Error("Couldn't render the card.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking straight away cancels the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function onSave() {
    setBusy(true);
    setNote(null);
    try {
      await save();
      setNote("Saved to your downloads.");
    } catch (err) {
      setNote(err.message || "Couldn't save the card.");
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    setBusy(true);
    setNote(null);
    try {
      const blob = await toBlob();
      if (!blob) throw new Error("Couldn't render the card.");
      const file = new File([blob], fileName, { type: "image/png" });
      // Sharing files needs a user gesture and browser support; otherwise fall
      // back to a download so the button is never a dead end.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Pdash card" });
        setNote("Shared.");
      } else {
        await save();
        setNote("Sharing isn't available here, so the card was saved instead.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setNote(err.message || "Couldn't share the card.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stats-card">
      <div className="card-title">Your card</div>
      <div className="stats-card-stage">
        <canvas
          ref={canvasRef}
          className="stats-card-canvas"
          style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
          role="img"
          aria-label={`Level ${level} stats card for ${state.playerName || "Player 1"}, ${state.totalXp} total XP`}
        />
      </div>
      <div className="form-actions">
        <button type="button" className="claim-btn" onClick={onShare} disabled={busy}>SHARE</button>
        <button type="button" className="claim-btn ghost" onClick={onSave} disabled={busy}>SAVE IMAGE</button>
      </div>
      <p className="mm-fine">
        {note || `A ${CARD_W}×${CARD_H} image of your level, streak and skills, styled to the ${theme.label} theme.`}
      </p>
    </div>
  );
}
