# LevelUp — Daily Life RPG

Turn your daily habits, workouts, and nutrition into a role-playing game. Built with React + Vite, runs fully offline, stores everything locally in your browser. Installable as a PWA on iOS/Android.

## Features

- **XP & Leveling** — earn XP from habits; every 2000 XP is a level, with titles (Rookie → Legendary)
- **Streaks** — any logged activity (task, meal, or gym set) keeps your streak alive, with XP multipliers at 7/14/30 days
- **Skill trees** — Fitness, Mind, Creator, and Health level up independently
- **Weekly quests** — auto-generated challenges with claimable XP rewards
- **Boss Day** — every Sunday, complete all tasks for a big bonus
- **Meal tracking** — calories + macros vs editable goals, with one-tap re-logging of recent meals
- **Gym tracker** — log sets (weight × reps), automatic personal-record detection, and a rest timer
- **Stats** — total XP, longest streak, best day, and a 4-week activity heatmap
- **Data backup** — export/import your full save as a JSON file (Profile tab)
- **Milestone celebrations** — confetti on level-ups, streak milestones, and new PRs

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173).

## Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## Deploy (GitHub Pages)

This repo includes a GitHub Actions workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) that builds and deploys to GitHub Pages on every push to `main`.

1. Push this project to a GitHub repo.
2. In the repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Push to `main`. The site publishes at `https://<username>.github.io/<repo>/`.

The Vite config uses `base: './'`, so it works correctly under a Pages subpath.

## Install on your phone (PWA)

Once deployed (HTTPS required):

- **iOS:** open the URL in **Safari** → Share → **Add to Home Screen**.
- **Android:** open in Chrome → menu → **Install app**.

It launches fullscreen with its own icon and works offline.

> **iOS note:** browser storage for installed web apps can be cleared if the app
> goes unused for ~7 days. Use the **Export Backup** button on the Profile tab
> periodically and save the file to Files/iCloud so you never lose your progress.

## Data & privacy

There is no backend. All data lives in your browser's `localStorage` on your device. Nothing is uploaded anywhere.

## Tech

React · Vite · vite-plugin-pwa · canvas-confetti
