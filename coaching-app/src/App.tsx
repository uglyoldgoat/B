import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { produce } from 'immer';
import { Ctx, type AppCtx } from './context';
import type { AppData, Client } from './types';
import { loadData, saveData } from './lib/store';
import { makeSampleData } from './lib/sample';
import { Dashboard } from './views/Dashboard';
import { CheckIn } from './views/CheckIn';
import { Timeline } from './views/Timeline';
import { Training } from './views/Training';
import { Logbook } from './views/Logbook';
import { Nutrition } from './views/Nutrition';
import { Photos } from './views/Photos';
import { Supplements } from './views/Supplements';
import { Library } from './views/Library';
import { DataView } from './views/DataView';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', View: Dashboard },
  { id: 'checkin', label: 'Check-in', View: CheckIn },
  { id: 'timeline', label: 'Timeline', View: Timeline },
  { id: 'training', label: 'Training', View: Training },
  { id: 'logbook', label: 'Logbook', View: Logbook },
  { id: 'nutrition', label: 'Meal plan', View: Nutrition },
  { id: 'photos', label: 'Photos', View: Photos },
  { id: 'supplements', label: 'Supplements', View: Supplements },
  { id: 'library', label: 'Library', View: Library },
  { id: 'data', label: 'Clients & data', View: DataView },
] as const;

function tabFromHash(): string {
  const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
  return TABS.some((t) => t.id === h) ? h : 'dashboard';
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState(tabFromHash);
  const [toast, setToast] = useState('');
  const loaded = useRef(false);

  useEffect(() => {
    let alive = true;
    loadData()
      .then((d) => {
        if (!alive) return;
        setData(d && d.clients?.length ? d : makeSampleData());
        loaded.current = true;
      })
      .catch(() => {
        setData(makeSampleData());
        loaded.current = true;
      });
    return () => {
      alive = false;
    };
  }, []);

  // Save shortly after each change.
  useEffect(() => {
    if (!data || !loaded.current) return;
    const t = setTimeout(() => void saveData(data), 300);
    return () => clearTimeout(t);
  }, [data]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const update = useCallback((recipe: (d: AppData) => void) => {
    setData((d) => (d ? produce(d, recipe) : d));
  }, []);

  const go = useCallback((id: string) => {
    setTab(id);
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0 });
  }, []);

  const client: Client | undefined = data?.clients.find((c) => c.id === data.activeClientId) ?? data?.clients[0];

  const ctx: AppCtx | null = useMemo(() => {
    if (!data || !client) return null;
    return {
      data,
      client,
      update,
      updateClient: (recipe) =>
        update((d) => {
          const c = d.clients.find((x) => x.id === client.id);
          if (c) recipe(c);
        }),
      notify: setToast,
      go,
    };
  }, [data, client, update, go]);

  if (!ctx || !client) {
    return (
      <main>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const Active = TABS.find((t) => t.id === tab)?.View ?? Dashboard;

  return (
    <Ctx.Provider value={ctx}>
      <header className="appbar">
        <div className="appbar-inner">
          <div className="appbar-top">
            <div className="brand">
              <span className="brand-mark">
                Coach<span>book</span>
              </span>
            </div>
            <label className="sr-only" htmlFor="client-select">
              Client
            </label>
            <select
              id="client-select"
              style={{ width: 'auto', maxWidth: '60vw' }}
              value={client.id}
              onChange={(e) => {
                if (e.target.value === '__import') {
                  go('data');
                  return;
                }
                update((d) => {
                  d.activeClientId = e.target.value;
                });
              }}
            >
              {data!.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.profile.name || 'Unnamed client'}
                  {c.isSample ? ' (sample)' : ''}
                </option>
              ))}
              <option value="__import">Import or add a client…</option>
            </select>
          </div>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} className="tab" aria-current={t.id === tab ? 'page' : undefined} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main key={`${client.id}-${tab}`}>
        {client.isSample && tab !== 'data' && (
          <div className="banner info">
            <span className="grow">
              You're looking at a <b>sample client</b> with made-up data. Import a client workbook (.xlsx) to see real data. It stays in this browser.
            </span>
            <button className="btn primary small" onClick={() => go('data')}>
              Import a workbook
            </button>
          </div>
        )}
        <Active />
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Ctx.Provider>
  );
}
