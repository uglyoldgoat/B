import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { produce } from 'immer';
import { Ctx, type AppCtx } from './context';
import type { AppData, Client, Mode } from './types';
import { loadData, saveData } from './lib/store';
import { BrandMark, Icon } from './components/icons';

// Screens load in two chunks: a client's phone only downloads the client screens.
const coach = () => import('./views/coach');
const clientScreens = () => import('./views/client');
type Screens = Record<string, ComponentType>;
const screen = (load: () => Promise<unknown>, name: string) =>
  lazy(() => load().then((m) => ({ default: (m as Screens)[name] })));
const Welcome = lazy(() => import('./views/Welcome').then((m) => ({ default: m.Welcome })));

interface Tab {
  id: string;
  label: string;
  View: ComponentType;
  icon: string;
  /** Not tied to the active client. */
  global?: boolean;
}

const COACH_TABS: Tab[] = [
  { id: 'clients', label: 'All clients', View: screen(coach, 'Clients'), icon: 'clients', global: true },
  { id: 'overview', label: 'Overview', View: screen(coach, 'Dashboard'), icon: 'overview' },
  { id: 'review', label: 'Weekly review', View: screen(coach, 'Review'), icon: 'review' },
  { id: 'checkin', label: 'Check-ins', View: screen(coach, 'CheckIn'), icon: 'checkin' },
  { id: 'timeline', label: 'Timeline', View: screen(coach, 'Timeline'), icon: 'timeline' },
  { id: 'training', label: 'Training', View: screen(coach, 'Training'), icon: 'training' },
  { id: 'logbook', label: 'Logbook', View: screen(coach, 'Logbook'), icon: 'logbook' },
  { id: 'nutrition', label: 'Meal plan', View: screen(coach, 'Nutrition'), icon: 'nutrition' },
  { id: 'photos', label: 'Photos', View: screen(coach, 'Photos'), icon: 'photos' },
  { id: 'supplements', label: 'Supplements', View: screen(coach, 'Supplements'), icon: 'supplements' },
  { id: 'library', label: 'Library', View: screen(coach, 'Library'), icon: 'library', global: true },
  { id: 'data', label: 'Settings', View: screen(coach, 'DataView'), icon: 'data', global: true },
];

/** On phones the coach gets these four in the bottom bar; the rest sit under More. */
const COACH_PRIMARY = ['clients', 'overview', 'review', 'checkin'];
const COACH_SHORT: Record<string, string> = { clients: 'Clients', review: 'Review' };

const CLIENT_TABS: Tab[] = [
  { id: 'today', label: 'Today', View: screen(clientScreens, 'Today'), icon: 'today' },
  { id: 'log', label: 'Check-in', View: screen(clientScreens, 'ClientCheckIn'), icon: 'log' },
  { id: 'workout', label: 'Workout', View: screen(clientScreens, 'Workout'), icon: 'workout' },
  { id: 'meals', label: 'Meals', View: screen(clientScreens, 'Meals'), icon: 'meals' },
  { id: 'progress', label: 'Progress', View: screen(clientScreens, 'Progress'), icon: 'progress' },
  { id: 'more', label: 'More', View: screen(clientScreens, 'More'), icon: 'more' },
];

const ALIASES: Record<string, string> = { dashboard: 'overview' };

function hashTab(): string {
  const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
  return ALIASES[h] ?? h;
}

function Loading() {
  return (
    <div className="loading" role="status">
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [tab, setTab] = useState(hashTab);
  const [preview, setPreviewState] = useState(false);
  const [toast, setToast] = useState('');
  const loaded = useRef(false);
  const sheet = useRef<HTMLDialogElement>(null);

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
    sheet.current?.close();
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
      <Suspense fallback={<Loading />}>
        <Welcome
          onStart={(d) => {
            setData(d);
            setFirstRun(false);
            go(d.mode === 'client' ? 'today' : 'clients');
          }}
        />
      </Suspense>
    );
  }
  if (!ctx || !client || !data) return <Loading />;

  const clientView = mode === 'client' || preview;
  const coachView = !clientView;
  const tabs = clientView ? CLIENT_TABS : COACH_TABS;
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  const Active = active.View;
  const firstName = client.profile.name.split(' ')[0] || 'Client';
  const bottom = coachView ? COACH_TABS.filter((t) => COACH_PRIMARY.includes(t.id)) : CLIENT_TABS;
  const inMore = coachView && !COACH_PRIMARY.includes(active.id);

  return (
    <Ctx.Provider value={ctx}>
      <header className={`appbar ${clientView ? 'is-client' : 'is-coach'}`}>
        <div className="appbar-inner">
          <div className="appbar-top">
            <div className={`brand ${coachView || preview ? 'compact' : ''}`}>
              <BrandMark />
              <span className="brand-mark">
                Coach<span>book</span>
              </span>
            </div>
            {coachView && (
              <>
                <label className="switcher">
                  <span className="sr-only">Client</span>
                  <select
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
                </label>
                <button className="btn small preview-btn" onClick={() => setPreview(true)} title="See the app the way this client sees it">
                  <Icon name="eye" size={18} />
                  <span>Client view</span>
                </button>
              </>
            )}
            {preview && (
              <div className="preview-bar">
                <span className="small">
                  <b>{firstName}</b>’s app
                </span>
                <button className="btn small primary" onClick={() => setPreview(false)}>
                  Exit preview
                </button>
              </div>
            )}
            {mode === 'client' && <span className="who">{client.profile.name}</span>}
          </div>
          <nav className="tabs rail" aria-label="Sections">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                className={`tab ${coachView && i > 0 && t.global && !tabs[i - 1].global ? 'tab-sep' : ''}`}
                aria-current={t.id === active.id ? 'page' : undefined}
                onClick={() => go(t.id)}
              >
                {clientView && <Icon name={t.icon} size={18} />}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main key={`${client.id}-${active.id}-${clientView}`} className={clientView ? 'client-main' : 'coach-main'}>
        {coachView && client.isSample && (active.id === 'clients' || active.id === 'overview') && (
          <div className="banner info">
            <span className="grow">
              <b>Sample client</b> with made-up data. Import a client's workbook to start for real.
            </span>
            {active.id !== 'clients' && (
              <button className="btn primary small" onClick={() => go('clients')}>
                Add a client
              </button>
            )}
          </div>
        )}
        <Suspense fallback={<Loading />}>
          <Active />
        </Suspense>
      </main>

      <nav className={`bottom-nav cols-${bottom.length + (coachView ? 1 : 0)}`} aria-label="Sections">
        {bottom.map((t) => (
          <button key={t.id} className="tab" aria-current={t.id === active.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <Icon name={t.icon} />
            <span>{COACH_SHORT[t.id] ?? t.label}</span>
          </button>
        ))}
        {coachView && (
          <button className="tab" aria-current={inMore ? 'page' : undefined} aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}>
            <Icon name="menu" />
            <span>{inMore ? active.label : 'More'}</span>
          </button>
        )}
      </nav>

      {coachView && (
        <dialog
          ref={sheet}
          className="sheet"
          aria-label="All sections"
          onClick={(e) => {
            // A tap on the dimmed backdrop closes the sheet.
            if (e.target === e.currentTarget) sheet.current?.close();
          }}
        >
          <div className="sheet-body">
            <div className="sheet-head">
              <div>
                <div className="eyebrow">{client.profile.name || 'Unnamed client'}</div>
                <h2>Sections</h2>
              </div>
              <button className="icon-btn" aria-label="Close" onClick={() => sheet.current?.close()}>
                <Icon name="close" />
              </button>
            </div>
            <div className="sheet-grid">
              {COACH_TABS.filter((t) => !COACH_PRIMARY.includes(t.id) && !t.global).map((t) => (
                <button key={t.id} className="sheet-item" aria-current={t.id === active.id ? 'page' : undefined} onClick={() => go(t.id)}>
                  <Icon name={t.icon} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <div className="sheet-grid">
              {COACH_TABS.filter((t) => !COACH_PRIMARY.includes(t.id) && t.global).map((t) => (
                <button key={t.id} className="sheet-item" aria-current={t.id === active.id ? 'page' : undefined} onClick={() => go(t.id)}>
                  <Icon name={t.icon} />
                  <span>{t.label}</span>
                </button>
              ))}
              <button
                className="sheet-item"
                onClick={() => {
                  sheet.current?.close();
                  setPreview(true);
                }}
              >
                <Icon name="eye" />
                <span>Client view</span>
              </button>
            </div>
          </div>
        </dialog>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Ctx.Provider>
  );
}
