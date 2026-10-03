// Pure calculations. Each one reproduces a formula from the spreadsheet so
// imported data shows the same numbers it showed in the sheet.

import {
  CHECKIN_FIELDS,
  type Agg,
  type CheckInWeek,
  type Client,
  type DayEntry,
  type DayPlan,
  type Exercise,
  type Food,
  type FoodItem,
  type LoggedSet,
  type Meal,
  type Num,
  type ProgramDay,
} from '../types';

// ---------------------------------------------------------------- numbers

/** Excel ROUND: half away from zero. Like Excel, the value is first taken to
 * 15 significant digits, so 1.005 rounds to 1.01 even though its binary value
 * is slightly below 1.005. */
export function round(n: number, digits = 0): number {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** digits;
  const x = Number((Math.abs(n) * f).toPrecision(15));
  const r = Math.round(x) / f;
  return n < 0 ? -r : r;
}

/** Excel MROUND. */
export function mround(n: number, multiple: number): number {
  return round(n / multiple) * multiple;
}

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function nums(values: unknown[]): number[] {
  return values.filter(isNum);
}

export function average(values: unknown[]): number | null {
  const n = nums(values);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

// ---------------------------------------------------------------- dates

/** Parse YYYY-MM-DD as a local date at midnight. */
export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp, for display. */
export function localDate(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? '' : toISODate(d);
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

const DAY_MS = 86_400_000;

export function daysBetween(fromISO: string, to: Date): number | null {
  const from = parseDate(fromISO);
  if (!from) return null;
  const t = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((t.getTime() - from.getTime()) / DAY_MS);
}

/** Week number containing `today`, counting week 1 from `week1Date`. Same as
 * ROUNDUP((TODAY()+1-start)/7,0) in the sheet. */
export function currentWeek(week1Date: string, today = new Date()): number | null {
  const d = daysBetween(week1Date, today);
  if (d === null) return null;
  return Math.max(1, Math.floor(d / 7) + 1);
}

/** First day of week `week` (1-based). */
export function weekStart(week1Date: string, week: number): string {
  return addDays(week1Date, (week - 1) * 7);
}

/** "39 weeks 4 days" until the goal date, like the Dashboard. */
export function timeUntil(goalDate: string, today = new Date()): string {
  const goal = parseDate(goalDate);
  if (!goal) return '';
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((goal.getTime() - t.getTime()) / DAY_MS);
  if (days < 0) return `${-days} days ago`;
  if (days === 0) return 'Today';
  const w = Math.floor(days / 7);
  const d = days % 7;
  const parts: string[] = [];
  if (w) parts.push(`${w} week${w === 1 ? '' : 's'}`);
  if (d) parts.push(`${d} day${d === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export function ageOn(dob: string, today = new Date()): number | null {
  const b = parseDate(dob);
  if (!b) return null;
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString(undefined, opts) : '';
}

// ---------------------------------------------------------------- times

/** "HH:MM" -> minutes after midnight. */
export function clockToMinutes(s: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Circular mean of clock times, so 23:30 and 00:30 average to 00:00
 * (the spreadsheet's plain AVERAGE gives 12:00 for that pair). */
export function averageClock(times: (string | undefined)[]): string | null {
  const mins = times.map(clockToMinutes).filter(isNum);
  if (!mins.length) return null;
  let x = 0;
  let y = 0;
  for (const m of mins) {
    const a = (m / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null;
  let a = Math.atan2(y, x);
  if (a < 0) a += 2 * Math.PI;
  return minutesToClock((a / (2 * Math.PI)) * 1440);
}

export function formatHours(h: number | null): string {
  if (h === null) return '';
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

// ---------------------------------------------------------------- check-in

export function emptyWeek(): CheckInWeek {
  return {
    days: Array.from({ length: 7 }, () => ({})),
    measurements: {},
    summary: { wins: '', struggles: '', improve: '', coachHelp: '', comments: '' },
    complete: false,
    coachFeedback: '',
  };
}

const NOT_AN_ENTRY = /^(no|none|nil|n\/a|na|-+|—|0)$/i;

/** A free-text answer that actually reports something ("No" or "-" doesn't). */
export function isRealEntry(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s !== '' && !NOT_AN_ENTRY.test(s);
}

/** A logged training session ("Rest day" and "-" are not workouts). */
export function isWorkout(v: unknown): boolean {
  return isRealEntry(v) && !/^(rest|off)\b/i.test(String(v).trim());
}

export type SummaryValue = number | string | null;

export function aggregate(agg: Agg, values: unknown[]): SummaryValue {
  switch (agg) {
    case 'avg1': {
      const a = average(values);
      return a === null ? null : round(a, 1);
    }
    case 'avg0': {
      const a = average(values);
      return a === null ? null : round(a, 0);
    }
    case 'avgNonZero0': {
      const a = average(nums(values).filter((v) => v !== 0));
      return a === null ? null : round(a, 0);
    }
    case 'sum': {
      const n = nums(values);
      return n.length ? n.reduce((a, b) => a + b, 0) : null;
    }
    case 'countYes':
      return values.some((v) => v !== undefined && v !== null && v !== '')
        ? values.filter((v) => String(v).toLowerCase() === 'yes').length
        : null;
    case 'countIrregular':
      return values.some((v) => v)
        ? values.filter((v) => String(v).toLowerCase() === 'irregular').length
        : null;
    case 'countText':
      return values.some((v) => v !== undefined && v !== null && v !== '') ? values.filter(isRealEntry).length : null;
    case 'countWorkouts':
      return values.some((v) => v !== undefined && v !== null && v !== '') ? values.filter(isWorkout).length : null;
    case 'avgHours': {
      const a = average(values);
      return a === null ? null : round(a, 2);
    }
    case 'avgClock':
      return averageClock(values as string[]);
    case 'none':
      return null;
  }
}

export type WeekSummary = Partial<Record<keyof DayEntry, SummaryValue>>;

export function summarizeWeek(week: CheckInWeek | undefined): WeekSummary {
  const out: WeekSummary = {};
  if (!week) return out;
  for (const f of CHECKIN_FIELDS) {
    if (f.agg === 'none') continue;
    out[f.key] = aggregate(
      f.agg,
      week.days.map((d) => d[f.key]),
    );
  }
  return out;
}

/** Cycle day for a day with no entry, counted on from the most recent entry
 * in the previous 45 days (the sheet's "+1 per day" behaviour). */
export function inferCycleDay(client: Client, week: number, day: number): number | null {
  for (let back = 1; back <= 45; back++) {
    const abs = (week - 1) * 7 + day - back;
    if (abs < 0) return null;
    const w = Math.floor(abs / 7) + 1;
    const d = abs % 7;
    const v = client.checkIns[w]?.days[d]?.cycleDay;
    if (isNum(v)) return v + back;
  }
  return null;
}

/** Number of days in a week with at least one value entered. */
export function daysLogged(week: CheckInWeek | undefined): number {
  if (!week) return 0;
  return week.days.filter((d) => Object.values(d).some((v) => v !== undefined && v !== null && v !== '')).length;
}

export interface WeekRow {
  week: number;
  date: string;
  avgBw: number | null;
  change: number | null;
  kcal: number | null;
  steps: number | null;
  cardio: number | null;
}

/** Timeline "from tracker" columns for every week up to `weeks`. */
export function weeklyRows(client: Client, weeks: number): WeekRow[] {
  const rows: WeekRow[] = [];
  let prev: number | null = null;
  for (let w = 1; w <= weeks; w++) {
    const s = summarizeWeek(client.checkIns[w]);
    const avgBw = isNum(s.bw) ? s.bw : null;
    rows.push({
      week: w,
      date: weekStart(client.week1Date, w),
      avgBw,
      change: avgBw !== null && prev !== null ? round(avgBw - prev, 1) : null,
      kcal: isNum(s.kcal) ? s.kcal : null,
      steps: isNum(s.steps) ? s.steps : null,
      cardio: isNum(s.cardioMin) && s.cardioMin !== 0 ? s.cardioMin : null,
    });
    // The sheet compares to the row directly above, blank or not.
    prev = avgBw;
  }
  return rows;
}

/** Highest week number that has any check-in data. */
export function lastLoggedWeek(client: Client): number {
  let last = 0;
  for (const [k, w] of Object.entries(client.checkIns)) {
    if (daysLogged(w) > 0 || Object.values(w.measurements).some(isNum)) last = Math.max(last, Number(k));
  }
  return last;
}

/** Latest weekly average bodyweight (Dashboard "current weight"). */
export function latestWeight(client: Client): { week: number; kg: number } | null {
  const weeks = Object.keys(client.checkIns)
    .map(Number)
    .sort((a, b) => b - a);
  for (const w of weeks) {
    const s = summarizeWeek(client.checkIns[w]);
    if (isNum(s.bw)) return { week: w, kg: s.bw };
  }
  return null;
}

// ---------------------------------------------------------------- nutrition

export interface Macros {
  kcal: number;
  pro: number;
  cho: number;
  fat: number;
}

export const ZERO: Macros = { kcal: 0, pro: 0, cho: 0, fat: 0 };

const libKey = (name: string) => name.trim().toLowerCase();

/** Name lookup that works like the sheet's VLOOKUP(…, FALSE): case doesn't
 * matter and, when a name is listed twice, the first row wins. */
function firstWins<T extends { name: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = libKey(r.name);
    if (!m.has(k)) m.set(k, r);
  }
  return m;
}

/** Add library entries from an import or a coach's file. Incoming entries
 * replace existing ones with the same name; within each list the first entry
 * for a name wins, as in the spreadsheet. */
export function mergeLibrary<T extends { name: string }>(existing: T[], incoming: T[]): T[] {
  const map = firstWins(existing);
  for (const [k, v] of firstWins(incoming)) map.set(k, v);
  return [...map.values()];
}

export function foodIndex(foods: Food[]): Map<string, Food> {
  return firstWins(foods);
}

export function findFood(index: Map<string, Food>, name: string): Food | undefined {
  return index.get(libKey(name));
}

/** Macros for one meal-plan line. Each macro is ROUND((qty/serving)*macro, 0)
 * and calories are 4/4/9 from those rounded macros, as in the sheet. */
export function itemMacros(item: FoodItem, index: Map<string, Food>): Macros | null {
  const food = findFood(index, item.food);
  if (!food || !isNum(item.qty) || !food.amount) return null;
  const ratio = item.qty / food.amount;
  const pro = round(ratio * food.pro);
  const cho = round(ratio * food.cho);
  const fat = round(ratio * food.fat);
  return { pro, cho, fat, kcal: round(pro * 4 + cho * 4 + fat * 9) };
}

export function addMacros(a: Macros, b: Macros | null): Macros {
  if (!b) return a;
  return { kcal: a.kcal + b.kcal, pro: a.pro + b.pro, cho: a.cho + b.cho, fat: a.fat + b.fat };
}

export function mealMacros(meal: Meal, index: Map<string, Food>): Macros {
  const m = meal.items.reduce((acc, it) => addMacros(acc, itemMacros(it, index)), ZERO);
  // Meal totals in the sheet recompute calories from the summed macros.
  return { ...m, kcal: m.pro * 4 + m.cho * 4 + m.fat * 9 };
}

export function dayMacros(day: DayPlan, index: Map<string, Food>): Macros {
  return day.meals.reduce((acc, meal) => {
    const m = meal.items.reduce((a, it) => addMacros(a, itemMacros(it, index)), ZERO);
    return addMacros(acc, m);
  }, ZERO);
}

/** Calorie-matched quantity of a swap food ("optional switches" column):
 * grams/mL round to whole numbers, other units to the nearest half. */
export function swapQuantity(item: FoodItem, index: Map<string, Food>): { qty: number; unit: string } | null {
  if (!item.swap) return null;
  const alt = findFood(index, item.swap);
  const m = itemMacros(item, index);
  // The sheet shows nothing when the line has no calories or the swap has none.
  if (!alt || !m || !m.kcal || !alt.kcal) return null;
  const raw = (alt.amount * m.kcal) / alt.kcal;
  // Excel's = comparison ignores case, so "G" and "ml" count too.
  const unit = alt.unit.trim().toLowerCase();
  const grams = unit === 'g' || unit === 'ml';
  return { qty: grams ? round(raw) : mround(raw, 0.5), unit: alt.unit };
}

// ---------------------------------------------------------------- training

export function exerciseIndex(exercises: Exercise[]): Map<string, Exercise> {
  return firstWins(exercises);
}

/** Weekly working sets per body part. An exercise counts its sets toward both
 * its primary and secondary body part, like the sheet's volume table. */
export function volumeByMuscle(program: ProgramDay[], exercises: Exercise[]): Map<string, number> {
  const idx = exerciseIndex(exercises);
  const out = new Map<string, number>();
  for (const day of program) {
    for (const ex of day.exercises) {
      const info = idx.get(ex.name.trim().toLowerCase());
      if (!info || !isNum(ex.sets)) continue;
      for (const part of [info.primary, info.secondary]) {
        if (part) out.set(part, (out.get(part) ?? 0) + ex.sets);
      }
    }
  }
  return out;
}

export interface SetStats {
  topKg: number | null;
  volume: number; // sum of kg x reps
  bestE1rm: number | null; // Epley estimate
  sets: number;
}

export function setStats(sets: LoggedSet[] | undefined): SetStats {
  let topKg: number | null = null;
  let volume = 0;
  let bestE1rm: number | null = null;
  let count = 0;
  for (const s of sets ?? []) {
    if (!isNum(s.kg) || !isNum(s.reps) || s.reps <= 0) continue;
    count++;
    topKg = topKg === null ? s.kg : Math.max(topKg, s.kg);
    volume += s.kg * s.reps;
    const e = s.kg * (1 + s.reps / 30);
    bestE1rm = bestE1rm === null ? e : Math.max(bestE1rm, e);
  }
  return { topKg, volume: round(volume, 1), bestE1rm: bestE1rm === null ? null : round(bestE1rm, 1), sets: count };
}

export function hasSets(sets: LoggedSet[] | undefined): boolean {
  return (sets ?? []).some((s) => isNum(s.kg) || isNum(s.reps));
}

export function letter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`;
}

// ---------------------------------------------------------------- misc

/** Only http(s) links are rendered; anything else (javascript:, data:) is dropped. */
export function safeHref(url: string | undefined): string | undefined {
  const u = (url ?? '').trim();
  return /^https?:\/\//i.test(u) ? u : undefined;
}

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function num(v: Num | undefined, digits = 0): string {
  if (!isNum(v)) return '';
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Where today falls in the program: week number and Monday-first day index.
 * `beforeStart` is true when the program hasn't started yet. */
export function todayPosition(week1Date: string, today = new Date()): { week: number; day: number; iso: string; beforeStart: boolean } {
  const week = currentWeek(week1Date, today) ?? 1;
  const d = daysBetween(weekStart(week1Date, week), today) ?? 0;
  return { week, day: Math.min(6, Math.max(0, d)), iso: toISODate(today), beforeStart: d < 0 };
}

/** Most recent coach feedback, newest week first. */
export function latestFeedback(client: Client): { week: number; text: string } | null {
  const weeks = Object.keys(client.checkIns)
    .map(Number)
    .sort((a, b) => b - a);
  for (const w of weeks) {
    const t = client.checkIns[w].coachFeedback?.trim();
    if (t) return { week: w, text: t };
  }
  return null;
}
