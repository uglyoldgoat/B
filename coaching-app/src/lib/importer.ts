// Reads a client workbook built from the coaching spreadsheet template and
// converts it to a Client. Cell positions follow the template's layout.
// Formulas are not re-evaluated: their last calculated values are read.

import type ExcelJS from 'exceljs';
import {
  CHECKIN_FIELDS,
  DEFAULT_POSES,
  DEFAULT_SITES,
  SUMMARY_QUESTIONS,
  WEEKDAYS,
  type CheckInWeek,
  type Client,
  type DayEntry,
  type DayPlan,
  type Exercise,
  type Food,
  type FoodItem,
  type GuideEntry,
  type LoggedSet,
  type Meal,
  type Num,
  type ProgramDay,
  type ProgramExercise,
  type Supplement,
  type TimelineWeek,
} from '../types';
import { emptyWeek, formatDate, isNum, minutesToClock, uid } from './calc';

type Sheet = ExcelJS.Worksheet;

export interface ImportedPhoto {
  week: number;
  pose: number;
  data: Uint8Array;
  type: string;
}

export interface ImportResult {
  client: Client;
  exercises: Exercise[];
  foods: Food[];
  photos: ImportedPhoto[];
  notes: string[];
}

// ------------------------------------------------------------ cell helpers

function unwrap(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return unwrap(o.result);
    if ('formula' in o || 'sharedFormula' in o) return null; // formula with no cached value
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join('');
    }
    if ('error' in o) return null;
    if ('text' in o) return unwrap(o.text);
  }
  return v;
}

function cellRaw(ws: Sheet | undefined, row: number, col: number): unknown {
  if (!ws) return null;
  return unwrap(ws.getCell(row, col).value);
}

function isFormula(ws: Sheet, row: number, col: number): boolean {
  const v = ws.getCell(row, col).value as Record<string, unknown> | null;
  return !!v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v);
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return utcDate(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v).trim();
}

function toNum(v: unknown): Num {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const s = v.replace(/,/g, '').trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  return null;
}

function utcDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function toDate(v: unknown): string {
  if (v instanceof Date) return utcDate(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return utcDate(new Date(EXCEL_EPOCH + v * 86_400_000));
  if (typeof v === 'string') {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(v.trim());
    if (dmy) {
      const y = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
      return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
  }
  return '';
}

/** Minutes after midnight from a time cell, or null. */
function toMinutes(v: unknown): number | null {
  if (v instanceof Date) {
    const mins = Math.round((v.getTime() - EXCEL_EPOCH) / 60000);
    return ((mins % 1440) + 1440) % 1440;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 0 && v < 1) return Math.round(v * 1440);
    if (v >= 1 && v <= 24) return Math.round(v * 60) % 1440;
    return null;
  }
  if (typeof v === 'string') {
    const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(v.trim());
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    const ap = m[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  return null;
}

/** Sleep duration in hours from a number of hours, a time cell or "7:30". */
function toHours(v: unknown): Num {
  if (v instanceof Date) return Math.round(((v.getTime() - EXCEL_EPOCH) / 3_600_000) * 100) / 100;
  if (typeof v === 'number' && Number.isFinite(v)) return v > 0 && v < 1 ? Math.round(v * 2400) / 100 : v;
  if (typeof v === 'string') {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(v.trim());
    if (m) return Number(m[1]) + Number(m[2]) / 60;
    return toNum(v);
  }
  return null;
}

function yesNo(v: unknown): string {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  const s = str(v).toLowerCase();
  if (s.startsWith('y')) return 'Yes';
  if (s.startsWith('n')) return 'No';
  return str(v);
}

function link(ws: Sheet | undefined, row: number, col: number): string {
  if (!ws) return '';
  const cell = ws.getCell(row, col);
  const v = cell.value as Record<string, unknown> | null;
  const h = (v && typeof v === 'object' && typeof v.hyperlink === 'string' ? v.hyperlink : '') || cell.hyperlink || '';
  if (h) return h;
  const t = str(unwrap(v));
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t) && t.length > 'www.youtube.com'.length) return `https://${t}`;
  return '';
}

function sheet(wb: ExcelJS.Workbook, name: string): Sheet | undefined {
  return wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());
}

// ------------------------------------------------------------ sections

function readProfile(ws: Sheet | undefined) {
  const g = (a: string) => (ws ? unwrap(ws.getCell(a).value) : null);
  const goals = (rows: number[]) =>
    rows
      .map((r) => ({ text: str(g(`C${r}`)), done: g(`O${r}`) === true }))
      .filter((x) => x.text);
  const guide: GuideEntry[] = [];
  for (let r = 45; r <= 70; r++) {
    const t = str(g(`A${r}`));
    if (!t || t.length < 20) continue;
    const [title, ...rest] = t.split('\n');
    guide.push({ title: title.trim(), body: rest.join('\n').trim() });
  }
  const splitCols = ['A', 'E', 'I', 'M', 'S', 'W', 'AA'];
  return {
    name: str(g('E4')),
    dob: toDate(g('E5')),
    heightCm: toNum(g('E6')),
    startWeightKg: toNum(g('E7')),
    coachingStart: toDate(g('E11')),
    goal: str(g('E13')),
    goalDate: toDate(g('E14')),
    checkInDay: WEEKDAYS.includes(str(g('E16'))) ? str(g('E16')) : '',
    stepsTarget: toNum(g('I13')),
    cardioTarget: str(g('J13')),
    trainingFocus: str(g('M13')),
    habits: [20, 21, 22, 23, 24].map((r) => str(g(`C${r}`))).filter(Boolean),
    shortTermGoals: goals([28, 29, 30]),
    longTermGoals: goals([32, 33, 34]),
    whys: [36, 37, 38].map((r) => str(g(`C${r}`))).filter(Boolean),
    weeklySplit: splitCols.map((c) => {
      const v = str(g(`${c}43`));
      return v === '-' ? '' : v;
    }),
    guide,
  };
}

function readTimeline(ws: Sheet | undefined, notes: string[]): Record<number, TimelineWeek> {
  const out: Record<number, TimelineWeek> = {};
  if (!ws) return out;
  const seen = new Map<number, number[]>();
  let pedText = false;
  for (let r = 8; r <= 59; r++) {
    const week = r - 7;
    const labelled = toNum(cellRaw(ws, r, 2));
    if (labelled !== null) seen.set(labelled, [...(seen.get(labelled) ?? []), week]);
    const t: TimelineWeek = {
      phase: str(cellRaw(ws, r, 4)),
      intakeHigh: toNum(cellRaw(ws, r, 10)),
      intakeMed: toNum(cellRaw(ws, r, 11)),
      intakeLow: toNum(cellRaw(ws, r, 12)),
      cardio: str(cellRaw(ws, r, 13)),
      steps: toNum(cellRaw(ws, r, 14)),
      training: str(cellRaw(ws, r, 15)),
      supplements: str(cellRaw(ws, r, 16)),
      goals: str(cellRaw(ws, r, 18)),
      notes: str(cellRaw(ws, r, 19)),
    };
    if (str(cellRaw(ws, r, 17))) pedText = true;
    if (Object.values(t).some((v) => v !== '' && v !== null)) out[week] = t;
  }
  for (const [label, weeks] of seen) {
    if (weeks.length > 1) {
      notes.push(
        `Timeline: week number ${label} appears ${weeks.length} times (rows for weeks ${weeks.join(' and ')}), so one week number is missing. The app numbers weeks by position.`,
      );
    }
  }
  if (pedText) notes.push('Timeline: the PEDs column has entries. It is not imported.');
  return out;
}

function readCheckIns(
  ws: Sheet | undefined,
  notes: string[],
): { week1Date: string; sites: string[]; weeks: Record<number, CheckInWeek> } {
  const weeks: Record<number, CheckInWeek> = {};
  if (!ws) return { week1Date: '', sites: DEFAULT_SITES, weeks };
  const week1Date = toDate(cellRaw(ws, 4, 4));
  const sites = Array.from({ length: 8 }, (_, i) => str(cellRaw(ws, 9, 4 + i)) || DEFAULT_SITES[i]);
  let shiftedBedtimes = 0;
  const maxCol = ws.columnCount;

  for (let w = 0; w < 104; w++) {
    const start = 4 + 9 * w;
    if (start > maxCol) break;
    const wk = emptyWeek();
    let any = false;

    for (let d = 0; d < 7; d++) {
      const day: DayEntry = {};
      for (const f of CHECKIN_FIELDS) {
        // Only values the client typed. Formula cells are template auto-fill
        // (cycle day counts itself forward through the whole year).
        if (isFormula(ws, f.row, start + d)) continue;
        const v = cellRaw(ws, f.row, start + d);
        if (v === null || v === '') continue;
        let val: unknown;
        switch (f.type) {
          case 'number':
          case 'scale5':
          case 'scale7':
            val = f.key === 'sleepHrs' ? toHours(v) : toNum(v);
            break;
          case 'time': {
            const mins = toMinutes(v);
            if (mins !== null && f.key === 'bedTime' && !(typeof v === 'string' && /am|pm/i.test(v))) {
              // Bedtimes typed on a 12-hour clock: 11:30 means 23:30 and 12:30 means 00:30.
              const h = Math.floor(mins / 60);
              if (h >= 6 && h <= 12) {
                shiftedBedtimes++;
                val = minutesToClock(h === 12 ? mins - 720 : mins + 720);
                break;
              }
            }
            val = mins !== null ? minutesToClock(mins) : str(v);
            break;
          }
          case 'yesno':
            val = yesNo(v);
            break;
          case 'regular': {
            const s = str(v).toLowerCase();
            val = s.startsWith('irr') ? 'Irregular' : s.startsWith('reg') ? 'Regular' : str(v);
            break;
          }
          default:
            val = str(v);
        }
        if (val === null || val === '') continue;
        (day as Record<string, unknown>)[f.key] = val;
        any = true;
      }
      wk.days[d] = day;
    }

    for (let i = 0; i < 8; i++) {
      const n = toNum(cellRaw(ws, 10, start + i));
      if (n !== null) {
        wk.measurements[sites[i]] = n;
        any = true;
      }
    }
    for (const q of SUMMARY_QUESTIONS) {
      const t = str(cellRaw(ws, q.row, start));
      if (t) {
        wk.summary[q.key] = t;
        any = true;
      }
    }
    wk.complete = cellRaw(ws, 4, start + 7) === true;
    if (any || wk.complete) weeks[w + 1] = wk;
  }
  if (shiftedBedtimes) {
    notes.push(
      `Check-in: ${shiftedBedtimes} bedtimes looked like 12-hour times (for example 12:30), so they were read as night times (00:30). The sheet's plain average of those times was misleading; the app averages clock times correctly.`,
    );
  }
  return { week1Date, sites, weeks };
}

const TRAINING_HEADERS = [8, 24, 40, 56, 72, 88];
const LOGBOOK_HEADERS = [7, 23, 39, 55, 71, 87];

interface ProgramRead {
  days: ProgramDay[]; // one per template day, empty days included so positions match the logbook
  rowIds: (string | undefined)[][]; // [day][row offset] -> exercise id
}

function readProgram(ws: Sheet | undefined): ProgramRead {
  const days: ProgramDay[] = [];
  const rowIds: (string | undefined)[][] = [];
  if (!ws) return { days, rowIds };
  TRAINING_HEADERS.forEach((h, i) => {
    const title = str(cellRaw(ws, h, 2));
    const exercises: ProgramExercise[] = [];
    const ids: (string | undefined)[] = [];
    for (let k = 0; k < 12; k++) {
      const r = h + 3 + k;
      const name = str(cellRaw(ws, r, 3));
      if (!name) {
        ids.push(undefined);
        continue;
      }
      const tempo = [7, 8, 9, 10].map((c) => str(cellRaw(ws, r, c)));
      const id = uid('ex');
      ids.push(id);
      exercises.push({
        id,
        name,
        feeder: str(cellRaw(ws, r, 4)),
        sets: toNum(cellRaw(ws, r, 5)),
        reps: str(cellRaw(ws, r, 6)),
        tempo: tempo.some(Boolean) ? tempo.map((t) => t || '0').join('-') : '',
        rir: str(cellRaw(ws, r, 11)),
        technique: str(cellRaw(ws, r, 12)),
        rest: str(cellRaw(ws, r, 13)),
        notes: isFormula(ws, r, 14) ? '' : str(cellRaw(ws, r, 14)),
      });
    }
    days.push({ id: uid('day'), title: title || `Day ${i + 1}`, exercises });
    rowIds.push(ids);
  });
  return { days, rowIds };
}

function readLogbook(ws: Sheet | undefined, program: ProgramRead, notes: string[]): Record<string, LoggedSet[][]> {
  const out: Record<string, LoggedSet[][]> = {};
  if (!ws) return out;
  LOGBOOK_HEADERS.forEach((h, dayIdx) => {
    const day = program.days[dayIdx];
    if (!day) return;
    for (let k = 0; k < 12; k++) {
      // Logbook row h+3+k logs the exercise on Training row (training header)+3+k.
      const r = h + 3 + k;
      const exId = program.rowIds[dayIdx]?.[k];
      const ex = day.exercises.find((e) => e.id === exId);
      const logName = str(cellRaw(ws, r, 3));
      const weeks: LoggedSet[][] = [];
      let any = false;
      for (let w = 0; w < 52; w++) {
        const start = 5 + 9 * w;
        if (start > ws.columnCount) break;
        const sets: LoggedSet[] = [];
        for (let s = 0; s < 4; s++) {
          const kg = toNum(cellRaw(ws, r, start + 2 * s));
          const reps = toNum(cellRaw(ws, r, start + 2 * s + 1));
          sets.push({ kg, reps });
          if (kg !== null || reps !== null) any = true;
        }
        weeks.push(sets);
      }
      if (!ex) {
        if (any) notes.push(`Logbook ${day.title}: row ${k + 1} (${logName || 'no name'}) has logged sets but no exercise in the program, so it was skipped.`);
        continue;
      }
      if (logName && logName.toLowerCase() !== ex.name.toLowerCase()) {
        notes.push(`Logbook ${day.title}: logs "${logName}" where the program has "${ex.name}". The sets are kept under "${ex.name}".`);
      }
      while (weeks.length && !weeks[weeks.length - 1].some((s) => isNum(s.kg) || isNum(s.reps))) weeks.pop();
      if (weeks.length) out[ex.id] = weeks;
    }
  });
  return out;
}

function readMealPlans(wb: ExcelJS.Workbook): { days: DayPlan[]; filled: Set<string> } {
  const days: DayPlan[] = [];
  const filled = new Set<string>();
  const sheets = wb.worksheets.filter((w) => /^meal plan/i.test(w.name.trim()));
  for (const ws of sheets) {
    // A day block starts where row 3 reads MEAL | FOOD (columns G, Y and AQ in the template).
    const blockStarts = [7, 25, 43].filter(
      (c) => /^meal$/i.test(str(cellRaw(ws, 3, c))) && /^food$/i.test(str(cellRaw(ws, 3, c + 1))),
    );
    const threeBlocks = blockStarts.length === 3;
    const hidden = ws.state !== 'visible';
    blockStarts.forEach((c, k) => {
      const meals: Meal[] = [];
      for (let r = 4; r <= 34; r += 6) {
        const items: FoodItem[] = [];
        for (let i = r; i < r + 6; i++) {
          const food = str(cellRaw(ws, i, c + 1));
          if (!food) continue;
          items.push({ id: uid('fi'), food, qty: toNum(cellRaw(ws, i, c + 2)), swap: str(cellRaw(ws, i, c + 13)) });
        }
        const name = str(cellRaw(ws, r, c)).replace(/\s*\n\s*/g, ' ');
        const mealNotes = str(cellRaw(ws, r, c + 12));
        if (items.length || mealNotes) meals.push({ id: uid('meal'), name: name || `Meal ${meals.length + 1}`, notes: mealNotes, items });
      }
      if (!meals.some((m) => m.items.length)) return;
      filled.add(ws.name);
      // Summary panel: columns C/E for two-day sheets, C/D/E for three-day sheets.
      const sumCol = threeBlocks ? 3 + k : 3 + 2 * k;
      const label = str(cellRaw(ws, 7, sumCol)) || str(cellRaw(ws, 2, c)) || `Day ${k + 1}`;
      days.push({
        id: uid('plan'),
        name: hidden ? `${label} (${ws.name})` : label,
        water: toNum(cellRaw(ws, 17, sumCol)),
        meals,
        archived: hidden || undefined,
      });
    });
  }
  return { days, filled };
}

function readSupplements(ws: Sheet | undefined): Supplement[] {
  const out: Supplement[] = [];
  if (!ws) return out;
  for (let r = 9; r <= 69; r++) {
    const name = str(cellRaw(ws, r, 2));
    if (!name) continue;
    out.push({
      id: uid('sup'),
      name,
      dose: str(cellRaw(ws, r, 3)),
      timing: str(cellRaw(ws, r, 4)),
      notes: str(cellRaw(ws, r, 5)),
      link: link(ws, r, 6),
    });
  }
  return out;
}

function readExercises(ws: Sheet | undefined): Exercise[] {
  const out: Exercise[] = [];
  if (!ws) return out;
  for (let r = 3; r <= Math.max(ws.rowCount, 3); r++) {
    const name = str(cellRaw(ws, r, 3));
    if (!name) continue;
    out.push({
      name,
      primary: str(cellRaw(ws, r, 4)),
      secondary: str(cellRaw(ws, r, 5)),
      notes: str(cellRaw(ws, r, 6)),
      video: link(ws, r, 7),
    });
  }
  return out;
}

function readFoods(ws: Sheet | undefined): Food[] {
  const out: Food[] = [];
  if (!ws) return out;
  for (let r = 3; r <= Math.max(ws.rowCount, 3); r++) {
    const name = str(cellRaw(ws, r, 3));
    const amount = toNum(cellRaw(ws, r, 4));
    if (!name || amount === null) continue;
    out.push({
      name,
      amount,
      unit: str(cellRaw(ws, r, 5)) || 'g',
      kcal: toNum(cellRaw(ws, r, 6)) ?? 0,
      pro: toNum(cellRaw(ws, r, 7)) ?? 0,
      cho: toNum(cellRaw(ws, r, 8)) ?? 0,
      fat: toNum(cellRaw(ws, r, 9)) ?? 0,
      category: str(cellRaw(ws, r, 10)) || 'OTHER',
    });
  }
  return out;
}

function readPhotos(wb: ExcelJS.Workbook, ws: Sheet | undefined): { poses: string[]; photos: ImportedPhoto[] } {
  const poses = Array.from({ length: 8 }, (_, i) => str(cellRaw(ws, 15, 3 + i)) || DEFAULT_POSES[i]);
  const photos: ImportedPhoto[] = [];
  if (!ws) return { poses, photos };
  for (const img of ws.getImages()) {
    const row = img.range.tl.nativeRow; // 0-based
    const col = img.range.tl.nativeCol;
    const week = row - 14; // row 16 (index 15) is week 1
    const pose = col - 2; // column C (index 2) is pose 1
    if (week < 1 || week > 52 || pose < 0 || pose > 7) continue;
    const media = wb.getImage(Number(img.imageId)) as { buffer?: ArrayBuffer | Uint8Array; extension?: string };
    if (!media?.buffer) continue;
    const ext = (media.extension || 'jpeg').toLowerCase();
    photos.push({
      week,
      pose,
      data: media.buffer instanceof Uint8Array ? media.buffer : new Uint8Array(media.buffer),
      type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    });
  }
  return { poses, photos };
}

// ------------------------------------------------------------ entry point

export function importWorkbook(wb: ExcelJS.Workbook, fileName = ''): ImportResult {
  const notes: string[] = [];
  const dash = sheet(wb, 'Dashboard');
  const profile = readProfile(dash);
  const timeline = readTimeline(sheet(wb, 'Timeline'), notes);
  const check = readCheckIns(sheet(wb, 'Check-In'), notes);
  const programRead = readProgram(sheet(wb, 'Training'));
  const logbook = readLogbook(sheet(wb, 'Logbook'), programRead, notes);
  const program = programRead.days.filter((d) => d.exercises.length);
  const meal = readMealPlans(wb);
  const supplements = readSupplements(sheet(wb, 'Supplements'));
  const exercises = readExercises(sheet(wb, 'Exercise Database'));
  const foods = readFoods(sheet(wb, 'Nutrition Database'));
  const photoData = readPhotos(wb, sheet(wb, 'Photos'));

  const timelineDate = toDate(cellRaw(sheet(wb, 'Timeline'), 8, 3));
  const week1Date = check.week1Date || timelineDate || profile.coachingStart;

  // Checks on how the sheet was wired.
  if (dash) {
    const f = dash.getCell('K7').value as { formula?: string } | null;
    const src = /'([^']+)'!/.exec(f?.formula ?? '')?.[1];
    const active = meal.days.filter((d) => !d.archived);
    if (src && /^meal plan/i.test(src) && !meal.filled.has(src) && active.length) {
      notes.push(
        `Dashboard: nutrition targets read from "${src}", which is empty, so the sheet showed 0 kcal. The app takes targets from your current meal plan (${active.map((d) => d.name).join(', ')}).`,
      );
    }
    const archived = meal.days.filter((d) => d.archived);
    if (archived.length) {
      notes.push(`Meal plans: ${archived.length} day plan(s) found on hidden sheets were imported as archived plans. They don't count toward targets.`);
    }
  }
  if (profile.coachingStart && week1Date && profile.coachingStart !== week1Date) {
    notes.push(
      `Week numbers: the Dashboard counts from ${formatDate(profile.coachingStart, { day: 'numeric', month: 'short', year: 'numeric' })} but check-ins start on ${formatDate(week1Date, { day: 'numeric', month: 'short', year: 'numeric' })}, so the two sheets showed different "current week" numbers. The app counts every week from the first check-in.`,
    );
  }
  const splitDays = profile.weeklySplit.filter(Boolean).length;
  if (splitDays && program.length && splitDays !== program.length) {
    notes.push(
      `Training: the Dashboard's weekly split lists ${splitDays} training days but the program has ${program.length} days.`,
    );
  }

  const id = uid('client');
  const client: Client = {
    id,
    importedFrom: fileName,
    importedAt: new Date().toISOString(),
    importNotes: notes,
    profile,
    week1Date,
    timeline,
    checkIns: check.weeks,
    measurementSites: check.sites,
    program,
    logbook,
    nutritionDays: meal.days,
    supplements,
    photoPoses: photoData.poses,
    photos: {},
  };
  return { client, exercises, foods, photos: photoData.photos, notes };
}

/** Browser entry point: load ExcelJS on demand and read the file. */
export async function importFile(file: File): Promise<ImportResult> {
  const mod = await import('exceljs');
  const Excel = (mod as unknown as { default?: typeof ExcelJS }).default ?? (mod as unknown as typeof ExcelJS);
  const wb = new Excel.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return importWorkbook(wb, file.name);
}

