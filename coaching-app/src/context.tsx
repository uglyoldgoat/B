import { createContext, useContext } from 'react';
import type { AppData, Client } from './types';

export interface AppCtx {
  data: AppData;
  client: Client;
  /** Mutate app data in place (immer draft). */
  update: (recipe: (draft: AppData) => void) => void;
  /** Mutate the active client in place (immer draft). */
  updateClient: (recipe: (draft: Client) => void) => void;
  notify: (message: string) => void;
  go: (tab: string) => void;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}
