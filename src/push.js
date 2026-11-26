// "Rest over" notifications.
//
// A web app on iPhone cannot schedule its own notification, and its timers stop
// while it is in the background. So when a rest starts, the app asks a small
// server (server/ - hosted on Render) to send a web push at the end time; the
// phone shows it even with the app closed or the screen locked. Needs the app
// added to the Home Screen (iOS 16.4+) and notification permission.
const SERVER = (import.meta.env.VITE_PUSH_URL || "").replace(/\/$/, "");
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
const KEY = "pdash_push_sub";

export const pushConfigured = () => !!(SERVER && VAPID);

export function pushSupported() {
  return pushConfigured() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushEnabled() {
  try {
    return pushSupported() && Notification.permission === "granted" && !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

function keyBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Must be called from a tap (iOS only asks for permission in response to one).
export async function enablePush() {
  if (!pushSupported()) throw new Error("Notifications need the app added to your Home Screen.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are turned off for Pdash in Settings.");
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
  localStorage.setItem(KEY, JSON.stringify(sub));
  // Wake the server now: on Render's free plan it sleeps when idle.
  fetch(`${SERVER}/health`).catch(() => {});
  return true;
}

export function disablePush() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

let current = null; // id of the pending rest notification

export async function scheduleRestPush(endAt) {
  if (!pushEnabled()) return;
  await cancelRestPush();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  current = id;
  try {
    await fetch(`${SERVER}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, at: endAt, subscription: JSON.parse(localStorage.getItem(KEY)) }),
      keepalive: true,
    });
  } catch {
    /* offline: the in-app timer and chime still work */
  }
}

export async function cancelRestPush() {
  if (!current || !SERVER) return;
  const id = current;
  current = null;
  try {
    await fetch(`${SERVER}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
