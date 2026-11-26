# Hosting Pdash

| Piece | Where | Why |
|---|---|---|
| The app (this repo, built by Vite) | **Vercel** | Fast global CDN, deploys on every push, a preview link per branch |
| Logins + data | **Supabase** (unchanged) | Already set up and protected by row-level security; moving it would mean a new login system and re-creating every account |
| "Rest over" notifications | **Render** (`server/`) | A web app on iPhone can't schedule its own notification, so a tiny server sends a push at the end of each rest |
| Neon | not used | Supabase already is the Postgres database. Neon would only replace it, at the cost of rewriting logins |

## 1. Vercel (the app)

1. vercel.com → **Add New… → Project** → import `kr1sh3n/levelup`.
2. Framework preset: **Vite** (read from `vercel.json`). Leave build settings as they are.
3. **Environment Variables**, same values as the GitHub secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (the publishable key, never the secret key)
   - `VITE_PUSH_URL`: the Render URL from step 3 (add it after Render is up, then redeploy)
   - `VITE_VAPID_PUBLIC_KEY`: the **public** key from `server/.env.local`
4. Deploy. Note the URL, e.g. `https://levelup-xxxx.vercel.app`.

## 2. Supabase (point logins at the new address)

Supabase → **Authentication → URL Configuration**:
- **Site URL**: the Vercel URL.
- **Redirect URLs**: add the Vercel URL (keep the GitHub Pages one until you switch over).

## 3. Render (rest notifications)

1. render.com → **New → Blueprint** → pick `kr1sh3n/levelup`. It reads `render.yaml` and creates `pdash-push` from `server/`.
2. When asked for values:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: from `server/.env.local` on this Mac (git-ignored; the private key is a secret, paste it only into Render).
   - `VAPID_SUBJECT`: `mailto:` followed by your email.
   - `ALLOWED_ORIGINS`: the Vercel URL, e.g. `https://levelup-xxxx.vercel.app` (comma-separate several).
3. Open `https://<your-service>.onrender.com/health`. It should say `{"ok":true,...}`.
4. Put that URL into Vercel as `VITE_PUSH_URL` and redeploy.

Free plan: the server sleeps after 15 minutes without requests and takes about a minute to wake. Turning on notifications and every rest wake it, so in practice only the first rest of a session can arrive late. Render's Starter plan ($7/month) never sleeps.

## 4. On the iPhone

1. Open the Vercel URL in Safari → Share → **Add to Home Screen** (it's a new address, so a new install).
2. Open it from the Home Screen, sign in, start a workout, tap **Notify me when rest is over** (the bell link under the rest timer), allow.
3. Log a set and lock the phone: the notification arrives when the rest ends.

## 5. Retiring GitHub Pages (once Vercel works)

Repo → Settings → Pages → disable, and delete `.github/workflows/deploy.yml`. Data lives in Supabase, so signing in on the new address brings everything back.

## New VAPID keys

`cd server && npm install && npm run keys`, then update Render and Vercel. Everyone has to tap "Notify me" again.
