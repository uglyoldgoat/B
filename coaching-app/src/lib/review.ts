// Weekly review: compares a week's check-in with targets and the week before,
// and writes the things a coach would look for as short flags.

import type { Client, Food } from '../types';
import { dayMacros, daysLogged, foodIndex, formatHours, isNum, isWorkout, num, summarizeWeek, type WeekSummary } from './calc';
import { nutritionSchedule, trainingSchedule } from './schedule';

export type Tone = 'good' | 'warn' | 'info';

export interface Flag {
  tone: Tone;
  text: string;
}

export interface ReviewRow {
  label: string;
  value: string;
  prev: string;
  target: string;
  tone: Tone | null;
}

export interface WeekTargets {
  steps: number | null;
  kcal: { min: number; max: number } | null;
  protein: number | null;
  water: number | null;
  sessions: number;
  cardio: string;
}

const CUT = /diet|prep|peak|competition|photoshoot/i;
const GAIN = /gain|improvement/i;

export function phaseDirection(phase: string | undefined): 'down' | 'up' | 'none' {
  if (!phase) return 'none';
  if (CUT.test(phase)) return 'down';
  if (GAIN.test(phase)) return 'up';
  return 'none';
}

export function weekTargets(client: Client, week: number, foods: Food[]): WeekTargets {
  const tl = client.timeline[week];
  const idx = foodIndex(foods);
  const sched = nutritionSchedule(client);
  const plans = client.nutritionDays.filter((d) => !d.archived);
  let kcal: WeekTargets['kcal'] = null;
  let protein: number | null = null;
  let water: number | null = null;
  const scheduled = sched.map((id) => client.nutritionDays.find((d) => d.id === id));
  const fullSchedule = scheduled.every(Boolean);
  if (fullSchedule) {
    const m = scheduled.map((d) => dayMacros(d!, idx));
    protein = Math.round(m.reduce((a, x) => a + x.pro, 0) / 7);
    const w = scheduled.map((d) => d!.water).filter(isNum);
    water = w.length ? Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 10) / 10 : null;
  } else {
    const planP = plans.map((d) => dayMacros(d, idx).pro).filter((p) => p > 0);
    if (planP.length) protein = Math.min(...planP);
  }
  // Calories: the coach's targets for that week come first, then the average
  // of the scheduled meal-plan days, then the range of the current plans.
  const set = tl ? [tl.intakeHigh, tl.intakeMed, tl.intakeLow].filter(isNum) : [];
  if (set.length) kcal = { min: Math.min(...set), max: Math.max(...set) };
  else if (fullSchedule) {
    const avgK = Math.round(scheduled.reduce((a, d) => a + dayMacros(d!, idx).kcal, 0) / 7);
    kcal = { min: avgK, max: avgK };
  } else {
    const planK = plans.map((d) => dayMacros(d, idx).kcal).filter((k) => k > 0);
    if (planK.length) kcal = { min: Math.min(...planK), max: Math.max(...planK) };
  }
  return {
    steps: tl?.steps ?? client.profile.stepsTarget,
    kcal,
    protein,
    water,
    sessions: trainingSchedule(client).filter(Boolean).length,
    cardio: tl?.cardio || client.profile.cardioTarget,
  };
}

function sessionsDone(client: Client, week: number): number {
  return (client.checkIns[week]?.days ?? []).filter((d) => isWorkout(d.session)).length;
}

function weighIns(client: Client, week: number): number {
  return (client.checkIns[week]?.days ?? []).filter((d) => isNum(d.bw)).length;
}

function prevWithWeight(client: Client, week: number): { week: number; kg: number } | null {
  for (let w = week - 1; w >= 1; w--) {
    const s = summarizeWeek(client.checkIns[w]);
    if (isNum(s.bw)) return { week: w, kg: s.bw };
  }
  return null;
}

const v = (s: WeekSummary, k: keyof WeekSummary) => (isNum(s[k]) ? (s[k] as number) : null);
const kcalText = (k: WeekTargets['kcal']) => (!k ? '' : k.min === k.max ? `${num(k.min)} kcal` : `${num(k.min)}–${num(k.max)} kcal`);

export function weekFlags(client: Client, week: number, foods: Food[]): Flag[] {
  const flags: Flag[] = [];
  const wk = client.checkIns[week];
  const logged = daysLogged(wk);
  if (!logged) return [{ tone: 'info', text: 'No check-in entries for this week yet.' }];
  const s = summarizeWeek(wk);
  const t = weekTargets(client, week, foods);

  if (logged < 5) flags.push({ tone: 'warn', text: `Logged ${logged} of 7 days.` });
  const wi = weighIns(client, week);
  if (wi === 0) flags.push({ tone: 'warn', text: 'No weigh-ins this week.' });
  else if (wi < 3) flags.push({ tone: 'warn', text: `Weighed in on ${wi} day${wi === 1 ? '' : 's'} only, so the weekly average is not reliable.` });

  const bw = v(s, 'bw');
  const prev = prevWithWeight(client, week);
  if (bw !== null && prev) {
    const ch = Math.round((bw - prev.kg) * 10) / 10;
    const dir = phaseDirection(client.timeline[week]?.phase);
    const label = `${ch > 0 ? '+' : ch < 0 ? '−' : '±'}${Math.abs(ch).toFixed(1)} kg vs week ${prev.week}`;
    if (dir === 'down' && ch > 0.3) flags.push({ tone: 'warn', text: `Weight ${label} during a dieting phase.` });
    else if (dir === 'up' && ch < -0.3) flags.push({ tone: 'warn', text: `Weight ${label} during a gaining phase.` });
    else flags.push({ tone: 'info', text: `Weight ${label}.` });
  }

  const steps = v(s, 'steps');
  if (steps !== null && t.steps) {
    const pct = steps / t.steps;
    if (pct >= 1) flags.push({ tone: 'good', text: `Steps on target (${num(steps)} a day).` });
    else if (pct < 0.9) flags.push({ tone: 'warn', text: `Steps ${num(steps)} a day, ${Math.round(pct * 100)}% of the ${num(t.steps)} target.` });
  }
  const kcal = v(s, 'kcal');
  if (kcal !== null && t.kcal) {
    if (kcal > t.kcal.max * 1.05 || kcal < t.kcal.min * 0.95) {
      flags.push({ tone: 'warn', text: `Calories averaged ${num(kcal)}; the plan is ${kcalText(t.kcal)}.` });
    } else flags.push({ tone: 'good', text: 'Calories in line with the plan.' });
  }
  const pro = v(s, 'pro');
  if (pro !== null && t.protein && pro < t.protein * 0.9) flags.push({ tone: 'warn', text: `Protein averaged ${num(pro)} g; the plan has ${num(t.protein)} g.` });

  const done = sessionsDone(client, week);
  if (t.sessions) {
    if (done >= t.sessions) flags.push({ tone: 'good', text: `All ${t.sessions} planned workouts done.` });
    else flags.push({ tone: 'warn', text: `${done} of ${t.sessions} planned workouts logged.` });
  }

  const sleep = v(s, 'sleepHrs');
  if (sleep !== null && sleep < 7) flags.push({ tone: 'warn', text: `Sleep averaged ${formatHours(sleep)} (aim for 7 h or more).` });
  const sq = v(s, 'sleepQuality');
  if (sq !== null && sq <= 2) flags.push({ tone: 'warn', text: `Poor sleep quality (${sq}/5).` });
  const energy = v(s, 'energy');
  if (energy !== null && energy <= 2.5) flags.push({ tone: 'warn', text: `Low energy (${energy}/5).` });
  const stress = v(s, 'stress');
  if (stress !== null && stress >= 3.5) flags.push({ tone: 'warn', text: `High stress (${stress}/5).` });
  const hunger = v(s, 'hunger');
  if (hunger !== null && hunger >= 4) flags.push({ tone: 'warn', text: `Very hungry most days (${hunger}/5).` });
  const adh = v(s, 'adherence');
  if (adh !== null) {
    if (adh < 3.5) flags.push({ tone: 'warn', text: `Meal plan adherence ${adh}/5.` });
    else if (adh >= 4.5) flags.push({ tone: 'good', text: `Strong meal plan adherence (${adh}/5).` });
  }
  const ill = v(s, 'illness');
  if (ill) flags.push({ tone: 'warn', text: `Felt unwell on ${ill} day${ill === 1 ? '' : 's'}.` });
  const irr = v(s, 'stoolRegular');
  if (irr !== null && irr >= 3) flags.push({ tone: 'warn', text: `Irregular digestion on ${irr} days.` });

  const order: Record<Tone, number> = { warn: 0, info: 1, good: 2 };
  return flags.sort((a, b) => order[a.tone] - order[b.tone]);
}

export function reviewRows(client: Client, week: number, foods: Food[]): ReviewRow[] {
  const s = summarizeWeek(client.checkIns[week]);
  const p = summarizeWeek(client.checkIns[week - 1]);
  const t = weekTargets(client, week, foods);
  const f = (x: number | null, d = 0, unit = '') => (x === null ? '—' : `${num(x, d)}${unit}`);
  const scale = (k: keyof WeekSummary) => ({ value: f(v(s, k), 1, '/5'), prev: f(v(p, k), 1, '/5') });
  const dir = phaseDirection(client.timeline[week]?.phase);
  const rows: ReviewRow[] = [
    { label: 'Days logged', value: `${daysLogged(client.checkIns[week])}/7`, prev: `${daysLogged(client.checkIns[week - 1])}/7`, target: '7/7', tone: null },
    {
      label: 'Weight (average)',
      value: f(v(s, 'bw'), 1, ' kg'),
      prev: f(v(p, 'bw'), 1, ' kg'),
      target: dir === 'down' ? 'Trending down' : dir === 'up' ? 'Trending up' : '',
      tone: null,
    },
    {
      label: 'Steps (daily average)',
      value: f(v(s, 'steps')),
      prev: f(v(p, 'steps')),
      target: t.steps ? num(t.steps) : '',
      tone: v(s, 'steps') !== null && t.steps ? (v(s, 'steps')! >= t.steps ? 'good' : v(s, 'steps')! < t.steps * 0.9 ? 'warn' : null) : null,
    },
    {
      label: 'Calories (daily average)',
      value: f(v(s, 'kcal')),
      prev: f(v(p, 'kcal')),
      target: kcalText(t.kcal),
      tone:
        v(s, 'kcal') !== null && t.kcal ? (v(s, 'kcal')! > t.kcal.max * 1.05 || v(s, 'kcal')! < t.kcal.min * 0.95 ? 'warn' : 'good') : null,
    },
    { label: 'Protein (daily average)', value: f(v(s, 'pro'), 0, ' g'), prev: f(v(p, 'pro'), 0, ' g'), target: t.protein ? `${num(t.protein)} g` : '', tone: null },
    {
      label: 'Workouts',
      value: String(sessionsDone(client, week)),
      prev: String(sessionsDone(client, week - 1)),
      target: t.sessions ? String(t.sessions) : '',
      tone: t.sessions ? (sessionsDone(client, week) >= t.sessions ? 'good' : 'warn') : null,
    },
    { label: 'Cardio (total)', value: f(v(s, 'cardioMin'), 0, ' min'), prev: f(v(p, 'cardioMin'), 0, ' min'), target: t.cardio, tone: null },
    {
      label: 'Sleep (average)',
      value: v(s, 'sleepHrs') !== null ? formatHours(v(s, 'sleepHrs')) : '—',
      prev: v(p, 'sleepHrs') !== null ? formatHours(v(p, 'sleepHrs')) : '—',
      target: '7 h+',
      tone: v(s, 'sleepHrs') !== null ? (v(s, 'sleepHrs')! >= 7 ? 'good' : 'warn') : null,
    },
    { label: 'Water (average)', value: f(v(s, 'water'), 1, ' L'), prev: f(v(p, 'water'), 1, ' L'), target: t.water ? `${num(t.water, 1)} L` : '', tone: null },
    { label: 'Sleep quality', ...scale('sleepQuality'), target: '', tone: null },
    { label: 'Energy', ...scale('energy'), target: '', tone: null },
    { label: 'Stress', ...scale('stress'), target: '', tone: null },
    { label: 'Hunger', ...scale('hunger'), target: '', tone: null },
    { label: 'Meal plan adherence', ...scale('adherence'), target: '', tone: null },
  ];
  return rows;
}

/** Week the coach should look at next: the newest of the last three weeks
 * that has entries, is marked complete or already over, and isn't reviewed.
 * Older weeks count as history. */
export function weekToReview(client: Client, currentWeek: number): number | null {
  for (let w = currentWeek; w >= Math.max(1, currentWeek - 2); w--) {
    const wk = client.checkIns[w];
    if (!wk || !daysLogged(wk) || wk.reviewed) continue;
    if (wk.complete || w < currentWeek) return w;
  }
  return null;
}
