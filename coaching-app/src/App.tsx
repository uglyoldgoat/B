import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { produce } from 'immer';
import { Ctx, type AppCtx } from './context';
import type { AppData, Client, Mode } from './types';
import { loadData, saveData } from './lib/store';
import { Icon } from './components/icons';
import { Welcome } from './views/Welcome';
// Coach screens
import { Clients } from './views/Clients';
import { Dashboard } from './views/Dashboard';
import { Review } from './views/Review';
import { CheckIn } from './views/CheckIn';
import { Timeline } from './views/Timeline';
import { Training } from './views/Training';
import { Logbook } from './views/Logbook';
import { Nutrition } from './views/Nutrition';
import { Photos } from './views/Photos';
import { Supplements } from './views/Supplements';
import { Library } from './views/Library';
import { DataView } from './views/DataView';
// Client screens
import { Today } from './views/client/Today';
import { ClientCheckIn } from './views/client/ClientCheckIn';
import { Workout } from './views/client/Workout';
import { Meals } from './views/client/Meals';
import { Progress } from './views/client/Progress';
import { More } from './views/client/More';

interface Tab {
  id: string;
  label: string;
  View: ComponentType;
  icon?: string;
  /** Shown before the client was chosen (not tied to the active client). */
  global?: boolean;
}

const COACH_TABS: Tab[] = [
  { id: 'clients', label: 'All clients', View: Clients, global: true },
  { id: 'overview', label: 'Overview', View: Dashboard },
  { id: 'review', label: 'Weekly review', View: Review },
  { id: 'checkin', label: 'Check-ins', View: CheckIn },
  { id: 'timeline', label: 'Timeline', View: Timeline },
  { id: 'training', label: 'Training', View: Training },
  { id: 'logbook', label: 'Logbook', View: Logbook },
  { id: 'nutrition', label: 'Meal plan', View: Nutrition },
  { id: 'photos', label: 'Photos', View: Photos },
  { id: 'supplements', label: 'Supplements', View: Supplements },
  { id: 'library', label: 'Library', View: Library, global: true },
  { id: 'data', label: 'Settings', View: DataView, global: true },
];

const CLIENT_TABS: Tab[] = [
  { id: 'today', label: 'Today', View: Today, icon: 'today' },
  { id: 'log', label: 'Check-in', View: ClientCheckIn, icon: 'log' },
  { id: 'workout', label: 'Workout', View: Workout, icon: 'workout' },
  { id: 'meals', label: 'Meals', View: Meals, icon: 'meals' },
  { id: 'progress', label: 'Progress', View: Progress, icon: 'progress' },
  { id: 'more', label: 'More', View: More, icon: 'more' },
];

const ALIASES: Record<string, string> = { dashboard: 'overview' };

function hashTab(): string {
  const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
  return ALIASES[h] ?? h;
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [tab, setTab] = useState(hashTab);
  const [preview, setPreviewState] = useState(false);
  const [toast, setToast] = useState('');
  const loaded = useRef(false);

  useEffect(() => {
    let alive = true;
    const done = (d: AppData | undefined) => {
      if (!alive) return;
      if (d && d.clients?.length) {
        // Data saved before roles existed belongs to a coach.
        setData(d.mode ? d : { ...d, mode: 'coach' });
      } else setFirstRun(true);
      loaded.current = true;
    };
    loadData().then(done, () => done(undefined));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!data || !loaded.current) return;
    const t = setTimeout(() => void saveData(data), 300);
    return () => clearTimeout(t);
  }, [data]);

  useEffect(() => {
    const onHash = () => setTab(hashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3600);
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
      /* not allowed in some embedded viewers */
    }
    window.scrollTo({ top: 0 });
  }, []);

  const setPreview = useCallback(
    (on: boolean) => {
      setPreviewState(on);
      go(on ? 'today' : 'overview');
    },
    [go],
  );

  const mode: Mode = data?.mode ?? 'coach';
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
      mode,
      preview,
      setPreview,
    };
  }, [data, client, update, go, mode, preview, setPreview]);

  if (firstRun && !data) {
    return (
      <Welcome
        onStart={(d) => {
          setData(d);
          setFirstRun(false);
          go(d.mode === 'client' ? 'today' : 'clients');
        }}
      />
    );
  }
  if (!ctx || !client || !data) {
    return (
      <main>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const clientView = mode === 'client' || preview;
  const tabs = clientView ? CLIENT_TABS : COACH_TABS;
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  const Active = active.View;

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
            {mode === 'coach' && !preview && (
              <>
                <label className="sr-only" htmlFor="client-select">
                  Client
                </label>
                <select
                  id="client-select"
                  style={{ width: 'auto', maxWidth: '46vw' }}
                  value={client.id}
                  onChange={(e) => {
                    update((d) => {
                      d.activeClientId = e.target.value;
                    });
                    if (active.global && active.id !== 'library') go('overview');
                  }}
                >
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.profile.name || 'Unnamed client'}
                      {c.isSample ? ' (sample)' : ''}
                    </option>
                  ))}
                </select>
                <button className="btn small" onClick={() => setPreview(true)} title="See the app the way this client sees it">
                  Client view
                </button>
              </>
            )}
            {clientView && <span className="ink2 small">{client.profile.name}</span>}
          </div>
          <nav className={`tabs ${clientView ? 'client-tabs' : ''}`} aria-label="Sections">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                className={`tab ${!clientView && i > 0 && t.global && !tabs[i - 1].global ? 'tab-sep' : ''}`}
                aria-current={t.id === active.id ? 'page' : undefined}
                onClick={() => go(t.id)}
              >
                {t.icon && <Icon name={t.icon} />}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main key={`${client.id}-${active.id}-${clientView}`} className={clientView ? 'client-main' : undefined}>
        {preview && (
          <div className="banner info">
            <span className="grow">
              You're seeing the app the way <b>{client.profile.name || 'this client'}</b> sees it on their phone.
            </span>
            <button className="btn primary small" onClick={() => setPreview(false)}>
              Back to coach view
            </button>
          </div>
        )}
        {mode === 'coach' && !preview && client.isSample && active.id !== 'data' && (
          <div className="banner info">
            <span className="grow">
              This is a <b>sample client</b> with made-up data. Import a client's workbook to start for real.
            </span>
            <button className="btn primary small" onClick={() => go('clients')}>
              Add a client
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
