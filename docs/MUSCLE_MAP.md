# Muscle Map

A 3D, pixel-art body in **Profile -> Muscle Map**. Every muscle is its own block cluster, coloured by how many sets you did for it in a week, with advice on where to focus. Import a spreadsheet and the colours update.

## Using it

1. Profile -> **Open Muscle Map**. Drag to rotate, pinch/scroll to zoom, use **Front / Back / L / R** to jump views, tap a muscle for its details.
2. **Import your data**: Settings and data -> **Import spreadsheet**, or just log workouts in the Gym tab (they are counted automatically).
3. Pick a view (Weekly sets or Recovery), a goal and a time window (last 7 days or Mon-Sun, stepping back week by week).
4. **Try demo data** shows a made-up, deliberately lopsided training week so every colour appears.

### Spreadsheet format

`.xlsx` or `.csv`. One row per set, **or** one row per exercise with a number of sets:

| Date | Exercise | Sets | Reps | Weight (kg) |
| --- | --- | --- | --- | --- |
| 2026-11-02 | Bench Press (Barbell) | 4 | 8 | 80 |

- Columns are matched by name (Date, Exercise, Sets, Reps, Weight, a warm-up / set-type column) and you can change any guess in the dialog.
- Dates: `2026-11-09`, `09/11/2026`, `9 Nov 2026`, real Excel dates all work. Day/month vs month/day is detected from the data; if it can't tell, it assumes day/month and says so.
- Several tabs that share the same columns (for example one per month) are combined; other tabs are ignored. Pounds are converted to kilograms.
- Exercise names are free text. The built-in library (about 70 exercises with common aliases) recognises most; anything unknown is listed so you can say which muscles it works. Your choices are remembered.
- Importing the same dates again replaces the earlier import for those dates, so nothing is double counted. **Remove imported** clears them; workouts logged in Pdash stay.
- The file is read on your device. Only the sets (date, exercise, weight, reps) are saved, and sync with your account like everything else.

Samples: [`sample-workouts.csv`](sample-workouts.csv) and [`sample-workouts.xlsx`](sample-workouts.xlsx) (regenerate with `python3 scripts/make-sample-sheets.py`).

## How sets are counted

- A **direct** set (the prime mover, e.g. chest on bench press) counts 1 set. A **helper** set (triceps on bench press) counts 0.5 by default; change it to 0 or 1 in settings.
- **Warm-up sets are excluded.** In the Gym tab tap **W** before adding a set to mark it; in a spreadsheet use a warm-up / set-type column.
- The unit is "weekly sets per muscle group". There are 18 groups (see `src/muscles/taxonomy.js`); each is drawn as several anatomical muscles on the figure.

## Targets and the research

Zones (weekly effective sets per muscle):

| Zone | Muscle + strength / size | Strength only |
| --- | --- | --- |
| None | 0 | 0 |
| Low | under 4 | under 3 |
| Building | 4 to 10 | 3 to 6 |
| **Optimal** | **10 to 20** | **6 to 12** |
| High | 20 to 30 | 12 to 20 |
| Very high | 30+ | 20+ |

What this rests on, and how far to trust it:

- More weekly sets generally means more muscle growth, with diminishing returns. Schoenfeld, Ogborn & Krieger, *J Sports Sci* 2017 (systematic review and meta-regression), found graded gains up to 10+ sets per muscle per week.
- Pelland, Remmert, Robinson, Hinson & Zourdos (SportRxiv preprint, 2024) re-examine the dose-response for both outcomes: growth keeps rising with diminishing returns; strength levels off sooner; frequency matters little for growth once volume is equal; counting helper sets as half a set fits growth best, direct sets only fits strength best. Secondary summaries put the minimum effective dose for growth near 4 sets and most strength benefit at about 10-12 sets. **Those specific numbers came from summaries, not the paper text; check the preprint before relying on them.**
- These are averages from mostly young, healthy lifters, usually training near failure. Individuals vary a lot, and the app counts sets, not how hard they were. Treat the bands as a starting point, not a prescription. This is general guidance, not medical advice.
- The **balance checks** (push vs pull, quads vs hamstrings, front vs rear delts) are rules of thumb from coaching practice, not research findings, and are labelled that way.

If you change a threshold, edit `src/muscles/targets.js` (zones per goal); tests check the bands stay in order.

## How it is built

```
spreadsheet / Gym logs
      |  importer.js  (CSV + XLSX parse, column guess, dates, units)
      v
sets {date, name, weight, reps, warmup}      state.importedSets  +  state.workoutLogs
      |  exercises.js  (library + fuzzy name match + your own assignments)
      v
volume.js  ->  weekly effective sets per muscle group
      |  targets.js (zones, colours)           insights.js (focus list, balance)
      v
MuscleMapOverlay.jsx  ->  colours  ->  viewer3d.js (three.js)  <-  public/models/body.glb
```

| File | Job |
| --- | --- |
| `src/muscles/taxonomy.js` | the 18 muscle groups |
| `src/muscles/exercises.js` | exercise library, name normalising and matching |
| `src/muscles/volume.js` | sets -> weekly volume, date windows, history |
| `src/muscles/targets.js` | zones per goal, the colour palette, legend |
| `src/muscles/insights.js` | where to focus, balance checks, exercise suggestions |
| `src/muscles/importer.js` | CSV/XLSX import |
| `src/muscles/demo.js` | demo training data |
| `public/models/body.glb` | the figure: one mesh per muscle group plus `base` (tendon, face) |
| `scripts/build_body_model.py` | Blender script that builds the .glb from Z-Anatomy |
| `src/muscles/viewer3d.js`, `MuscleViewer.jsx` | three.js scene, picking, colour transitions |
| `src/muscles/MuscleMapOverlay.jsx`, `ImportDialog.jsx`, `MuscleCard.jsx` | the screens |

The 3D code (three.js, about 150 KB gzipped) and the XLSX reader are separate chunks that only download when you open the map or choose a `.xlsx`. If WebGL is unavailable the list below the figure still shows the same data.

### Editing the figure

Run `Blender --background Z-Anatomy/Startup.blend --python scripts/build_body_model.py -- 140000` (the last number is the triangle budget) to rebuild the figure; the muscle-to-group mapping is the `RULES` list at the top of the script. `npm test` checks every group has a mesh. In the app: toon shading with a 4-step ramp, an inverted-hull outline, lights that follow the camera and a spring-damped view turn.

## Commands

```bash
npm test                              # engine, importer and body-model tests
python3 scripts/make-sample-sheets.py # regenerate the sample .csv/.xlsx
```


## 3D model and licence

The figure is `public/models/body.glb`, built in Blender from the Z-Anatomy muscular system (CC BY-SA 4.0, itself derived from BodyParts3D, CC BY-SA 2.1 Japan): about 340 muscle and tendon meshes sorted into the 18 groups, decimated to ~147k triangles and Draco-compressed (2.7 MB -> 0.4 MB; the decoder ships as a build asset, so nothing is fetched from a CDN). Because of the share-alike licence the model file stays under CC BY-SA 4.0 and the app should credit Z-Anatomy and BodyParts3D. The Profile card credits both sources. The model and decoder are precached by the service worker, so the map works offline.


## Animations

All of these live in `src/muscles/viewer3d.js` and switch to static versions when the device asks for reduced motion.

- **Intro sweep:** colours fill in from the feet up when the map opens.
- **Idle:** a slight breathing motion (chest and abs swell, the figure rises a hair). The weakest three muscles from "Where to focus" pulse softly.
- **Tap to focus:** selecting a muscle (tap, or a row in the focus list) flies the camera to it, from the front or back as appropriate, and swells it while the others dim. The framing keeps the muscle at ~45% of the view and never closer than half the figure, so the silhouette stays readable and you can tell where you are. Deselecting, or any preset view, zooms back out.
- **Preset views:** `Front/Back/L/R` always clear the selection and reframe the whole body. They used to keep both, which cropped the figure and dimmed everything but the selected muscle - a back view then looked untrained when it was not.
- **Muscle labels:** names are plain DOM positioned over the canvas each frame. Only muscles facing the camera are labelled, overlapping ones are dropped, and the cap is 6 on a phone and 14 on a wider screen. Each label is anchored to the centroid of *one side* of the muscle: a left/right pair shares a mesh, so its bounding-box centre sits on the midline and would caption the belly "Forearms". The `Aa` button toggles them.
- **Week time-lapse:** the play button in the period bar steps from the oldest week with data to the latest, recolouring the figure each second.


## Recovery mode

A second way to colour the body, next to weekly sets. It answers "what should I
train today?" rather than "am I doing enough?".

Each group is coloured by how long since its last real session (warm-ups and
anything outside a 21-day lookback are ignored): worked today, recovering,
nearly ready, ready, or not trained at all. Recovery is always measured from
today, so the period arrows and the time-lapse are hidden in this mode.

The window scales with that session's size — up to 4 effective sets gets 2 days,
up to 10 gets 3, more than that gets 4. The reasoning, with caveats, is at the
top of `src/muscles/recovery.js`: muscle protein synthesis stays raised for
roughly 24-48 h, force and soreness usually clear in 24-72 h, and two sessions a
week per muscle beat one at matched volume. So "ready" is a nudge to train the
muscle again, not a warning to stay away from it — and it is a rule of thumb
from population averages, not a readiness test.

The panel below the figure lists what is ready (longest-rested first, with
never-trained groups last) and what is still resting with a rough days-to-go.
Every muscle's detail card carries a "Last trained" line in both modes.


## Set quality (RIR)

Each working set can record **reps in reserve** - how many more reps you could
have done. The Gym tab has a small `RIR` picker beside weight and reps, warm-ups
never carry one, and leaving it blank means "not recorded". A spreadsheet import
picks up a `RIR` column, and an `RPE` column too: RPE is the same idea upside
down (RPE 10 = nothing left), so it is converted with `RIR = 10 - RPE`.

A muscle's detail card then shows how many of its sets were taken within
`HARD_SET_RIR` (3) reps of failure, plus the average reps left in reserve.

**RIR does not change the set counts.** Sets taken far from failure drive less
growth, so discounting them is tempting, but silently reweighting every number
the moment RIR starts being logged would make your own history inconsistent.
It is shown first; quality-weighting can become an explicit setting later.

## Acting on the advice

"Ways to add volume" chips add the exercise straight into a day of your workout
plan (3 sets of 8-12), then offer to jump to the Gym tab. Previously the advice
named an exercise and left you to remember it.
