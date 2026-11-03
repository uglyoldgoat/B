// Which workout and which meal-plan day belong to each weekday.

import type { Client, DayPlan, ProgramDay } from '../types';

const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function firstWeekday(text: string): number | null {
  const m = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*/i.exec(text);
  return m ? DAY_NAMES.indexOf(m[1].toLowerCase()) : null;
}

/** Guess the training week from day titles ("Day 2 (Wednesday)"), falling
 * back to the order of the training days in the weekly split. */
export function inferTrainingSchedule(program: ProgramDay[], split: string[]): string[] {
  const out = ['', '', '', '', '', '', ''];
  const days = program.filter((d) => d.exercises.length);
  const named = days.map((d) => firstWeekday(d.title));
  if (named.some((n) => n !== null)) {
    days.forEach((d, i) => {
      const w = named[i];
      if (w !== null && !out[w]) out[w] = d.id;
    });
    return out;
  }
  const splitDays = split.map((s, i) => (s.trim() ? i : -1)).filter((i) => i >= 0);
  days.forEach((d, i) => {
    const w = splitDays[i];
    if (w !== undefined) out[w] = d.id;
  });
  return out;
}

const REST_PLAN = /\b(ntd|rest|low|off)\b/i;
const TRAIN_PLAN = /\b(td|train(ing)?|high|workout)\b/i;

/** Training days get the "high"/"training" plan, other days the "low"/"rest"
 * plan. With a single plan, every day uses it. Otherwise nothing is guessed. */
export function inferNutritionSchedule(plans: DayPlan[], training: string[]): string[] {
  const current = plans.filter((p) => !p.archived);
  if (current.length === 1) return Array(7).fill(current[0].id);
  const rest = current.find((p) => REST_PLAN.test(p.name));
  const train = current.find((p) => p !== rest && TRAIN_PLAN.test(p.name));
  if (!rest || !train) return ['', '', '', '', '', '', ''];
  return training.map((t) => (t ? train.id : rest.id));
}

export function trainingSchedule(client: Client): string[] {
  const s = client.trainingSchedule;
  if (s && s.length === 7) return s;
  return inferTrainingSchedule(client.program, client.profile.weeklySplit);
}

export function nutritionSchedule(client: Client): string[] {
  const s = client.nutritionSchedule;
  if (s && s.length === 7) return s;
  return inferNutritionSchedule(client.nutritionDays, trainingSchedule(client));
}

export function sessionOn(client: Client, weekday: number): ProgramDay | null {
  const id = trainingSchedule(client)[weekday];
  return client.program.find((d) => d.id === id) ?? null;
}

export function planOn(client: Client, weekday: number): DayPlan | null {
  const id = nutritionSchedule(client)[weekday];
  return client.nutritionDays.find((d) => d.id === id) ?? null;
}

/** Strip "( Monday )" style suffixes for friendlier display. */
export function shortDayTitle(title: string): string {
  return title.replace(/\s*\(([^)]*)\)\s*$/, '').trim() || title;
}
