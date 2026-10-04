# Coachbook

A web app version of the online-coaching client spreadsheet (Dashboard, Timeline,
Check-In, Training, Logbook, Meal Plan, Photos, Supplements, plus the exercise
and food databases). It imports an existing client workbook (.xlsx) and keeps
working from there.

All data stays in the browser (IndexedDB). Nothing is uploaded. No client data
is stored in this repository.

## Two ways to use it

On first open the app asks who uses the device.

- **Coach** (laptop or phone): all clients in one list with who needs a review,
  a one-screen weekly review per client, and every planning screen.
- **Client** (their phone): six simple tabs: Today, Check-in, Workout, Meals,
  Progress, More. Plain language throughout: ratings show words ("4 = Good"),
  tempo and RIR are written out ("3 s down, 1 s pause, 1 s up", "stop when you
  could do about 2 more reps"), and only nine daily items are required.

The coach can press **Client view** (the eye button) to see exactly what a client sees.

### On phones

Both roles get a bottom tab bar. The coach's bar holds All clients, Overview,
Weekly review and Check-ins; **More** opens every other section. Controls are at
least 40px tall on touch screens, fields use 16px text so iPhones don't zoom in,
and wide tables scroll sideways with the first column pinned.

Hosted as a website (see Deploying), the app can be added to the home screen and
opens without a connection after the first visit: a service worker saves the
app's files. Data was already stored on the device.

### Keeping coach and client in sync (no server)

1. Coach: Weekly review → **Send plan & feedback**. This shares a small `.txt`
   file (WhatsApp, email…).
2. Client: opens the file in the app (first run, or More → Files from your
   coach). Their own logs are never overwritten.
3. Client logs daily. On check-in day: **Send my check-in**, which shares a file
   back. Recent progress photos can be included.
4. Coach: All clients → Add or update a client → **Open check-in file**. The
   client's logs merge in; the coach's feedback and plan are kept.

Each side only overwrites what it owns: the client owns daily logs,
measurements, weekly answers and the logbook; the coach owns the plan, targets,
schedule and feedback.

## Coach screens

| Screen | Replaces sheet | What it does |
| --- | --- | --- |
| All clients | — | Every client with status (needs review / up to date), weight trend, days logged and the main flags |
| Weekly review | — | Flags in plain words (missed weigh-ins, steps or calories off target, short sleep, high stress, missed workouts), the week next to the week before and targets, the client's answers, measurement changes, photos, feedback, next week's targets, send the plan |
| Overview | Dashboard | Current week and phase, weekly-average weight with change, this week's check-in progress, steps and calories vs target, bodyweight chart, nutrition targets, goals, training split, habits, guide |
| Check-in | Check-In | Daily form (phone-friendly day view) or full week grid. Weekly averages are calculated the same way as the sheet. Weekly measurements, weekly summary questions, coach feedback, "complete" flag |
| Timeline | Timeline | Week-by-week table: phase, averages from the check-ins, coach targets and notes. Bodyweight and steps charts, measurement trends |
| Training | Training | Program days with sets, reps, tempo, RIR, technique, rest, set-up notes and video links from the library. Weekly sets per body part |
| Logbook | Logbook | Log kg × reps per set. Last week's numbers show as the target to beat. Volume, top set, estimated 1RM trend, full history |
| Meal plan | Meal Plan (1–3) | Day types (e.g. high / low days), meals and foods with macros from the food library, calorie-matched swaps |
| Photos | Photos | Upload progress photos per week and pose, compare any two weeks side by side |
| Supplements | Supplements | Supplement list with dose, timing, notes and links |
| Library | Exercise / Nutrition Database | Searchable, editable exercise and food libraries shared by all clients |
| Settings | — | Import workbooks, add or delete clients, back up and restore, device role |

## Importing a workbook

All clients → Add or update a client → **Choose workbook…** and pick the client's `.xlsx`. From Google
Sheets, download it first with File → Download → Microsoft Excel (.xlsx).

The importer reads values at the template's fixed cell positions. It uses the
last calculated value of each formula (it does not recalculate), and imports
only values that were typed into the check-in, not the template's auto-filled
cells. Progress photos embedded in the Photos sheet are imported too.

After an import, the Dashboard lists anything odd it found in the spreadsheet,
for example a dashboard that reads targets from an empty meal plan, or week
numbers that don't line up between sheets.

The hidden PEDs sheet is not imported.

## Calculations

`src/lib/calc.ts` reproduces the spreadsheet formulas so imported numbers match:

- Weekly averages: `ROUND(AVERAGE)` per metric, calories average only non-zero
  days, cardio is a weekly total, yes/no fields count "Yes" days.
- Meal plan: each macro is `ROUND(qty / serving × macro)`, calories are
  4/4/9 from the rounded macros. Swaps are calorie-matched: grams and mL round
  to whole numbers, other units to the nearest 0.5.
- Training volume: each exercise's sets count toward its primary and secondary
  body part.
- Current week: `ROUNDUP((today + 1 − week-1 start) / 7)`.
- Rounding works like Excel's `ROUND` (half away from zero, at 15 significant
  digits), and `MROUND` for swaps.
- Food and exercise names are looked up like `VLOOKUP(…, FALSE)`: case doesn't
  matter, and if a name is listed twice the first row is used. The import
  warns when duplicates have different values.

`src/lib/formulas.test.ts` checks this cell by cell against the values the
spreadsheet calculated: every weekly check-in average for all 52 weeks, every
meal-plan line, swap, meal total and day total on all three meal-plan sheets,
and the Timeline columns (2,146 values for the sample client file).

A few spreadsheet behaviours were corrected on purpose:

- Bedtimes are averaged as clock times, so 23:30 and 00:30 average to 00:00
  (the sheet's plain average gives 12:00).
- "No" and "-" are not counted as a craving or a digestive issue, and "Rest
  day" is not counted as a workout.
- The weekly weight change is left blank when the previous week has no
  weigh-ins (the sheet subtracted zero and showed the full bodyweight).
- Week numbers count from the first check-in week everywhere.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run build        # static site in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

To check the importer against a real client workbook (never commit it):

```bash
COACH_XLSX=/path/to/client.xlsx npm test
```

Those tests compare the app's numbers with the values cached in the workbook
(see Calculations above).

## Deploying

`npm run build` produces a static site in `dist/` that can be served from any
static host over HTTPS (GitHub Pages, Netlify, Cloudflare Pages, S3). There is
no server. The build also writes `dist/sw.js` (from `sw.template.js`) with the
list of this build's files, for offline use.

The screens load in two chunks, so a client's phone never downloads the coach
screens, and the spreadsheet importer (ExcelJS) only loads when a coach imports
a workbook.

## Limitations

- Data lives in one browser per device. Coach and client exchange files by
  hand; there is no live sync. That needs a backend with accounts, which this
  version does not have. Use Settings → Download backup to keep a copy.
- Exporting back to `.xlsx` is not supported. Backups are JSON.
