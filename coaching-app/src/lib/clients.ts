// Creating clients.

import { DEFAULT_POSES, DEFAULT_SITES, type Client } from '../types';
import { toISODate, uid } from './calc';

export function blankClient(name = 'New client'): Client {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // this Monday
  const week1 = toISODate(d);
  return {
    id: uid('client'),
    profile: {
      name,
      dob: '',
      heightCm: null,
      startWeightKg: null,
      coachingStart: week1,
      goal: '',
      goalDate: '',
      checkInDay: '',
      stepsTarget: null,
      cardioTarget: '',
      trainingFocus: '',
      habits: [],
      shortTermGoals: [],
      longTermGoals: [],
      whys: [],
      weeklySplit: ['', '', '', '', '', '', ''],
      guide: [],
    },
    week1Date: week1,
    timeline: {},
    checkIns: {},
    measurementSites: [...DEFAULT_SITES],
    program: [],
    logbook: {},
    nutritionDays: [],
    supplements: [],
    photoPoses: [...DEFAULT_POSES],
    photos: {},
  };
}
