import { useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import type { Client } from '../types';
import { currentWeek, daysLogged, formatDate, isNum, latestWeight, localDate, mergeLibrary, num, summarizeWeek } from '../lib/calc';
import { blankClient } from '../lib/clients';
import { importFile } from '../lib/importer';
import { putPhoto } from '../lib/store';
import { weekFlags, weekToReview } from '../lib/review';
import { Sparkline } from '../components/charts';
import { ImportPackage } from '../components/exchange';
import { Block, Empty } from '../components/ui';

function ago(iso: string | undefined): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

type Status = { label: string; tone: 'warn' | 'good' | ''; week: number | null };
const ORDER = { warn: 0, '': 1, good: 2 } as const;

function status(c: Client, now: number): Status {
  const review = weekToReview(c, now);
  if (review) return { label: `Review week ${review}`, tone: 'warn', week: review };
  if (!daysLogged(c.checkIns[now]) && !daysLogged(c.checkIns[now - 1])) return { label: 'No recent check-ins', tone: '', week: null };
  return { label: 'Up to date', tone: 'good', week: null };
}

export function Clients() {
  const { data, update, notify, go } = useApp();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const xlsx = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      data.clients.map((c) => {
        const now = currentWeek(c.week1Date) ?? 1;
        const st = status(c, now);
        const flagWeek = st.week ?? (daysLogged(c.checkIns[now]) ? now : now - 1);
        const flags = weekFlags(c, flagWeek, data.foods).filter((f) => f.tone === 'warn');
        const series = Array.from({ length: Math.min(now, 12) }, (_, i) => {
          const s = summarizeWeek(c.checkIns[now - Math.min(now, 12) + i + 1]);
          return isNum(s.bw) ? s.bw : null;
        });
        return { c, now, st, flags, flagWeek, series, latest: latestWeight(c) };
      })
      .sort((a, b) => ORDER[a.st.tone] - ORDER[b.st.tone] || a.c.profile.name.localeCompare(b.c.profile.name)),
    [data.clients, data.foods],
  );
  const needReview = rows.filter((r) => r.st.tone === 'warn').length;

  const open = (id: string, tab: string) => {
    update((d) => void (d.activeClientId = id));
    go(tab);
  };

  const onXlsx = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(`Reading ${file.name}…`);
    try {
      const r = await importFile(file);
      for (const p of r.photos) {
        const key = `${r.client.id}/${p.week}/${p.pose}/i`;
        await putPhoto(key, new Blob([p.data as BlobPart], { type: p.type }));
        r.client.photos[`${p.week}-${p.pose}`] = key;
      }
      update((d) => {
        d.clients = d.clients.filter((c) => !c.isSample);
        d.clients.push(r.client);
        d.activeClientId = r.client.id;
        if (r.exercises.length) d.exercises = mergeLibrary(d.exercises, r.exercises);
        if (r.foods.length) d.foods = mergeLibrary(d.foods, r.foods);
      });
      notify(`Imported ${r.client.profile.name || 'client'}`);
      go('overview');
    } catch (e) {
      setError(`Couldn't read that workbook. Use the .xlsx from the coaching template (Google Sheets: File → Download → Microsoft Excel). ${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Coach</div>
          <h1>Clients</h1>
          <p>
            {data.clients.length} client{data.clients.length === 1 ? '' : 's'}
            {needReview ? ` · ${needReview} check-in${needReview === 1 ? '' : 's'} to review` : ' · nothing waiting'}
          </p>
        </div>
        <button className={`btn ${adding ? '' : 'primary'}`} onClick={() => setAdding((a) => !a)}>
          {adding ? 'Close' : 'Add or update a client'}
        </button>
      </div>

      {adding && (
        <div className="grid three">
          <section className="card stack" style={{ gap: 10 }}>
            <h3>Open a client's check-in file</h3>
            <p className="small ink2">The file a client sent from the app. Their logs are added; your plan and feedback stay as they are.</p>
            <ImportPackage
              data={data}
              apply={update}
              label="Open check-in file"
              onResult={(r) => {
                notify(r.added ? `Added ${r.clientName}` : `Updated ${r.clientName}: ${r.weeks} week${r.weeks === 1 ? '' : 's'} of check-ins`);
                setAdding(false);
                go('review');
              }}
            />
          </section>
          <section className="card stack" style={{ gap: 10 }}>
            <h3>Import a spreadsheet</h3>
            <p className="small ink2">A client workbook made from the coaching template (.xlsx), including photos.</p>
            <button className="btn" disabled={!!busy} onClick={() => xlsx.current?.click()}>
              {busy || 'Choose workbook…'}
            </button>
            <input ref={xlsx} type="file" hidden accept=".xlsx" onChange={(e) => { void onXlsx(e.target.files?.[0]); e.target.value = ''; }} />
            {error && <p className="small" role="alert" style={{ color: 'var(--bad)' }}>{error}</p>}
          </section>
          <section className="card stack" style={{ gap: 10 }}>
            <h3>Start a new client</h3>
            <p className="small ink2">Empty profile. Add their program and meal plan, then send them the plan file.</p>
            <button
              className="btn"
              onClick={() => {
                const c = blankClient();
                update((d) => {
                  d.clients = d.clients.filter((x) => !x.isSample);
                  d.clients.push(c);
                  d.activeClientId = c.id;
                });
                go('overview');
              }}
            >
              New client
            </button>
          </section>
        </div>
      )}

      {!rows.length ? (
        <Empty title="No clients yet" />
      ) : (
        <div className="grid two">
          {rows.map(({ c, now, st, flags, flagWeek, series, latest }) => (
            <section key={c.id} className="card stack client-card" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <h2>
                    {c.profile.name || 'Unnamed'}
                    {c.isSample && <span className="pill" style={{ marginLeft: 8, verticalAlign: 'middle' }}>sample</span>}
                  </h2>
                  <span className="small muted">
                    Week {now}
                    {c.timeline[now]?.phase ? ` · ${c.timeline[now].phase}` : ''}
                    {c.lastUpdateAt ? ` · update received ${ago(c.lastUpdateAt)}` : ''}
                  </span>
                </div>
                <span className={`pill ${st.tone}`}>{st.tone === 'good' ? '✓ ' : st.tone === 'warn' ? '● ' : ''}{st.label}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <div className="stack" style={{ gap: 0 }}>
                  <span className="small muted">Weight (weekly avg)</span>
                  <b className="num" style={{ fontSize: '1.3rem' }}>
                    {latest ? `${latest.kg.toFixed(1)} kg` : '—'}
                  </b>
                </div>
                <div className="stack" style={{ gap: 0 }}>
                  <span className="small muted">This week</span>
                  <b className="num">{daysLogged(c.checkIns[now])}/7 days</b>
                </div>
                <Sparkline values={series} width={110} height={34} ariaLabel={`${c.profile.name} weekly weight`} />
              </div>
              {flags.length > 0 ? (
                <div className="stack" style={{ gap: 2 }}>
                  <span className="small muted">Week {flagWeek} needs a look:</span>
                  <ul className="notes-list small">
                    {flags.slice(0, 3).map((f) => (
                      <li key={f.text}>{f.text}</li>
                    ))}
                    {flags.length > 3 && <li className="muted">and {flags.length - 3} more</li>}
                  </ul>
                </div>
              ) : (
                <span className="small muted">Nothing flagged for week {flagWeek}.</span>
              )}
              <div className="row">
                <button className={`btn small ${st.tone === 'warn' ? 'primary' : ''}`} onClick={() => open(c.id, 'review')}>
                  {st.week ? `Review week ${st.week}` : 'Weekly review'}
                </button>
                <button className="btn small" onClick={() => open(c.id, 'overview')}>
                  Open
                </button>
                {c.importedFrom && <span className="small muted">From {c.importedFrom}, {formatDate(localDate(c.importedAt))}</span>}
              </div>
            </section>
          ))}
        </div>
      )}

      <Block title="How coach and client stay in sync">
        <ol className="notes-list" style={{ maxWidth: '70ch' }}>
          <li>Set up the client's program, meal plan and weekly schedule, then use <b>Send plan to client</b> on their weekly review.</li>
          <li>The client opens that file on their phone (choose "I'm a client"). They log each day in about a minute.</li>
          <li>On check-in day they tap <b>Send my check-in</b> and share the file with you on WhatsApp or email.</li>
          <li>Here, choose <b>Add or update a client → Open check-in file</b>. Their week appears in the weekly review with anything worth a look flagged.</li>
          <li>Write feedback, adjust next week's targets, mark the week reviewed and send the plan back.</li>
        </ol>
        <p className="small muted">{num(data.clients.length)} client{data.clients.length === 1 ? '' : 's'} stored in this browser only.</p>
      </Block>
    </>
  );
}
