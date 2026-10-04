import { createContext, useContext } from 'react';
import type { AppData, Client, Mode } from './types';

export interface AppCtx {
  data: AppData;
  client: Client;
  /** Mutate app data in place (immer draft). */
  update: (recipe: (draft: AppData) => void) => void;
  /** Mutate the active client in place (immer draft). */
  updateClient: (recipe: (draft: Client) => void) => void;
  notify: (message: string) => void;
  go: (tab: string) => void;
  /** Who this device belongs to. */
  mode: Mode;
  /** The coach is looking at the client screens. */
  preview: boolean;
  setPreview: (on: boolean) => void;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

/** True when the screen is being shown to the client (on their phone, or a coach preview). */
export function useClientView(): boolean {
  const { mode, preview } = useApp();
  return mode === 'client' || preview;
}
