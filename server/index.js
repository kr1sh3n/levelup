// Pdash push server: sends the "rest over" notification at the time the app
// asks for. A web app on iPhone cannot schedule its own notification, so the
// app posts { id, at, subscription } here when a rest starts and this server
// sends a web push at `at`.
//
// Deliberately tiny: no database. Pending notifications live in memory; a
// rest is at most a few minutes, so losing them on a restart costs at most
// one notification. Env:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  - from `npm run keys`
//   VAPID_SUBJECT                        - mailto: or https: contact for push services
//   ALLOWED_ORIGINS                      - comma-separated app origins (CORS)
//   PORT                                 - set by Render
import http from "node:http";
import webpush from "web-push";

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = "mailto:admin@example.com" } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Run `npm run keys` and set them.");
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_DELAY_MS = 15 * 60 * 1000; // rests are 2-5 min; refuse anything silly
const MAX_PENDING = 5000;
const pending = new Map(); // id -> timeout

// Only real push services: stops this server being used to POST to arbitrary URLs.
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;

function validSubscription(sub) {
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.test(u.hostname) && sub.keys?.p256dh && sub.keys?.auth;
  } catch {
    return false;
  }
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED.length === 0 || ALLOWED.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 8192) reject(new Error("too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function cancel(id) {
  const t = pending.get(id);
  if (t) clearTimeout(t);
  pending.delete(id);
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return send(res, 204, {});
  const { pathname } = new URL(req.url, "http://x");

  if (req.method === "GET" && (pathname === "/" || pathname === "/health")) {
    return send(res, 200, { ok: true, pending: pending.size });
  }

  if (req.method === "POST" && pathname === "/schedule") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: "bad json" });
    }
    const { id, at, subscription, title, body: text } = body;
    if (typeof id !== "string" || id.length > 80) return send(res, 400, { error: "bad id" });
    if (!validSubscription(subscription || {})) return send(res, 400, { error: "bad subscription" });
    const delay = Number(at) - Date.now();
    if (!Number.isFinite(delay) || delay > MAX_DELAY_MS) return send(res, 400, { error: "bad time" });
    if (pending.size >= MAX_PENDING) return send(res, 503, { error: "busy" });

    cancel(id);
    const payload = JSON.stringify({
      title: typeof title === "string" ? title.slice(0, 60) : "Rest over 💪",
      body: typeof text === "string" ? text.slice(0, 120) : "Time for your next set.",
    });
    // If the server was asleep and woke up late, send straight away.
    const t = setTimeout(async () => {
      pending.delete(id);
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 120, urgency: "high" });
      } catch (err) {
        console.warn("push failed", err.statusCode || err.message);
      }
    }, Math.max(0, delay));
    pending.set(id, t);
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/cancel") {
    try {
      const { id } = await readJson(req);
      if (typeof id === "string") cancel(id);
    } catch {
      /* ignore */
    }
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: "not found" });
});

server.listen(process.env.PORT || 8787, () => console.log(`pdash push server on :${process.env.PORT || 8787}`));
