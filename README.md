# Pdash — Personal Dashboard RPG

Turn your own goals, workouts, diet and challenges into a role-playing game. You decide what to track — Pdash provides the tools, XP and levels. Built with React + Vite, installable as a PWA, with optional cloud accounts (Supabase) so your data follows you across devices.

## Features

- **Personal goals (Today)** — create goals with a title, description, deadline and skill; edit, delete, and tick them off for XP. Due-today / overdue badges, active vs completed views.
- **Workout plans (Gym)** — pick a one-tap starter plan (Full body, Upper / Lower, Push / Pull / Legs) or build your own. Exercises default to 3 sets of 6–8 reps with 2–5 min rest, and the name field suggests exercises from the muscle library. Tap START on a workout and log each set by hand on one row: kg × reps, optional RIR, + SET (commas like 27,5 work). Tick ✓ when an exercise is done; the rest timer starts on its own.
- **Muscle map** — one scrolling page with a live preview of the figure; tap it to open the full-screen 3D view, tap a muscle, then SEE DETAILS.
- **Workout tracking** — pick today's workout, log sets (weight × reps), auto-start the rest timer with each exercise's rest time, detect personal records, finish the workout for XP, and browse workout history.
- **Custom diet plans (Meals)** — create meals (Breakfast, Lunch, Snacks, Dinner or your own), add food items with quantity, calories, protein, carbs and fats, and log a whole meal in one tap. Daily calorie and macro totals are calculated automatically against editable targets; logged entries can be edited or removed.
- **XP & levelling** — every 2000 XP is a level; skill trees (Fitness, Mind, Creator, Health); streak multipliers at 7/14/30 days; Sunday Boss Day bonus when every goal due that day is done.
- **Muscle Map** — a 3D pixel-art body in Profile. Every muscle is coloured by weekly sets with tap-to-focus, a week time-lapse and a recovery view showing which muscles are ready to train, with research-based targets, a "where to focus" list and balance checks. Import a spreadsheet (.xlsx / .csv) or just log workouts; warm-up sets are excluded. See [docs/MUSCLE_MAP.md](docs/MUSCLE_MAP.md).
- **Profile** — themes (Arcade Red, Phantom, Hello Kitty), level progress, skill trees, key stats with a 4-week activity heatmap, and JSON backup export/import.
- **Shareable stats card** — a collectible-style card of your level, title, XP, streak, skills and most-trained muscle, drawn to a canvas and styled to the active theme. Save it as a PNG or send it straight to the share sheet.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173). Without Supabase configured, Pdash runs in **local-only mode**: no login, data saved in this browser.

## Cloud accounts (Supabase)

Logins, per-user private data, and sync across devices.

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). It creates the `user_state` and `profiles` tables plus row-level-security policies, so each user can only read and write their own data.
3. In **Authentication → URL Configuration**, set the **Site URL** to where the app is hosted (e.g. `https://<username>.github.io/<repo>/`) and add `http://localhost:5173` to **Redirect URLs** for local development. Email/password sign-in is enabled by default.
4. Copy `.env.example` to `.env.local` and fill in your project's URL and **anon** key (Project Settings → API). The anon key is designed to be public; data is protected by the RLS policies.
5. `npm run dev` — you'll now see the sign-in screen.

### Operator access

The schema also supports reading every account's data, for running and improving the app:

1. Sign up through the app yourself, then add your account as an admin:
   ```sql
   insert into public.app_admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
2. Use [`supabase/admin-queries.sql`](supabase/admin-queries.sql) in the SQL Editor — signups, activity per account, and every logged set flattened into rows.
3. [`supabase/rls-test.sql`](supabase/rls-test.sql) proves the access rules actually hold: it impersonates a second user and a signed-out visitor to confirm neither can read your rows, and that an admin can read but not write. Worth running after any change to the policies.

Three things this deliberately does:

- **Users are told.** Creating an account requires ticking a box that says the operator can read what they log, and the wording they agreed to is stored with the timestamp. Anyone who signed up earlier is asked once before they can continue. [`public/privacy.html`](public/privacy.html) spells out what is kept.
- **Admins can read, never write.** There is no admin insert, update or delete policy on `user_state`.
- **The `service_role` key stays out of the app.** It bypasses every policy, so anyone who found it in the bundle could read and erase all data. Only the `anon` key is ever shipped; access is granted by adding a row to `app_admins`, not by holding a key.

Users can delete their account, their save and their login from Profile at any time.

How sync works: every change is saved immediately to this device and pushed to your account shortly after. When you return to the app (or come back online) it pulls any newer save from your other devices. If you edit on two devices while offline, the most recent save wins. Progress saved in this browser before accounts existed is carried into your account the first time you sign in on it (unless the account already has cloud data).

## Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## Deploy (GitHub Pages)

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds and deploys to GitHub Pages on every push to `main`.

1. Push this project to a GitHub repo.
2. In the repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. For cloud accounts, add repository secrets **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** (Settings → Secrets and variables → Actions). Without them the deployed app runs in local-only mode.
4. Push to `main`. The site publishes at `https://<username>.github.io/<repo>/`.

The Vite config uses `base: './'`, so it works under a Pages subpath.

## Install on your phone (PWA)

Once deployed (HTTPS required):

- **iOS:** open the URL in **Safari** → Share → **Add to Home Screen**.
- **Android:** open in Chrome → menu → **Install app**.

## Data & privacy

- **With accounts:** your save is stored in your own row of the Supabase `user_state` table, readable and writable only by you (row-level security). A cached copy is kept on the device for offline use and removed when you sign out.
- **Local-only mode:** everything stays in this browser's `localStorage`; nothing is uploaded. iOS may clear storage for home-screen apps unused for ~7 days, so use **Export Backup** regularly.

## Tech

React · Vite · vite-plugin-pwa · Supabase (Auth + Postgres) · canvas-confetti
