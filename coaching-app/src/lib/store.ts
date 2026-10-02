// Persistence. Everything stays in this browser (IndexedDB); nothing is uploaded.
// Falls back to memory when storage is unavailable (private windows, previews).

import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { AppData } from '../types';

const DATA_KEY = 'app-data';
const memory = new Map<string, unknown>();

let dataStore: UseStore | null = null;
let photoStore: UseStore | null = null;
try {
  if (typeof indexedDB !== 'undefined') {
    dataStore = createStore('coaching-app', 'data');
    photoStore = createStore('coaching-app-photos', 'photos');
  }
} catch {
  dataStore = null;
  photoStore = null;
}

export let storageAvailable = dataStore !== null;

async function safeGet<T>(key: string, store: UseStore | null): Promise<T | undefined> {
  if (store) {
    try {
      return await get<T>(key, store);
    } catch {
      storageAvailable = false;
    }
  }
  return memory.get(key) as T | undefined;
}

async function safeSet(key: string, value: unknown, store: UseStore | null): Promise<void> {
  memory.set(key, value);
  if (!store) return;
  try {
    await set(key, value, store);
  } catch {
    storageAvailable = false;
  }
}

async function safeDel(key: string, store: UseStore | null): Promise<void> {
  memory.delete(key);
  if (!store) return;
  try {
    await del(key, store);
  } catch {
    storageAvailable = false;
  }
}

export function loadData(): Promise<AppData | undefined> {
  return safeGet<AppData>(DATA_KEY, dataStore);
}

export function saveData(data: AppData): Promise<void> {
  return safeSet(DATA_KEY, data, dataStore);
}

export function getPhoto(key: string): Promise<Blob | undefined> {
  return safeGet<Blob>(key, photoStore);
}

export function putPhoto(key: string, blob: Blob): Promise<void> {
  return safeSet(key, blob, photoStore);
}

export function deletePhoto(key: string): Promise<void> {
  return safeDel(key, photoStore);
}
