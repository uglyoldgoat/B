import { describe, expect, it } from 'vitest';
import {
  aggregate,
  averageClock,
  currentWeek,
  dayMacros,
  emptyWeek,
  foodIndex,
  inferCycleDay,
  isWorkout,
  localDate,
  mergeLibrary,
  todayPosition,
  itemMacros,
  latestWeight,
  mround,
  round,
  safeHref,
  setStats,
  summarizeWeek,
  swapQuantity,
  timeUntil,
  volumeByMuscle,
  weeklyRows,
} from './calc';
import type { Client, DayPlan, Exercise, Food, ProgramDay } from '../types';
import { makeSampleClient } from './sample';

describe('Excel-compatible rounding', () => {
  it('rounds half away from zero', () => {
    expect(round(2.5)).toBe(3);
    expect(round(-2.5)).toBe(-3);
    expect(round(60.65, 1)).toBe(60.7);
    expect(round(1567.4999)).toBe(1567);
  });
  it('mround to the nearest half', () => {
    expect(mround(1.26, 0.5)).toBe(1.5);
    expect(mround(1.24, 0.5)).toBe(1);
  });
});

describe('weekly aggregates', () => {
  it('match the Check-In sheet formulas', () => {
    expect(aggregate('avg1', [60.1, 60.4, 60.4, 60.4, 60.1, 60.1, 59.2])).toBe(60.1);
    expect(aggregate('avg0', [3100, 4200, 6500, 1800, 7200, 3600, 2400])).toBe(4114);
    // Calories ignore zero days (AVERAGEIF <> 0).
    expect(aggregate('avgNonZero0', [1674, 0, 1486, undefined])).toBe(1580);
    expect(aggregate('sum', [undefined, 60, 30])).toBe(90);
    expect(aggregate('countYes', ['No', 'Yes', 'Yes', undefined])).toBe(2);
    expect(aggregate('countIrregular', ['Regular', 'Irregular'])).toBe(1);
    expect(aggregate('avg1', [undefined, undefined])).toBeNull();
  });
  it('does not count "No" or "-" as a craving or issue', () => {
    expect(aggregate('countText', ['Ice cream', 'No', 'Cake', '-', undefined])).toBe(2);
  });
  it('averages bedtimes across midnight', () => {
    expect(averageClock(['23:30', '00:30'])).toBe('00:00');
    expect(averageClock(['07:30', '08:30'])).toBe('08:00');
    expect(averageClock([undefined])).toBeNull();
  });
});

describe('dates', () => {
  it('counts the current week like ROUNDUP((TODAY()+1-start)/7)', () => {
    expect(currentWeek('2026-07-20', new Date(2026, 6, 20))).toBe(1);
    expect(currentWeek('2026-07-20', new Date(2026, 6, 26))).toBe(1);
    expect(currentWeek('2026-07-20', new Date(2026, 6, 27))).toBe(2);
    expect(currentWeek('2026-07-20', new Date(2026, 9, 2))).toBe(11);
  });
  it('formats time until the goal', () => {
    expect(timeUntil('2027-07-02', new Date(2026, 9, 2))).toBe('39 weeks');
    expect(timeUntil('2027-07-06', new Date(2026, 9, 2))).toBe('39 weeks 4 days');
    expect(timeUntil('2026-10-03', new Date(2026, 9, 2))).toBe('1 day');
  });
});

const foods: Food[] = [
  { name: 'Chicken Breast, Cooked', amount: 100, unit: 'g', kcal: 151, pro: 30.54, cho: 0, fat: 3.17, category: 'PRO' },
  { name: 'Jasmine Rice (Cooked)', amount: 100, unit: 'g', kcal: 129, pro: 2.6, cho: 28, fat: 0.3, category: 'CHO' },
  { name: 'Egg (large)', amount: 1, unit: 'egg', kcal: 72, pro: 6.3, cho: 0.4, fat: 4.8, category: 'PRO' },
];
const idx = foodIndex(foods);

describe('meal plan maths', () => {
  it('rounds each macro, then derives calories 4/4/9', () => {
    const m = itemMacros({ id: 'a', food: 'Chicken Breast, Cooked', qty: 150, swap: '' }, idx)!;
    expect(m).toEqual({ pro: 46, cho: 0, fat: 5, kcal: 229 });
  });
  it('is case-insensitive on food names and ignores unknown foods', () => {
    expect(itemMacros({ id: 'a', food: 'egg (LARGE)', qty: 2, swap: '' }, idx)?.pro).toBe(13);
    expect(itemMacros({ id: 'a', food: 'Unknown', qty: 2, swap: '' }, idx)).toBeNull();
  });
  it('calorie-matches swaps: grams to whole numbers, other units to halves', () => {
    // 150 g rice = 4p/42c/0f = 184 kcal; chicken: 100 * 184 / 151 = 121.9 -> 122 g
    const rice = { id: 'r', food: 'Jasmine Rice (Cooked)', qty: 150, swap: 'Chicken Breast, Cooked' };
    expect(swapQuantity(rice, idx)).toEqual({ qty: 122, unit: 'g' });
    // eggs: 1 * 184 / 72 = 2.56 -> 2.5 eggs
    expect(swapQuantity({ ...rice, swap: 'Egg (large)' }, idx)).toEqual({ qty: 2.5, unit: 'egg' });
  });
  it('sums a day', () => {
    const day: DayPlan = {
      id: 'd',
      name: 'High',
      water: 3,
      meals: [
        { id: 'm1', name: 'Meal 1', notes: '', items: [{ id: 'a', food: 'Egg (large)', qty: 2, swap: '' }] },
        { id: 'm2', name: 'Meal 2', notes: '', items: [{ id: 'b', food: 'Jasmine Rice (Cooked)', qty: 150, swap: '' }] },
      ],
    };
    const t = dayMacros(day, idx);
    expect(t.kcal).toBe(t.pro * 4 + t.cho * 4 + t.fat * 9);
    expect(t.pro).toBe(13 + 4);
  });
});

describe('training', () => {
  const exercises: Exercise[] = [
    { name: 'Hip Thrust', primary: 'Glutes', secondary: 'Hamstrings', notes: '', video: '' },
    { name: 'Leg Press', primary: 'Quads', secondary: '', notes: '', video: '' },
  ];
  const program: ProgramDay[] = [
    {
      id: 'd1',
      title: 'Day 1',
      exercises: [
        { id: 'a', name: 'Hip Thrust', feeder: '', sets: 3, reps: '8-12', tempo: '', rir: '', technique: '', rest: '', notes: '' },
        { id: 'b', name: 'leg press', feeder: '', sets: 4, reps: '10', tempo: '', rir: '', technique: '', rest: '', notes: '' },
      ],
    },
    {
      id: 'd2',
      title: 'Day 2',
      exercises: [{ id: 'c', name: 'Hip Thrust', feeder: '', sets: 2, reps: '', tempo: '', rir: '', technique: '', rest: '', notes: '' }],
    },
  ];
  it('counts sets toward primary and secondary body parts', () => {
    const v = volumeByMuscle(program, exercises);
    expect(v.get('Glutes')).toBe(5);
    expect(v.get('Hamstrings')).toBe(5);
    expect(v.get('Quads')).toBe(4);
  });
  it('summarises logged sets', () => {
    const s = setStats([
      { kg: 20, reps: 12 },
      { kg: 25, reps: 10 },
      { kg: null, reps: null },
    ]);
    expect(s).toEqual({ topKg: 25, volume: 490, bestE1rm: 33.3, sets: 2 });
  });
});

describe('client summaries', () => {
  it('builds timeline rows and the latest weight from check-ins', () => {
    const c: Client = makeSampleClient();
    const rows = weeklyRows(c, 3);
    expect(rows[0].avgBw).not.toBeNull();
    expect(rows[1].change).toBeCloseTo((rows[1].avgBw ?? 0) - (rows[0].avgBw ?? 0), 5);
    expect(latestWeight(c)).not.toBeNull();
  });
  it('leaves the weekly change blank when the previous week is blank', () => {
    const c = makeSampleClient();
    c.checkIns = { 2: { ...emptyWeek(), days: [{ bw: 60 }, {}, {}, {}, {}, {}, {}] } };
    expect(weeklyRows(c, 2)[1].change).toBeNull();
    expect(summarizeWeek(c.checkIns[2]).bw).toBe(60);
  });
  it('counts cycle day forward from the last entry, across weeks', () => {
    const c = makeSampleClient();
    c.checkIns = { 1: { ...emptyWeek(), days: [{}, {}, {}, {}, {}, { cycleDay: 1 }, {}] } };
    expect(inferCycleDay(c, 1, 6)).toBe(2);
    expect(inferCycleDay(c, 2, 0)).toBe(3);
    expect(inferCycleDay(c, 1, 2)).toBeNull();
  });
});

describe('links', () => {
  it('only allows http(s) links', () => {
    expect(safeHref('https://youtube.com/x')).toBe('https://youtube.com/x');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,hi')).toBeUndefined();
    expect(safeHref('')).toBeUndefined();
  });
});

describe('fixes from the formula audit', () => {
  it('rounds like Excel at 15 significant digits', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(-1.005, 2)).toBe(-1.01);
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(0.285, 2)).toBe(0.29);
    expect(mround(1.25, 0.5)).toBe(1.5);
  });

  it('uses the first row when a food or exercise is listed twice (like VLOOKUP)', () => {
    const dup: Food[] = [
      { name: 'Cheddar Cheese', amount: 100, unit: 'g', kcal: 403, pro: 22.87, cho: 3.37, fat: 33.31, category: 'FAT' },
      { name: 'cheddar cheese ', amount: 100, unit: 'g', kcal: 400, pro: 25, cho: 1.3, fat: 33.1, category: 'FAT' },
    ];
    const m = itemMacros({ id: 'a', food: 'Cheddar Cheese', qty: 30, swap: '' }, foodIndex(dup))!;
    expect(m).toEqual({ pro: 7, cho: 1, fat: 10, kcal: 122 });
    // Importing keeps the first of the incoming duplicates and replaces older entries.
    const merged = mergeLibrary([{ ...dup[1], kcal: 1 }], dup);
    expect(merged).toHaveLength(1);
    expect(merged[0].kcal).toBe(403);
  });

  it('treats swap units without case, and skips swaps for zero-calorie lines', () => {
    const foods: Food[] = [
      { name: 'Rice', amount: 100, unit: 'g', kcal: 130, pro: 2.7, cho: 28, fat: 0.3, category: 'CHO' },
      { name: 'Oats', amount: 100, unit: 'G', kcal: 379, pro: 13, cho: 68, fat: 6.5, category: 'CHO' },
      { name: 'Milk', amount: 100, unit: 'ML', kcal: 46, pro: 3.4, cho: 4.8, fat: 1.7, category: 'OTHER' },
      { name: 'Water', amount: 100, unit: 'mL', kcal: 0, pro: 0, cho: 0, fat: 0, category: 'OTHER' },
    ];
    const idx = foodIndex(foods);
    // 150 g rice = 4p/42c/0f = 184 kcal -> 100 * 184 / 379 = 48.5 -> 49 g (whole grams, not halves)
    expect(swapQuantity({ id: 'a', food: 'Rice', qty: 150, swap: 'Oats' }, idx)).toEqual({ qty: 49, unit: 'G' });
    expect(swapQuantity({ id: 'a', food: 'Rice', qty: 150, swap: 'Milk' }, idx)?.qty).toBe(400);
    expect(swapQuantity({ id: 'a', food: 'Water', qty: 250, swap: 'Milk' }, idx)).toBeNull();
  });

  it('does not count rest days as workouts', () => {
    expect(isWorkout('Day 1')).toBe(true);
    expect(isWorkout('Rest day')).toBe(false);
    expect(isWorkout('-')).toBe(false);
    expect(aggregate('countWorkouts', ['Day 1', 'Rest day', undefined, 'Upper', '-'])).toBe(2);
  });

  it('knows when the program has not started yet', () => {
    const p = todayPosition('2026-10-12', new Date(2026, 9, 3));
    expect(p.beforeStart).toBe(true);
    expect(todayPosition('2026-07-20', new Date(2026, 9, 3))).toMatchObject({ week: 11, day: 5, beforeStart: false });
  });

  it('shows timestamps on the local calendar day', () => {
    const local = new Date(2026, 9, 3, 0, 30);
    expect(localDate(local.toISOString())).toBe('2026-10-03');
    expect(localDate(undefined)).toBe('');
  });
});
