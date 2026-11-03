// Coach <-> client handoff without a server. The client sends an update file
// (their logs); the coach sends a setup file (the plan and feedback). Each
// side only overwrites the data it owns.

import type { AppData, CheckInWeek, Client, Exercise, Food } from '../types';
import { emptyWeek, mergeLibrary, toISODate } from './calc';

export interface ClientUpdate {
  app: 'coachbook';
  kind: 'client-update';
  version: 1;
  sentAt: string;
  client: Client;
  photos?: Record<string, string>; // photo key -> data URL
}

export interface SetupPack {
  app: 'coachbook';
  kind: 'client-setup';
  version: 1;
  sentAt: string;
  client: Client;
  exercises: Exercise[];
  foods: Food[];
}

export type Package = ClientUpdate | SetupPack;

export function parsePackage(text: string): Package {
  let obj: unknown;
  try {
    obj = JSON.parse(text.trim());
  } catch {
    throw new Error('This is not a Coachbook file. Ask for the file to be sent again.');
  }
  const p = obj as Partial<Package>;
  if (p?.app !== 'coachbook' || !p.client || (p.kind !== 'client-update' && p.kind !== 'client-setup')) {
    throw new Error('This is not a Coachbook update or setup file.');
  }
  return p as Package;
}

export function buildClientUpdate(client: Client, photos?: Record<string, string>): ClientUpdate {
  return { app: 'coachbook', kind: 'client-update', version: 1, sentAt: new Date().toISOString(), client, photos };
}

export function buildSetupPack(client: Client, exercises: Exercise[], foods: Food[]): SetupPack {
  const exNames = new Set(client.program.flatMap((d) => d.exercises.map((e) => e.name.trim().toLowerCase())));
  const foodNames = new Set(client.nutritionDays.flatMap((d) => d.meals.flatMap((m) => m.items.flatMap((i) => [i.food, i.swap]))).map((n) => n.trim().toLowerCase()));
  // Photos and the coach-only import notes stay on the coach's device.
  const { importNotes: _notes, ...rest } = client;
  void _notes;
  return {
    app: 'coachbook',
    kind: 'client-setup',
    version: 1,
    sentAt: new Date().toISOString(),
    client: { ...rest, photos: {}, isSample: undefined },
    exercises: exercises.filter((e) => exNames.has(e.name.trim().toLowerCase())),
    foods: foods.filter((f) => foodNames.has(f.name.trim().toLowerCase())),
  };
}

const CLIENT_WEEK_FIELDS = ['days', 'measurements', 'summary', 'complete'] as const;

/** Coach side: take the client's logs, keep the coach's feedback and plan.
 * Only photos whose image came with the update are linked. */
export function mergeClientUpdate(target: Client, incoming: Client, photoKeys: Set<string> = new Set()): number {
  let weeks = 0;
  for (const [k, inWeek] of Object.entries(incoming.checkIns)) {
    const w = Number(k);
    const cur: CheckInWeek = target.checkIns[w] ?? emptyWeek();
    for (const f of CLIENT_WEEK_FIELDS) (cur as unknown as Record<string, unknown>)[f] = inWeek[f];
    target.checkIns[w] = cur;
    weeks++;
  }
  for (const [id, logs] of Object.entries(incoming.logbook)) target.logbook[id] = logs;
  for (const [slot, key] of Object.entries(incoming.photos)) if (photoKeys.has(key)) target.photos[slot] = key;
  target.lastUpdateAt = new Date().toISOString();
  return weeks;
}

/** Client side: take the coach's plan and feedback, keep the client's logs. */
export function mergeSetupPack(target: Client, incoming: Client): void {
  target.profile = incoming.profile;
  target.week1Date = incoming.week1Date;
  target.timeline = incoming.timeline;
  target.measurementSites = incoming.measurementSites;
  target.program = incoming.program;
  target.nutritionDays = incoming.nutritionDays;
  target.supplements = incoming.supplements;
  target.photoPoses = incoming.photoPoses;
  target.trainingSchedule = incoming.trainingSchedule;
  target.nutritionSchedule = incoming.nutritionSchedule;
  for (const [k, inWeek] of Object.entries(incoming.checkIns)) {
    const w = Number(k);
    const cur = target.checkIns[w];
    if (!cur) target.checkIns[w] = { ...inWeek };
    else {
      cur.coachFeedback = inWeek.coachFeedback;
      cur.reviewed = inWeek.reviewed;
    }
  }
  for (const [id, logs] of Object.entries(incoming.logbook)) if (!target.logbook[id]) target.logbook[id] = logs;
}

export type ApplyResult = { kind: 'update' | 'setup'; clientName: string; added: boolean; weeks: number };

/** Apply a package to app data (an immer draft). `photoKeys` are the photos
 * from the package that have already been saved on this device. */
export function applyPackage(d: AppData, pkg: Package, photoKeys: Set<string> = new Set()): ApplyResult {
  const existing = d.clients.find((c) => c.id === pkg.client.id);
  const name = pkg.client.profile.name || 'client';
  if (pkg.kind === 'client-update') {
    if (existing) {
      const weeks = mergeClientUpdate(existing, pkg.client, photoKeys);
      d.activeClientId = existing.id;
      return { kind: 'update', clientName: name, added: false, weeks };
    }
    d.clients = d.clients.filter((c) => !c.isSample);
    const photos = Object.fromEntries(Object.entries(pkg.client.photos).filter(([, k]) => photoKeys.has(k)));
    d.clients.push({ ...pkg.client, photos, isSample: undefined, lastUpdateAt: new Date().toISOString() });
    d.activeClientId = pkg.client.id;
    return { kind: 'update', clientName: name, added: true, weeks: Object.keys(pkg.client.checkIns).length };
  }
  d.exercises = mergeLibrary(d.exercises, pkg.exercises ?? []);
  d.foods = mergeLibrary(d.foods, pkg.foods ?? []);
  if (existing) {
    mergeSetupPack(existing, pkg.client);
    d.activeClientId = existing.id;
    return { kind: 'setup', clientName: name, added: false, weeks: 0 };
  }
  d.clients = d.clients.filter((c) => !c.isSample);
  d.clients.push({ ...pkg.client, isSample: undefined });
  d.activeClientId = pkg.client.id;
  return { kind: 'setup', clientName: name, added: true, weeks: 0 };
}

/** Phones only share a few file types, so packages travel as .txt files. */
export function packageFileName(client: Client, kind: Package['kind']): string {
  const who = (client.profile.name || 'client').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'client';
  const date = toISODate(new Date());
  return kind === 'client-update' ? `${who}-checkin-${date}.txt` : `${who}-plan-${date}.txt`;
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/** Share through the phone's share sheet (WhatsApp, email…) or download. */
export async function shareText(fileName: string, text: string, title: string): Promise<ShareOutcome> {
  try {
    const file = new File([text], fileName, { type: 'text/plain' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], title });
        return 'shared';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
