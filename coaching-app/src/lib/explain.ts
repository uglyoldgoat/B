// Plain-language wording for clients: what each number means and how to
// read the training shorthand (tempo, RIR, technique codes).

import type { DayEntry, ProgramExercise } from '../types';

/** Words for each point of a 1–5 rating, lowest first. */
export const SCALE_WORDS: Partial<Record<keyof DayEntry, string[]>> = {
  energy: ['Exhausted', 'Low', 'OK', 'Good', 'Great'],
  stress: ['Calm', 'A little', 'Some', 'High', 'Very high'],
  readiness: ['Not at all', 'Low', 'OK', 'Keen', 'Very keen'],
  performance: ['Much weaker', 'Weaker', 'Normal', 'Stronger', 'Best ever'],
  adherence: ['Off plan', 'Mostly off', 'About half', 'Mostly on', 'Fully on plan'],
  hunger: ['Not hungry', 'A little', 'Moderate', 'Hungry', 'Very hungry'],
  sleepQuality: ['Very poor', 'Poor', 'OK', 'Good', 'Great'],
};

export const BRISTOL_WORDS = ['Hard lumps', 'Lumpy', 'Cracked', 'Smooth', 'Soft blobs', 'Mushy', 'Watery'];

/** One line each: what to enter and why the coach asks. */
export const CLIENT_HELP: Partial<Record<keyof DayEntry, string>> = {
  bw: 'Weigh yourself after waking and using the bathroom, before eating or drinking.',
  steps: 'From your phone or watch at the end of the day.',
  sleepHrs: 'Hours actually asleep last night. 7.5 means seven and a half hours.',
  sleepQuality: 'How rested you feel, or your sleep score if your watch gives one.',
  energy: 'Your energy across the day.',
  stress: 'Work, family, money, anything that weighed on you.',
  hunger: 'How hungry you felt between meals.',
  adherence: 'How closely you followed the meal plan today.',
  water: 'Litres of water. 1.5 means one and a half litres.',
  kcal: 'Only if you track food in an app. Leave blank if you do not.',
  session: 'Pick the workout you did today, or rest day.',
  doms: 'Muscle soreness from training.',
  cardioMin: 'Minutes of planned cardio (walking for steps does not count).',
  cycleDay: 'Enter 1 on the first day of your period. The app counts on from there.',
  pms: 'Any effect on mood, energy, cravings or training.',
  illness: 'Cold, flu, fever or feeling unwell.',
  cravings: 'What you craved, if anything.',
  nutritionNotes: 'Anything about food this day your coach should know.',
  trainingNotes: 'Pain, a new best, an exercise that felt wrong.',
  stools: 'Number of bowel movements.',
  bristol: 'Stool type from 1 (hard) to 7 (watery). 3–4 is ideal.',
  digestion: 'Bloating, gas, stomach pain.',
  bedTime: 'When you went to sleep.',
  wakeTime: 'When you woke up.',
  weighTime: 'Usually the same time each morning.',
};

/** "3-1-1-0" -> "3 s down, 1 s pause, 1 s up". */
export function describeTempo(tempo: string): string | null {
  const parts = tempo
    .split(/[-–/ ]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3 || parts.some((p) => !/^(\d+|x)$/i.test(p))) return null;
  const sec = (p: string) => (/x/i.test(p) ? 'as fast as you can' : `${p} s`);
  const out = [`${sec(parts[0])} down`];
  if (parts[1] !== '0') out.push(`${sec(parts[1])} pause at the bottom`);
  out.push(/x/i.test(parts[2]) ? 'lift explosively' : `${sec(parts[2])} up`);
  if (parts[3] && parts[3] !== '0') out.push(`${sec(parts[3])} squeeze at the top`);
  return out.join(', ');
}

/** RIR (reps in reserve) as an instruction. */
export function describeRir(rir: string): string | null {
  const t = rir.trim();
  if (!t) return null;
  if (/^0$/.test(t) || /fail/i.test(t)) return 'Go until you cannot do another rep with good form';
  const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(t);
  if (!m) return `Effort: ${t}`;
  const range = m[2] ? `${m[1]}–${m[2]}` : m[1];
  const one = !m[2] && m[1] === '1';
  return `Stop when you could do about ${range} more rep${one ? '' : 's'}`;
}

export function describeRest(rest: string): string | null {
  const t = rest.trim();
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?)?$/i.exec(t);
  if (!m) return `Rest ${t}`;
  const unit = (m[2] ?? 's').toLowerCase().startsWith('m') ? 'min' : 'seconds';
  return `Rest ${m[1]} ${unit} between sets`;
}

const TECHNIQUES: { test: RegExp; text: string }[] = [
  { test: /^(ss|straight\s*sets?)$/i, text: '' },
  { test: /^rp/i, text: 'Rest-pause: at failure rest 10–15 seconds, then squeeze out a few more reps' },
  { test: /^mds/i, text: 'Mechanical drop set: at failure switch to an easier version of the exercise and keep going' },
  { test: /^ds/i, text: 'Drop set: at failure lower the weight by about 20% and keep going' },
  { test: /^mr|muscle\s*round/i, text: 'Muscle round: 6 mini-sets of 4 reps with 10 seconds rest between them' },
  { test: /^fr|forced/i, text: 'Forced reps: a partner helps with a couple of extra reps after failure' },
  { test: /^pr|partial/i, text: 'Partial reps: after failure, do short-range reps in the hardest part' },
  { test: /^bfr/i, text: 'Blood flow restriction: train with a cuff, light weight and high reps' },
  { test: /^p$|potentiation/i, text: 'Potentiation: one heavy, low-rep set to prime the muscle before the working sets' },
  { test: /zig/i, text: 'Zig-zag: alternate between two exercises with rest in between' },
  { test: /super/i, text: 'Superset: do the next exercise straight after this one, then rest' },
];

export function describeTechnique(t: string): string | null {
  const v = t.trim();
  if (!v) return null;
  const hit = TECHNIQUES.find((x) => x.test.test(v));
  if (hit) return hit.text || null;
  return v;
}

export function describeFeeder(feeder: string): string | null {
  const t = feeder.trim();
  if (!t || t === '0') return null;
  return /^\d+$/.test(t) ? `Warm up with ${t} lighter set${t === '1' ? '' : 's'} first` : `Warm-up: ${t}`;
}

/** Top of a rep range: "8-12" -> 12, "15" -> 15, "12 each leg" -> 12. */
export function topReps(reps: string): number | null {
  const nums = (reps.match(/\d+/g) ?? []).map(Number);
  return nums.length ? Math.max(...nums.slice(0, 2)) : null;
}

export function describeSets(ex: ProgramExercise): string {
  const sets = ex.sets ?? null;
  const reps = ex.reps.trim();
  if (sets && reps) return `${sets} sets of ${reps} reps`;
  if (sets) return `${sets} sets`;
  return reps ? `${reps} reps` : '';
}

/** The few things a client logs every day; everything else is optional. */
export const DAILY_ESSENTIALS: (keyof DayEntry)[] = ['bw', 'steps', 'sleepHrs', 'sleepQuality', 'energy', 'stress', 'hunger', 'adherence', 'water'];

export const SHORT_LABELS: Partial<Record<keyof DayEntry, string>> = {
  bw: 'Weight',
  steps: 'Steps',
  sleepHrs: 'Sleep',
  sleepQuality: 'Sleep quality',
  energy: 'Energy',
  stress: 'Stress',
  hunger: 'Hunger',
  adherence: 'Meal plan',
  water: 'Water',
};
