// Example data so the app opens in a working state. Every value here is made up.

import {
  DEFAULT_POSES,
  DEFAULT_SITES,
  type AppData,
  type CheckInWeek,
  type Client,
  type DayPlan,
  type DayEntry,
  type Exercise,
  type Food,
  type LoggedSet,
  type ProgramDay,
  type ProgramExercise,
  type TimelineWeek,
} from '../types';
import { addDays, emptyWeek, round, toISODate, uid } from './calc';
import { inferNutritionSchedule, inferTrainingSchedule } from './schedule';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const yt = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} exercise form`)}`;

export const SAMPLE_EXERCISES: Exercise[] = [
  ['Barbell Hip Thrust', 'Glutes', 'Hamstrings', 'Upper back on the bench just below the shoulder blades, bar over the hip crease, feet flat and shins vertical at the top. Tuck the chin and ribs, drive through the heels and pause at lockout.'],
  ['Romanian Deadlift', 'Hamstrings', 'Glutes', 'Soft knees, push the hips back while the bar stays against the thighs. Lower until the hamstrings are fully stretched without the lower back rounding, then drive the hips through.'],
  ['Barbell Back Squat', 'Quads', 'Glutes', 'Bar on the upper traps, brace before each rep, sit down between the heels and keep the knees tracking over the toes. Stand up through the whole foot.'],
  ['Smith Machine Squat', 'Quads', 'Glutes', 'Feet slightly in front of the bar. Control the descent to full depth and keep the torso upright.'],
  ['45 Degree Leg Press', 'Quads', 'Glutes', 'Hips and lower back stay flat on the pad. Lower until the knees reach about 90 degrees or deeper without the pelvis tucking.'],
  ['Bulgarian Split Squat', 'Quads', 'Glutes', 'Rear foot on a bench, front foot far enough forward that the heel stays down. Lean slightly forward for more glute, stay upright for more quad.'],
  ['Walking Lunge', 'Glutes', 'Quads', 'Long steps, front heel stays down, back knee lowers under control.'],
  ['Leg Extension', 'Quads', '', 'Knees in line with the machine pivot, pad just above the ankles. Squeeze at the top and lower slowly.'],
  ['Seated Hamstring Curl', 'Hamstrings', '', 'Knees in line with the pivot, thigh pad locked down. Curl fully and control the return.'],
  ['Lying Hamstring Curl', 'Hamstrings', '', 'Hips pressed into the bench. Curl without lifting the hips and lower slowly.'],
  ['Cable Glute Kickback', 'Glutes', '', 'Hinge slightly, brace, and kick back and slightly out without arching the lower back.'],
  ['Hip Abduction Machine', 'Abductors', 'Glutes', 'Lean slightly forward to bias the upper glutes. Pause at full range.'],
  ['Hip Adduction Machine', 'Adductors', '', 'Sit tall, start from a comfortable stretch and squeeze the pads together.'],
  ['Standing Calf Raise', 'Calves', '', 'Full stretch at the bottom with a pause, rise as high as possible on the big toe.'],
  ['Seated Calf Raise', 'Calves', '', 'Knees at 90 degrees, pause in the stretch, drive up through the ball of the foot.'],
  ['Neutral Grip Lat Pulldown', 'Back', 'Biceps', 'Neutral handles about shoulder width. Lean back slightly and pull the elbows down to the ribs.'],
  ['Wide Grip Lat Pulldown', 'Back', 'Biceps', 'Hands just outside shoulder width. Pull the bar to the upper chest by driving the elbows down.'],
  ['Seated Cable Row', 'Back', 'Biceps', 'Chest up, neutral spine. Row the handle to the lower ribs and let the shoulder blades reach forward on the return.'],
  ['Chest Supported Row', 'Back', 'Shoulders', 'Chest on the pad, pull the elbows back and squeeze the upper back without shrugging.'],
  ['Single Arm DB Row', 'Back', 'Biceps', 'Hand and knee on the bench, row the dumbbell toward the hip.'],
  ['Incline DB Chest Press', 'Chest', 'Triceps', '30–45 degree bench. Lower the dumbbells to the upper chest with control and press up and slightly in.'],
  ['Flat Barbell Bench Press', 'Chest', 'Triceps', 'Shoulder blades pulled back and down, feet planted. Touch the lower chest and press.'],
  ['Cable Fly', 'Chest', '', 'Slight bend in the elbows, bring the hands together in a hugging arc.'],
  ['Seated DB Shoulder Press', 'Shoulders', 'Triceps', 'Back against the pad, press overhead without flaring the ribs.'],
  ['DB Lateral Raise', 'Shoulders', '', 'Slight forward lean, raise the arms out to the sides leading with the elbows, stop at shoulder height.'],
  ['Cable Lateral Raise', 'Shoulders', '', 'Cable at hand height, raise the arm out to the side and control the return.'],
  ['Rear Delt Fly Machine', 'Shoulders', 'Back', 'Arms slightly bent, sweep back without shrugging.'],
  ['EZ Bar Curl', 'Biceps', '', 'Elbows pinned to the sides, curl without swinging.'],
  ['Cable Tricep Pushdown', 'Triceps', '', 'Elbows fixed at the sides, extend fully and control back up.'],
  ['Cable Crunch', 'Abdominals', '', 'Kneel facing the cable, curl the ribs toward the pelvis.'],
  ['Back Extension', 'Erectors', 'Glutes', 'Hinge at the hips, keep the spine neutral and stop at a straight line.'],
].map(([name, primary, secondary, notes]) => ({ name, primary, secondary, notes, video: yt(name) }));

export const SAMPLE_FOODS: Food[] = (
  [
    ['Chicken Breast, Cooked', 100, 'g', 165, 31, 0, 3.6, 'PRO'],
    ['Chicken Thigh, Cooked', 100, 'g', 209, 26, 0, 10.9, 'PRO'],
    ['Salmon, Cooked', 100, 'g', 206, 22, 0, 12.4, 'PRO'],
    ['White Fish, Cooked', 100, 'g', 105, 23, 0, 0.9, 'PRO'],
    ['Lean Beef Mince 5%, Cooked', 100, 'g', 175, 26, 0, 7.8, 'PRO'],
    ['Egg (large)', 1, 'egg', 72, 6.3, 0.4, 4.8, 'PRO'],
    ['Egg Whites', 100, 'g', 52, 10.9, 0.7, 0.2, 'PRO'],
    ['Greek Yogurt 0%', 100, 'g', 59, 10.3, 3.6, 0.4, 'PRO'],
    ['Whey Protein', 30, 'g', 120, 24, 3, 1.5, 'PRO'],
    ['Firm Tofu', 100, 'g', 144, 17.3, 2.8, 8.7, 'PRO'],
    ['Jasmine Rice (Cooked)', 100, 'g', 129, 2.7, 28, 0.3, 'CHO'],
    ['Sweet Potato, Baked', 100, 'g', 90, 2, 20.7, 0.2, 'CHO'],
    ['Rolled Oats (Dry)', 100, 'g', 379, 13.2, 67.7, 6.5, 'CHO'],
    ['Wholemeal Bread', 1, 'slice', 90, 4.3, 15, 1.2, 'CHO'],
    ['Rice Vermicelli (Dry)', 100, 'g', 360, 6, 80, 0.6, 'CHO'],
    ['Potato, Boiled', 100, 'g', 87, 1.9, 20, 0.1, 'CHO'],
    ['Banana', 100, 'g', 89, 1.1, 22.8, 0.3, 'FRUIT'],
    ['Blueberries', 100, 'g', 57, 0.7, 14.5, 0.3, 'FRUIT'],
    ['Apple', 100, 'g', 52, 0.3, 13.8, 0.2, 'FRUIT'],
    ['Broccoli', 100, 'g', 34, 2.8, 6.6, 0.4, 'VEG'],
    ['Spinach', 100, 'g', 23, 2.9, 3.6, 0.4, 'VEG'],
    ['Mixed Salad Leaves', 100, 'g', 17, 1.3, 2.9, 0.2, 'VEG'],
    ['Avocado', 100, 'g', 160, 2, 8.5, 14.7, 'FAT'],
    ['Peanut Butter', 100, 'g', 588, 25, 20, 50, 'FAT'],
    ['Almonds', 100, 'g', 579, 21, 21.6, 49.9, 'FAT'],
    ['Olive Oil', 100, 'mL', 884, 0, 0, 100, 'FAT'],
    ['Cheddar Cheese', 100, 'g', 403, 24.9, 1.3, 33.1, 'FAT'],
    ['Semi-skimmed Milk', 100, 'mL', 46, 3.4, 4.8, 1.7, 'OTHER'],
    ['Dark Chocolate 70%', 100, 'g', 598, 7.8, 45.9, 42.6, 'OTHER'],
  ] as [string, number, string, number, number, number, number, string][]
).map(([name, amount, unit, kcal, pro, cho, fat, category]) => ({ name, amount, unit, kcal, pro, cho, fat, category }));

const GUIDE = [
  ['Progressive overload', 'Aim to do a little more over time: an extra rep, a little more load, or the same work with better control. Log every session so we can both see the trend. If lifts stall for two or three weeks, tell me: it usually points to food, sleep or recovery.'],
  ['Rep ranges', 'Pick a load that brings you close to failure inside the range. With 8–12, start where you can get 8 good reps. When you reach 12 with the same form, add load next session.'],
  ['Feeder sets', 'Warm-up sets before the working sets. Do fewer reps as the weight gets closer to your working load so you save energy for the sets that count.'],
  ['Rest periods', 'Stick to the prescribed rest where you can. If a short rest would ruin the next set, take a little longer. Quality first.'],
  ['Tempo', 'Written as lower – pause – lift – pause, in seconds. 3-1-1-0 means three seconds down, one second pause at the bottom, one second up, no pause at the top.'],
  ['RIR (reps in reserve)', 'How many more reps you could have done. 2 RIR means you stopped with two left; 0 RIR is true failure. Most working sets sit at 0–2 RIR.'],
  ['Technique key', 'SS straight set · RP rest-pause · DS drop set · MDS mechanical drop set · MR muscle round · FR forced reps · PR partial reps · BFR blood flow restriction · P potentiation set.'],
  ['Weigh-ins', 'Weigh yourself every morning after the bathroom and before food or drink. Daily weight moves with water, salt, hormones, sleep and stress, so judge progress on the weekly average.'],
  ['Missed tracking', 'If you forget to log something, write what was missed and why. Honest gaps are more useful than guessed numbers.'],
].map(([title, body]) => ({ title, body }));

function mondayOnOrBefore(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}

function ex(name: string, sets: number, reps: string, extra: Partial<ProgramExercise> = {}): ProgramExercise {
  return { id: uid('ex'), name, feeder: '2', sets, reps, tempo: '3-1-1-0', rir: '1-2', technique: 'STRAIGHT SET', rest: '90 sec', notes: '', ...extra };
}

export function makeSampleClient(today = new Date()): Client {
  const rand = rng(42);
  const thisMonday = mondayOnOrBefore(today);
  const week1 = new Date(thisMonday);
  week1.setDate(week1.getDate() - 7 * 6); // currently in week 7
  const week1Date = toISODate(week1);
  const todayIdx = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - week1.getTime()) / 86_400_000);

  const program: ProgramDay[] = [
    {
      id: uid('day'),
      title: 'Day 1 · Lower (glutes)',
      exercises: [
        ex('Barbell Hip Thrust', 3, '8-10', { rest: '2 min' }),
        ex('Romanian Deadlift', 3, '8-10', { rest: '2 min' }),
        ex('Bulgarian Split Squat', 3, '10-12'),
        ex('Hip Abduction Machine', 3, '15-20', { rest: '60 sec', technique: 'DS' }),
        ex('Standing Calf Raise', 3, '12-15', { rest: '60 sec', tempo: '2-2-1-1' }),
      ],
    },
    {
      id: uid('day'),
      title: 'Day 2 · Upper (back & delts)',
      exercises: [
        ex('Neutral Grip Lat Pulldown', 3, '10-12'),
        ex('Chest Supported Row', 3, '10-12'),
        ex('Incline DB Chest Press', 3, '8-12'),
        ex('DB Lateral Raise', 4, '12-15', { rest: '45 sec', technique: 'RP' }),
        ex('Cable Tricep Pushdown', 2, '12-15', { rest: '60 sec' }),
      ],
    },
    {
      id: uid('day'),
      title: 'Day 3 · Lower (hamstrings & quads)',
      exercises: [
        ex('Seated Hamstring Curl', 3, '10-12'),
        ex('45 Degree Leg Press', 3, '10-12'),
        ex('Walking Lunge', 2, '12 each leg'),
        ex('Cable Glute Kickback', 3, '12-15', { rest: '45 sec' }),
      ],
    },
    {
      id: uid('day'),
      title: 'Day 4 · Upper',
      exercises: [
        ex('Wide Grip Lat Pulldown', 3, '10-12'),
        ex('Seated Cable Row', 3, '10-12'),
        ex('Seated DB Shoulder Press', 3, '8-10'),
        ex('Rear Delt Fly Machine', 3, '15-20', { rest: '45 sec' }),
        ex('EZ Bar Curl', 2, '10-12', { rest: '60 sec' }),
      ],
    },
  ];

  // Logbook: steady progression over the finished weeks.
  const startKg: Record<string, number> = {
    'Barbell Hip Thrust': 60, 'Romanian Deadlift': 40, 'Bulgarian Split Squat': 8, 'Hip Abduction Machine': 35,
    'Standing Calf Raise': 30, 'Neutral Grip Lat Pulldown': 30, 'Chest Supported Row': 25, 'Incline DB Chest Press': 8,
    'DB Lateral Raise': 5, 'Cable Tricep Pushdown': 12.5, 'Seated Hamstring Curl': 25, '45 Degree Leg Press': 80,
    'Walking Lunge': 6, 'Cable Glute Kickback': 7.5, 'Wide Grip Lat Pulldown': 30, 'Seated Cable Row': 30,
    'Seated DB Shoulder Press': 8, 'Rear Delt Fly Machine': 20, 'EZ Bar Curl': 12.5,
  };
  const logbook: Record<string, LoggedSet[][]> = {};
  for (const day of program) {
    for (const e of day.exercises) {
      const base = startKg[e.name] ?? 20;
      const step = base >= 40 ? 5 : base >= 15 ? 2.5 : 1;
      const top = Number(e.reps.split(/\D/)[0]) || 10;
      const weeks: LoggedSet[][] = [];
      for (let w = 0; w < 6; w++) {
        const kg = base + step * Math.floor(w / 2);
        const reps = top + (w % 2) * 2;
        weeks.push(
          Array.from({ length: 4 }, (_, s) =>
            s < (e.sets ?? 3) ? { kg, reps: Math.max(top - 2, reps - s) } : { kg: null, reps: null },
          ),
        );
      }
      logbook[e.id] = weeks;
    }
  }

  // Check-ins: six full weeks plus the current week up to yesterday.
  const checkIns: Record<number, CheckInWeek> = {};
  const sessions = ['Day 1', '', 'Day 2', '', 'Day 3', 'Day 4', ''];
  let bw = 64.2;
  for (let w = 1; w <= 7; w++) {
    const wk = emptyWeek();
    for (let d = 0; d < 7; d++) {
      if ((w - 1) * 7 + d >= todayIdx) break;
      bw += (w <= 3 ? 0.03 : -0.06) + (rand() - 0.5) * 0.5;
      const training = sessions[d];
      const high = !!training;
      const day: DayEntry = {
        bw: round(bw, 1),
        weighTime: `07:${String(Math.floor(rand() * 4) * 10).padStart(2, '0')}`,
        cycleDay: ((w - 1) * 7 + d + 9) % 28 + 1,
        energy: 3 + Math.round(rand() * 2),
        stress: 1 + Math.round(rand() * 2),
        doms: rand() > 0.6 ? 'Yes' : 'No',
        illness: 'No',
        session: training,
        readiness: training ? 3 + Math.round(rand() * 2) : null,
        performance: training ? 3 + Math.round(rand() * 2) : null,
        cardioMin: d === 1 || d === 3 || d === 6 ? 30 : null,
        steps: Math.round((7000 + rand() * 4500) / 100) * 100,
        kcal: Math.round((high ? 1900 : 1650) + (rand() - 0.5) * 160),
        pro: Math.round(140 + (rand() - 0.5) * 20),
        cho: Math.round((high ? 200 : 150) + (rand() - 0.5) * 30),
        fat: Math.round(55 + (rand() - 0.5) * 12),
        fibre: Math.round(24 + rand() * 8),
        water: round(2.5 + rand(), 1),
        adherence: 3 + Math.round(rand() * 2),
        hunger: 2 + Math.round(rand() * 2),
        cravings: rand() > 0.75 ? 'Chocolate' : 'No',
        stools: 1 + Math.round(rand()),
        stoolRegular: rand() > 0.9 ? 'Irregular' : 'Regular',
        bristol: 3 + Math.round(rand()),
        sleepHrs: round(6.5 + rand() * 1.75, 2),
        sleepQuality: 3 + Math.round(rand() * 2),
        bedTime: ['22:45', '23:00', '23:15', '23:30', '00:10'][Math.floor(rand() * 5)],
        wakeTime: ['06:30', '06:45', '07:00'][Math.floor(rand() * 3)],
        rhr: 58 + Math.round(rand() * 6),
      };
      wk.days[d] = day;
    }
    if (w < 7) {
      wk.measurements = {
        Shoulders: round(101 - w * 0.1, 1), Chest: round(89 - w * 0.15, 1), Waist: round(71 - w * 0.25, 1), Hips: round(96 - w * 0.1, 1),
        Glutes: round(99 + w * 0.15, 1), Thigh: round(57 + w * 0.05, 1), Calf: 35, Arm: round(28.5 + w * 0.05, 1),
      };
      wk.summary = {
        wins: ['Hit every session', 'New best on hip thrust', 'Steps above target every day', 'Meal prep done on Sunday', 'Slept before midnight 5 nights', 'Felt strong on upper day'][w - 1],
        struggles: w === 4 ? 'Work travel on Thursday, ate out twice' : '',
        improve: 'Get to bed earlier on weekdays',
        coachHelp: '',
        comments: w === 5 ? 'Is it fine to swap rice for potatoes on rest days?' : '',
      };
      wk.complete = true;
      if (w === 5) wk.coachFeedback = 'Yes, potatoes are fine. Use the swap shown in the meal plan so calories stay the same.';
    }
    checkIns[w] = wk;
  }

  const timeline: Record<number, TimelineWeek> = {};
  for (let w = 1; w <= 20; w++) {
    const cutting = w > 3;
    timeline[w] = {
      phase: w <= 3 ? 'Maintenance' : w <= 14 ? 'Dieting Phase' : w === 15 ? 'Diet Break' : 'Dieting Phase',
      intakeHigh: cutting ? 1900 : 2100,
      intakeMed: null,
      intakeLow: cutting ? 1650 : 1850,
      cardio: cutting ? '3 × 30 min zone 2' : '2 × 20 min zone 2',
      steps: cutting ? 9000 : 8000,
      training: 'Glutes, back & delts',
      supplements: '',
      goals: w === 4 ? 'Start of the cut' : w === 15 ? 'Maintenance calories for one week' : '',
      notes: '',
    };
  }

  const nutritionDays = makeSamplePlans();
  const trainingSchedule = inferTrainingSchedule(program, ['Lower', '', 'Upper', '', 'Lower', 'Upper', '']);

  return {
    id: uid('client'),
    isSample: true,
    trainingSchedule,
    nutritionSchedule: inferNutritionSchedule(nutritionDays, trainingSchedule),
    profile: {
      name: 'Sample client',
      dob: '1994-03-14',
      heightCm: 168,
      startWeightKg: 64.2,
      coachingStart: week1Date,
      goal: 'Lean out while keeping glute and back development',
      goalDate: addDays(week1Date, 7 * 24),
      checkInDay: 'Sunday',
      stepsTarget: 9000,
      cardioTarget: '3 × 30 min zone 2 cardio per week',
      trainingFocus: 'Glutes, hamstrings, back and delts',
      habits: ['At least two full rest days a week', '7–8 hours of sleep', '2.5 L of water before dinner'],
      shortTermGoals: [
        { text: 'Waist under 70 cm', done: false },
        { text: 'Hip thrust 80 kg for 8', done: false },
        { text: 'Hit the step target 6 days a week', done: true },
      ],
      longTermGoals: [
        { text: 'Reach 60 kg with visible abs', done: false },
        { text: 'Build a routine that fits around work', done: false },
      ],
      whys: ['Feel confident on holiday', 'Prove to myself I can stay consistent'],
      weeklySplit: ['Lower (glutes)', '', 'Upper (back & delts)', '', 'Lower (hams & quads)', 'Upper', ''],
      guide: GUIDE,
    },
    week1Date,
    timeline,
    checkIns,
    measurementSites: [...DEFAULT_SITES],
    program,
    logbook,
    nutritionDays,
    supplements: [
      { id: uid('sup'), name: 'Creatine monohydrate', dose: '5 g', timing: 'Any time, daily', notes: 'Supports strength and training output', link: '' },
      { id: uid('sup'), name: 'Vitamin D3', dose: '2,000 IU', timing: 'With breakfast', notes: 'Low sun exposure in winter', link: '' },
      { id: uid('sup'), name: 'Omega-3 fish oil', dose: '2 g EPA+DHA', timing: 'With a meal', notes: '', link: '' },
      { id: uid('sup'), name: 'Magnesium glycinate', dose: '300 mg', timing: 'Before bed', notes: 'Sleep quality', link: '' },
    ],
    photoPoses: [...DEFAULT_POSES],
    photos: {},
  };
}

function makeSamplePlans(): DayPlan[] {
  return [
      {
        id: uid('plan'),
        name: 'Training day',
        water: 3,
        meals: [
          {
            id: uid('meal'),
            name: 'Breakfast',
            notes: 'Protein and slow carbs to start the day.',
            items: [
              { id: uid('fi'), food: 'Rolled Oats (Dry)', qty: 50, swap: 'Wholemeal Bread' },
              { id: uid('fi'), food: 'Whey Protein', qty: 30, swap: '' },
              { id: uid('fi'), food: 'Blueberries', qty: 100, swap: 'Banana' },
            ],
          },
          {
            id: uid('meal'),
            name: 'Pre-workout',
            notes: 'Eat 60–90 minutes before training.',
            items: [
              { id: uid('fi'), food: 'Jasmine Rice (Cooked)', qty: 180, swap: 'Sweet Potato, Baked' },
              { id: uid('fi'), food: 'Chicken Breast, Cooked', qty: 120, swap: 'White Fish, Cooked' },
              { id: uid('fi'), food: 'Broccoli', qty: 100, swap: '' },
            ],
          },
          {
            id: uid('meal'),
            name: 'Post-workout',
            notes: 'Within an hour of training. Keep fat low here.',
            items: [
              { id: uid('fi'), food: 'Potato, Boiled', qty: 250, swap: 'Jasmine Rice (Cooked)' },
              { id: uid('fi'), food: 'Lean Beef Mince 5%, Cooked', qty: 130, swap: 'Chicken Breast, Cooked' },
              { id: uid('fi'), food: 'Mixed Salad Leaves', qty: 80, swap: '' },
            ],
          },
          {
            id: uid('meal'),
            name: 'Evening',
            notes: '',
            items: [
              { id: uid('fi'), food: 'Salmon, Cooked', qty: 120, swap: 'Firm Tofu' },
              { id: uid('fi'), food: 'Spinach', qty: 80, swap: '' },
              { id: uid('fi'), food: 'Greek Yogurt 0%', qty: 150, swap: '' },
              { id: uid('fi'), food: 'Almonds', qty: 15, swap: 'Peanut Butter' },
            ],
          },
        ],
      },
      {
        id: uid('plan'),
        name: 'Rest day',
        water: 2.5,
        meals: [
          {
            id: uid('meal'),
            name: 'Breakfast',
            notes: 'A bigger breakfast on rest days helps with evening cravings.',
            items: [
              { id: uid('fi'), food: 'Egg (large)', qty: 2, swap: '' },
              { id: uid('fi'), food: 'Egg Whites', qty: 100, swap: '' },
              { id: uid('fi'), food: 'Wholemeal Bread', qty: 2, swap: 'Rolled Oats (Dry)' },
              { id: uid('fi'), food: 'Avocado', qty: 50, swap: '' },
            ],
          },
          {
            id: uid('meal'),
            name: 'Lunch',
            notes: '',
            items: [
              { id: uid('fi'), food: 'Chicken Thigh, Cooked', qty: 130, swap: 'Chicken Breast, Cooked' },
              { id: uid('fi'), food: 'Sweet Potato, Baked', qty: 150, swap: 'Potato, Boiled' },
              { id: uid('fi'), food: 'Broccoli', qty: 120, swap: '' },
            ],
          },
          {
            id: uid('meal'),
            name: 'Dinner',
            notes: '',
            items: [
              { id: uid('fi'), food: 'White Fish, Cooked', qty: 180, swap: 'Salmon, Cooked' },
              { id: uid('fi'), food: 'Jasmine Rice (Cooked)', qty: 100, swap: '' },
              { id: uid('fi'), food: 'Mixed Salad Leaves', qty: 100, swap: '' },
              { id: uid('fi'), food: 'Olive Oil', qty: 10, swap: '' },
            ],
          },
          {
            id: uid('meal'),
            name: 'Snack',
            notes: '',
            items: [
              { id: uid('fi'), food: 'Greek Yogurt 0%', qty: 200, swap: '' },
              { id: uid('fi'), food: 'Dark Chocolate 70%', qty: 15, swap: '' },
            ],
          },
        ],
      },
    ];
}

export function makeSampleData(): AppData {
  const client = makeSampleClient();
  return {
    version: 1,
    activeClientId: client.id,
    clients: [client],
    exercises: SAMPLE_EXERCISES,
    foods: SAMPLE_FOODS,
  };
}
