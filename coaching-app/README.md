# Coachbook

A web app version of the online-coaching client spreadsheet (Dashboard, Timeline,
Check-In, Training, Logbook, Meal Plan, Photos, Supplements, plus the exercise
and food databases). It imports an existing client workbook (.xlsx) and keeps
working from there.

All data stays in the browser (IndexedDB). Nothing is uploaded. No client data
is stored in this repository.

## What each screen does

| Screen | Replaces sheet | What it does |
| --- | --- | --- |
| Dashboard | Dashboard | Current week and phase, weekly-average weight with change, this week's check-in progress, steps and calories vs target, bodyweight chart, nutrition targets, goals, training split, habits, guide |
| Check-in | Check-In | Daily form (phone-friendly day view) or full week grid. Weekly averages are calculated the same way as the sheet. Weekly measurements, weekly summary questions, coach feedback, "complete" flag |
| Timeline | Timeline | Week-by-week table: phase, averages from the check-ins, coach targets and notes. Bodyweight and steps charts, measurement trends |
| Training | Training | Program days with sets, reps, tempo, RIR, technique, rest, set-up notes and video links from the library. Weekly sets per body part |
| Logbook | Logbook | Log kg × reps per set. Last week's numbers show as the target to beat. Volume, top set, estimated 1RM trend, full history |
| Meal plan | Meal Plan (1–3) | Day types (e.g. high / low days), meals and foods with macros from the food library, calorie-matched swaps |
| Photos | Photos | Upload progress photos per week and pose, compare any two weeks side by side |
| Supplements | Supplements | Supplement list with dose, timing, notes and links |
| Library | Exercise / Nutrition Database | Searchable, editable exercise and food libraries shared by all clients |
| Clients & data | — | Import workbooks, add or delete clients, back up and restore |

## Importing a workbook

Clients & data → **Choose workbook…** and pick the client's `.xlsx`. From Google
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

A few spreadsheet behaviours were corrected on purpose:

- Bedtimes are averaged as clock times, so 23:30 and 00:30 average to 00:00
  (the sheet's plain average gives 12:00).
- "No" and "-" are not counted as a craving or a digestive issue.
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

That test compares the app's weekly averages, current weight, meal-plan totals
and training volume against the values cached in the workbook.

## Deploying

`npm run build` produces a static site in `dist/` that can be served from any
static host (GitHub Pages, Netlify, Cloudflare Pages, S3). There is no server.

## Limitations

- Data lives in one browser on one device. Use Clients & data → Download backup
  to move it or keep a copy. Coach and client do not share data in real time;
  that needs a backend with accounts, which this version does not have.
- Exporting back to `.xlsx` is not supported. Backups are JSON.
