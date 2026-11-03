import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { AppData, DayPlan, ProgramDay } from '../types';
import { emptyWeek } from './calc';
import { describeFeeder, describeRest, describeRir, describeTechnique, describeTempo, topReps } from './explain';
import { weekFlags, weekTargets, weekToReview } from './review';
import { inferNutritionSchedule, inferTrainingSchedule, shortDayTitle } from './schedule';
import { applyPackage, buildClientUpdate, buildSetupPack, parsePackage } from './share';
import { SAMPLE_EXERCISES, SAMPLE_FOODS, makeSampleClient } from './sample';

const day = (id: string, title: string): ProgramDay => ({
  id,
  title,
  exercises: [{ id: `${id}-a`, name: 'Leg Press', feeder: '', sets: 3, reps: '10', tempo: '', rir: '', technique: '', rest: '', notes: '' }],
});

describe('weekly schedule', () => {
  it('reads weekdays from program day titles', () => {
    const s = inferTrainingSchedule([day('a', 'DAY 1 ( Monday )'), day('b', 'Day 2 ( Wednesday )'), day('c', 'Day 3 (Friday or Saturday )')], []);
    expect(s).toEqual(['a', '', 'b', '', 'c', '', '']);
  });
  it('falls back to the order of the weekly split', () => {
    const s = inferTrainingSchedule([day('a', 'Lower'), day('b', 'Upper')], ['Legs', '', 'Push', '', '', '', '']);
    expect(s).toEqual(['a', '', 'b', '', '', '', '']);
  });
  it('gives training days the high plan and rest days the low plan', () => {
    const plan = (id: string, name: string): DayPlan => ({ id, name, water: 3, meals: [] });
    const s = inferNutritionSchedule([plan('h', '1 Day High'), plan('l', '4 Days low')], ['a', '', 'b', '', 'c', '', '']);
    expect(s).toEqual(['h', 'l', 'h', 'l', 'h', 'l', 'l']);
    const td = inferNutritionSchedule([plan('n', 'NTD'), plan('t', 'TD')], ['a', '', '', '', '', '', '']);
    expect(td[0]).toBe('t');
    expect(td[1]).toBe('n');
    expect(inferNutritionSchedule([plan('x', 'Plan A'), plan('y', 'Plan B')], ['a', '', '', '', '', '', ''])).toEqual(['', '', '', '', '', '', '']);
  });
  it('shortens day titles', () => {
    expect(shortDayTitle('DAY 1 ( Monday )')).toBe('DAY 1');
    expect(shortDayTitle('Upper')).toBe('Upper');
  });
});

describe('plain-language training cues', () => {
  it('explains tempo', () => {
    expect(describeTempo('3-1-1-0')).toBe('3 s down, 1 s pause at the bottom, 1 s up');
    expect(describeTempo('3-0-X-1')).toBe('3 s down, lift explosively, 1 s squeeze at the top');
    expect(describeTempo('slow')).toBeNull();
  });
  it('explains reps in reserve', () => {
    expect(describeRir('3')).toBe('Stop when you could do about 3 more reps');
    expect(describeRir('1')).toBe('Stop when you could do about 1 more rep');
    expect(describeRir('1-2')).toBe('Stop when you could do about 1–2 more reps');
    expect(describeRir('0')).toMatch(/cannot do another rep/);
  });
  it('explains rest, warm-up and techniques', () => {
    expect(describeRest('60sec')).toBe('Rest 60 seconds between sets');
    expect(describeRest('2 min')).toBe('Rest 2 min between sets');
    expect(describeFeeder('2')).toBe('Warm up with 2 lighter sets first');
    expect(describeTechnique('STRAIGHT SET')).toBeNull();
    expect(describeTechnique('RP')).toMatch(/^Rest-pause/);
    expect(describeTechnique('MDS')).toMatch(/^Mechanical drop set/);
    expect(topReps('8-12')).toBe(12);
    expect(topReps('12 each leg')).toBe(12);
  });
});

describe('weekly review', () => {
  it('flags short logging, few weigh-ins and low sleep', () => {
    const c = makeSampleClient();
    const wk = emptyWeek();
    wk.days[0] = { bw: 60, steps: 4000, sleepHrs: 6, stress: 4 };
    wk.days[1] = { steps: 5000, sleepHrs: 6.5, stress: 4 };
    c.checkIns = { 3: wk };
    const text = weekFlags(c, 3, SAMPLE_FOODS).map((f) => f.text).join(' | ');
    expect(text).toMatch(/Logged 2 of 7 days/);
    expect(text).toMatch(/Weighed in on 1 day only/);
    expect(text).toMatch(/Sleep averaged 6h 15m/);
    expect(text).toMatch(/High stress \(4\/5\)/);
    expect(text).toMatch(/Steps 4,500 a day/);
  });
  it('puts warnings first', () => {
    const c = makeSampleClient();
    const flags = weekFlags(c, 2, SAMPLE_FOODS);
    const firstNonWarn = flags.findIndex((f) => f.tone !== 'warn');
    expect(flags.slice(firstNonWarn).every((f) => f.tone !== 'warn')).toBe(true);
  });
  it('picks the newest finished week that is not reviewed', () => {
    const c = makeSampleClient();
    expect(weekToReview(c, 7)).toBe(6);
    c.checkIns[6].reviewed = true;
    expect(weekToReview(c, 7)).toBe(5);
  });
});

describe('coach and client handoff', () => {
  const coachData = (): AppData => {
    const c = makeSampleClient();
    return { version: 1, mode: 'coach', activeClientId: c.id, clients: [c], exercises: SAMPLE_EXERCISES, foods: SAMPLE_FOODS };
  };

  it('round-trips: coach sends setup, client logs, coach gets logs and keeps feedback', () => {
    let coach = coachData();
    const original = coach.clients[0];
    coach = produce(coach, (d) => {
      d.clients[0].checkIns[5].coachFeedback = 'Nice work';
    });
    const pack = parsePackage(JSON.stringify(buildSetupPack(coach.clients[0], coach.exercises, coach.foods)));
    expect(pack.kind).toBe('client-setup');

    // Client device starts empty.
    let phone: AppData = { version: 1, mode: 'client', activeClientId: '', clients: [], exercises: [], foods: [] };
    phone = produce(phone, (d) => void applyPackage(d, pack));
    expect(phone.clients[0].id).toBe(original.id);
    expect(phone.clients[0].checkIns[5].coachFeedback).toBe('Nice work');
    expect(phone.exercises.length).toBeGreaterThan(0);

    // Client logs a new day; coach edits feedback in the meantime.
    phone = produce(phone, (d) => {
      d.clients[0].checkIns[7].days[6] = { bw: 61.2, steps: 9100 };
      d.clients[0].checkIns[5].coachFeedback = 'client must not overwrite this';
    });
    coach = produce(coach, (d) => {
      d.clients[0].checkIns[5].coachFeedback = 'Nice work, keep going';
    });
    const update = parsePackage(JSON.stringify(buildClientUpdate(phone.clients[0])));
    let result;
    coach = produce(coach, (d) => {
      result = applyPackage(d, update);
    });
    expect(result).toMatchObject({ kind: 'update', added: false });
    expect(coach.clients[0].checkIns[7].days[6]).toEqual({ bw: 61.2, steps: 9100 });
    expect(coach.clients[0].checkIns[5].coachFeedback).toBe('Nice work, keep going');
    expect(coach.clients[0].lastUpdateAt).toBeTruthy();
  });

  it('keeps the client logs when a new plan arrives', () => {
    const coach = coachData();
    let phone: AppData = { version: 1, mode: 'client', activeClientId: '', clients: [], exercises: [], foods: [] };
    phone = produce(phone, (d) => void applyPackage(d, buildSetupPack(coach.clients[0], coach.exercises, coach.foods)));
    phone = produce(phone, (d) => {
      d.clients[0].checkIns[7].days[5] = { bw: 59.9 };
    });
    const newPlan = produce(coach.clients[0], (c) => {
      c.profile.stepsTarget = 11000;
      c.checkIns[7].days[5] = { bw: 1 };
    });
    phone = produce(phone, (d) => void applyPackage(d, buildSetupPack(newPlan, coach.exercises, coach.foods)));
    expect(phone.clients[0].profile.stepsTarget).toBe(11000);
    expect(phone.clients[0].checkIns[7].days[5]).toEqual({ bw: 59.9 });
  });

  it('links only the photos that came with an update', () => {
    let coach = coachData();
    const c = produce(coach.clients[0], (x) => {
      x.photos = { '1-0': 'k1', '1-1': 'k2' };
    });
    coach = produce(coach, (d) => void applyPackage(d, buildClientUpdate(c), new Set(['k1'])));
    expect(coach.clients[0].photos).toEqual({ '1-0': 'k1' });
  });

  it('rejects other files', () => {
    expect(() => parsePackage('hello')).toThrow(/not a Coachbook/);
    expect(() => parsePackage('{"app":"other"}')).toThrow(/not a Coachbook/);
  });
});

describe('calorie targets in the weekly review', () => {
  it("uses the coach's targets for the week before the meal plan", () => {
    const c = makeSampleClient();
    c.timeline[2] = { ...c.timeline[2], intakeHigh: null, intakeMed: 2000, intakeLow: null };
    expect(weekTargets(c, 2, SAMPLE_FOODS).kcal).toEqual({ min: 2000, max: 2000 });
    c.timeline[2] = { ...c.timeline[2], intakeHigh: null, intakeMed: null, intakeLow: null };
    const fromPlan = weekTargets(c, 2, SAMPLE_FOODS).kcal!;
    expect(fromPlan.min).toBe(fromPlan.max); // average of the scheduled plan days
  });
});
