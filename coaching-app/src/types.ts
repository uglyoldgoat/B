// Data model. Mirrors the coaching spreadsheet template, one interface per sheet.

export type Num = number | null;

export interface Exercise {
  name: string;
  primary: string; // body part the sets count toward
  secondary: string; // optional second body part (sets count toward it too)
  notes: string; // set-up notes
  video: string; // URL
}

export interface Food {
  name: string;
  amount: number; // serving size the macros below refer to
  unit: string; // g, mL, egg, slice...
  kcal: number;
  pro: number;
  cho: number;
  fat: number;
  category: string; // PRO / CHO / FAT / VEG / FRUIT / OTHER
}

export interface Goal {
  text: string;
  done: boolean;
}

export interface GuideEntry {
  title: string;
  body: string;
}

export interface Profile {
  name: string;
  dob: string; // YYYY-MM-DD
  heightCm: Num;
  startWeightKg: Num;
  coachingStart: string; // YYYY-MM-DD, when coaching began (Dashboard "start date")
  goal: string;
  goalDate: string;
  checkInDay: string; // Monday..Sunday
  stepsTarget: Num;
  cardioTarget: string;
  trainingFocus: string;
  habits: string[];
  shortTermGoals: Goal[];
  longTermGoals: Goal[];
  whys: string[];
  weeklySplit: string[]; // 7 entries, Monday first
  guide: GuideEntry[];
}

export const PHASES = [
  'Improvement Season',
  'Photoshoot Prep',
  'Competition Prep',
  'Dieting Phase',
  'Gaining Phase',
  'Maintenance',
  'Health-Focus',
  'Diet Break',
  'Peak Week',
  'Holiday',
] as const;

/** Targets the coach sets for one week (Timeline sheet). */
export interface TimelineWeek {
  phase: string;
  intakeHigh: Num;
  intakeMed: Num;
  intakeLow: Num;
  cardio: string;
  steps: Num;
  training: string;
  supplements: string;
  goals: string;
  notes: string;
}

/** One day of the daily check-in (Check-In sheet, one column). */
export interface DayEntry {
  bw?: Num;
  weighTime?: string;
  cycleDay?: Num;
  pms?: string;
  energy?: Num;
  stress?: Num;
  doms?: string;
  illness?: string;
  session?: string;
  readiness?: Num;
  performance?: Num;
  trainingNotes?: string;
  cardioMin?: Num;
  steps?: Num;
  kcal?: Num;
  pro?: Num;
  cho?: Num;
  fat?: Num;
  fibre?: Num;
  water?: Num;
  adherence?: Num;
  hunger?: Num;
  cravings?: string;
  nutritionNotes?: string;
  stools?: Num;
  stoolRegular?: string;
  bristol?: Num;
  digestion?: string;
  sleepHrs?: Num;
  sleepQuality?: Num;
  bedTime?: string; // HH:MM, 24h
  wakeTime?: string;
  hrv?: Num;
  hrvReadiness?: Num;
  rhr?: Num;
  bp?: string;
  glucose?: Num;
}

export interface WeeklySummary {
  wins: string;
  struggles: string;
  improve: string;
  coachHelp: string;
  comments: string;
}

export interface CheckInWeek {
  days: DayEntry[]; // always 7
  measurements: Record<string, Num>;
  summary: WeeklySummary;
  complete: boolean; // client says the week's check-in is done
  coachFeedback: string;
  reviewed?: boolean; // coach has reviewed the week
}

export interface ProgramExercise {
  id: string;
  name: string;
  feeder: string;
  sets: Num;
  reps: string;
  tempo: string; // e.g. 3-1-1-1
  rir: string;
  technique: string;
  rest: string;
  notes: string; // coach note; exercise set-up notes come from the library
}

export interface ProgramDay {
  id: string;
  title: string;
  exercises: ProgramExercise[];
}

export interface LoggedSet {
  kg: Num;
  reps: Num;
}

export interface FoodItem {
  id: string;
  food: string;
  qty: Num;
  swap: string; // optional alternative food, quantity is calorie-matched
}

export interface Meal {
  id: string;
  name: string;
  notes: string;
  items: FoodItem[];
}

export interface DayPlan {
  id: string;
  name: string;
  water: Num; // litres
  meals: Meal[];
  archived?: boolean; // kept for reference, not part of the current plan
}

export interface Supplement {
  id: string;
  name: string;
  dose: string;
  timing: string;
  notes: string;
  link: string;
}

export interface Client {
  id: string;
  isSample?: boolean;
  importedFrom?: string;
  importedAt?: string;
  importNotes?: string[];
  profile: Profile;
  week1Date: string; // first day of check-in week 1
  timeline: Record<number, TimelineWeek>;
  checkIns: Record<number, CheckInWeek>;
  measurementSites: string[];
  program: ProgramDay[];
  /** exercise id -> week index (0-based) -> sets */
  logbook: Record<string, LoggedSet[][]>;
  nutritionDays: DayPlan[];
  supplements: Supplement[];
  photoPoses: string[];
  /** "week-pose" -> photo key in the photo store */
  photos: Record<string, string>;
  /** Monday-first: program day id per weekday, '' for rest. */
  trainingSchedule?: string[];
  /** Monday-first: meal plan day id per weekday, '' when not set. */
  nutritionSchedule?: string[];
  /** When the coach last imported an update from this client. */
  lastUpdateAt?: string;
  /** When this device last sent a file (client update or coach plan). */
  lastSentAt?: string;
  /** Program day id -> date each logged session started (index = session number - 1). */
  sessionDates?: Record<string, string[]>;
}

/** Who uses this device: a coach managing clients, or one client. */
export type Mode = 'coach' | 'client';

export interface AppData {
  version: 1;
  mode?: Mode;
  activeClientId: string;
  clients: Client[];
  exercises: Exercise[];
  foods: Food[];
}

// ---------------------------------------------------------------------------
// Check-in field schema: drives the form, the weekly averages and the importer.

export type Agg =
  | 'avg1' // ROUND(AVERAGE, 1)
  | 'avg0' // ROUND(AVERAGE, 0)
  | 'avgNonZero0' // ROUND(AVERAGEIF(<>0), 0)
  | 'sum'
  | 'countYes'
  | 'countIrregular'
  | 'countText' // number of days with a real entry
  | 'avgHours' // average of hours
  | 'avgClock' // circular mean of clock times
  | 'none';

export type FieldType = 'number' | 'text' | 'longtext' | 'scale5' | 'yesno' | 'time' | 'regular' | 'scale7';

export interface FieldDef {
  key: keyof DayEntry;
  label: string;
  hint?: string;
  section: string;
  type: FieldType;
  agg: Agg;
  unit?: string;
  step?: number;
  row: number; // row in the Check-In sheet
}

export const CHECKIN_SECTIONS = [
  'Body composition',
  'Menstrual cycle',
  'Biofeedback',
  'Daily activity',
  'Daily nutrition',
  'Digestion',
  'Sleep',
  'Functional data',
] as const;

export const CHECKIN_FIELDS: FieldDef[] = [
  { key: 'bw', label: 'Bodyweight', hint: 'On waking, before food, after the bathroom', section: 'Body composition', type: 'number', agg: 'avg1', unit: 'kg', step: 0.1, row: 7 },
  { key: 'weighTime', label: 'Time of weigh-in', section: 'Body composition', type: 'time', agg: 'none', row: 8 },
  { key: 'cycleDay', label: 'Day of cycle', hint: 'Enter 1 on the day your period starts. Grey numbers count on from your last entry', section: 'Menstrual cycle', type: 'number', agg: 'none', row: 13 },
  { key: 'pms', label: 'PMS symptoms', hint: 'Effects on energy, mood, cravings, training', section: 'Menstrual cycle', type: 'longtext', agg: 'none', row: 14 },
  { key: 'energy', label: 'Energy', hint: '1 low – 5 high', section: 'Biofeedback', type: 'scale5', agg: 'avg1', row: 17 },
  { key: 'stress', label: 'Mental & emotional stress', hint: '1 low – 5 high', section: 'Biofeedback', type: 'scale5', agg: 'avg1', row: 18 },
  { key: 'doms', label: 'Muscle soreness (DOMS)', section: 'Biofeedback', type: 'yesno', agg: 'countYes', row: 19 },
  { key: 'illness', label: 'Signs of illness', section: 'Biofeedback', type: 'yesno', agg: 'countYes', row: 20 },
  { key: 'session', label: 'Training session', hint: 'Which session did you do?', section: 'Daily activity', type: 'text', agg: 'countText', row: 23 },
  { key: 'readiness', label: 'Readiness to train', hint: '1 low – 5 high', section: 'Daily activity', type: 'scale5', agg: 'avg1', row: 24 },
  { key: 'performance', label: 'Strength & performance', hint: '1 low – 5 high', section: 'Daily activity', type: 'scale5', agg: 'avg1', row: 25 },
  { key: 'trainingNotes', label: 'Training notes', hint: 'Regressions, progressions, pain', section: 'Daily activity', type: 'longtext', agg: 'none', row: 26 },
  { key: 'cardioMin', label: 'Cardio', section: 'Daily activity', type: 'number', agg: 'sum', unit: 'min', row: 27 },
  { key: 'steps', label: 'Steps', hint: 'Round to the nearest 100', section: 'Daily activity', type: 'number', agg: 'avg0', step: 100, row: 28 },
  { key: 'kcal', label: 'Calories', section: 'Daily nutrition', type: 'number', agg: 'avgNonZero0', unit: 'kcal', row: 31 },
  { key: 'pro', label: 'Protein', section: 'Daily nutrition', type: 'number', agg: 'avg0', unit: 'g', row: 32 },
  { key: 'cho', label: 'Carbohydrate', section: 'Daily nutrition', type: 'number', agg: 'avg0', unit: 'g', row: 33 },
  { key: 'fat', label: 'Fat', section: 'Daily nutrition', type: 'number', agg: 'avg0', unit: 'g', row: 34 },
  { key: 'fibre', label: 'Fibre', section: 'Daily nutrition', type: 'number', agg: 'avg0', unit: 'g', row: 35 },
  { key: 'water', label: 'Water', section: 'Daily nutrition', type: 'number', agg: 'avg1', unit: 'L', step: 0.1, row: 36 },
  { key: 'adherence', label: 'Nutrition adherence', hint: '1 low – 5 high', section: 'Daily nutrition', type: 'scale5', agg: 'avg1', row: 37 },
  { key: 'hunger', label: 'Hunger', hint: '1 low – 5 high', section: 'Daily nutrition', type: 'scale5', agg: 'avg1', row: 38 },
  { key: 'cravings', label: 'Cravings', hint: 'What were they?', section: 'Daily nutrition', type: 'text', agg: 'countText', row: 39 },
  { key: 'nutritionNotes', label: 'Adherence, hunger & craving notes', section: 'Daily nutrition', type: 'longtext', agg: 'none', row: 40 },
  { key: 'stools', label: 'Bowel movements', section: 'Digestion', type: 'number', agg: 'avg0', row: 43 },
  { key: 'stoolRegular', label: 'Regular / irregular', section: 'Digestion', type: 'regular', agg: 'countIrregular', row: 44 },
  { key: 'bristol', label: 'Bristol stool chart', hint: 'Type 1–7', section: 'Digestion', type: 'scale7', agg: 'none', row: 45 },
  { key: 'digestion', label: 'Digestive issues', section: 'Digestion', type: 'text', agg: 'countText', row: 46 },
  { key: 'sleepHrs', label: 'Sleep duration', hint: 'Aim for 8 h or more', section: 'Sleep', type: 'number', agg: 'avgHours', unit: 'h', step: 0.25, row: 49 },
  { key: 'sleepQuality', label: 'Sleep quality', hint: 'Score or 1–5 rating', section: 'Sleep', type: 'number', agg: 'avg1', row: 50 },
  { key: 'bedTime', label: 'Bedtime', section: 'Sleep', type: 'time', agg: 'avgClock', row: 51 },
  { key: 'wakeTime', label: 'Wake time', section: 'Sleep', type: 'time', agg: 'avgClock', row: 52 },
  { key: 'hrv', label: 'HRV', hint: 'On waking', section: 'Functional data', type: 'number', agg: 'avg0', unit: 'ms', row: 55 },
  { key: 'hrvReadiness', label: 'HRV readiness', section: 'Functional data', type: 'number', agg: 'avg0', row: 56 },
  { key: 'rhr', label: 'Resting heart rate', section: 'Functional data', type: 'number', agg: 'avg0', unit: 'bpm', row: 57 },
  { key: 'bp', label: 'Blood pressure', hint: 'Systolic/diastolic', section: 'Functional data', type: 'text', agg: 'none', unit: 'mmHg', row: 58 },
  { key: 'glucose', label: 'Fasted blood glucose', section: 'Functional data', type: 'number', agg: 'avg1', unit: 'mmol/L', step: 0.1, row: 59 },
];

export const SUMMARY_QUESTIONS: { key: keyof WeeklySummary; label: string; row: number }[] = [
  { key: 'wins', label: 'Biggest wins this week', row: 62 },
  { key: 'struggles', label: 'Anything you struggled with', row: 63 },
  { key: 'improve', label: 'What you want to improve next week', row: 64 },
  { key: 'coachHelp', label: 'Anything more your coach can do', row: 65 },
  { key: 'comments', label: 'Other comments or questions', row: 66 },
];

export const DEFAULT_SITES = ['Shoulders', 'Chest', 'Waist', 'Hips', 'Glutes', 'Thigh', 'Calf', 'Arm'];
export const DEFAULT_POSES = ['Front relaxed', 'Side relaxed', 'Back relaxed', 'Front flexed', 'Side flexed', 'Back flexed', 'Pose 7', 'Pose 8'];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const TECHNIQUES = ['STRAIGHT SET', 'P', 'RP', 'DS', 'MDS', 'MR', 'FR', 'PR', 'BFR', 'ZIG-ZAG', 'SUPERSET'];
