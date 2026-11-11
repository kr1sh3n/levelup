import { useEffect, useRef, useState } from "react";

// An in-app replacement for window.confirm().
//
// Some browsers never show the native dialog: in-app browsers, embedded web
// views, and any tab where the user once ticked "don't show more dialogs".
// There confirm() returns false straight away, so every delete button guarded
// by it silently did nothing. This box is part of the page, so it always shows.
//
//   if (await askConfirm("Delete Chest?", { okLabel: "DELETE" })) deleteDay(id);

let show = null;

// eslint-disable-next-line react-refresh/only-export-components -- the helper and its host belong together
export function askConfirm(message, { okLabel = "OK", danger = true } = {}) {
  // Host not mounted (should not happen): fall back to the native dialog.
  if (!show) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => show({ message, okLabel, danger, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  const okRef = useRef(null);

  useEffect(() => {
    show = (r) =>
      setReq((prev) => {
        prev?.resolve(false); // a second request cancels the first
        return r;
      });
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    okRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        req.resolve(false);
        setReq(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  function answer(ok) {
    req?.resolve(ok);
    setReq(null);
  }

  if (!req) return null;
  return (
    <div className="confirm-backdrop" onClick={() => answer(false)}>
      <div
        className="confirm-box card"
        role="alertdialog"
        aria-modal="true"
        aria-label="Please confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-msg">{req.message}</p>
        <div className="form-actions">
          <button
            ref={okRef}
            type="button"
            className={`claim-btn ${req.danger ? "danger-btn" : ""}`}
            onClick={() => answer(true)}
          >
            {req.okLabel}
          </button>
          <button type="button" className="claim-btn ghost" onClick={() => answer(false)}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
