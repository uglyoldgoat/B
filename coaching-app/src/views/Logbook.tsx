import { useMemo, useState } from 'react';
import { useApp } from '../context';
import type { LoggedSet } from '../types';
import { hasSets, isNum, letter, num, setStats } from '../lib/calc';
import { Empty, NumInput, Picker } from '../components/ui';
import { Sparkline } from '../components/charts';

function weeksLogged(logs: LoggedSet[][] | undefined): number {
  if (!logs) return 0;
  let n = 0;
  logs.forEach((w, i) => {
    if (hasSets(w)) n = i + 1;
  });
  return n;
}

export function Logbook() {
  const { client, updateClient } = useApp();
  const [dayIdx, setDayIdx] = useState(0);
  const day = client.program[dayIdx] ?? client.program[0];
  const latest = useMemo(() => (day ? Math.max(0, ...day.exercises.map((e) => weeksLogged(client.logbook[e.id]))) : 0), [day, client.logbook]);
  const [week, setWeek] = useState(Math.max(1, latest));
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  if (!client.program.length) {
    return (
      <Empty title="No training program yet">
        <p>Add training days on the Training tab, then log sets here.</p>
      </Empty>
    );
  }

  const setSet = (exId: string, w: number, s: number, key: 'kg' | 'reps', v: number | null) =>
    updateClient((c) => {
      const logs = (c.logbook[exId] ??= []);
      while (logs.length < w) logs.push([]);
      const sets = logs[w - 1];
      while (sets.length <= s) sets.push({ kg: null, reps: null });
      sets[s][key] = v;
    });

  const totalWeeks = Math.max(12, latest + 1, week);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Progressive overload</div>
          <h1>Logbook</h1>
          <p>Weight and reps for each working set, one column per session. The previous session's numbers show in grey as the number to beat.</p>
        </div>
        <div className="week-nav">
          <button className="btn" aria-label="Previous session" disabled={week <= 1} onClick={() => setWeek((w) => w - 1)}>
            ‹
          </button>
          <label className="sr-only" htmlFor="lb-week">
            Session
          </label>
          <select id="lb-week" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Session {w}
                {w <= latest ? ' · logged' : ''}
              </option>
            ))}
          </select>
          <button className="btn" aria-label="Next session" onClick={() => setWeek((w) => w + 1)}>
            ›
          </button>
        </div>
      </div>

      <Picker
        label="Training day"
        value={client.program[dayIdx]?.id ?? ''}
        options={client.program.map((d) => ({ id: d.id, label: d.title }))}
        onChange={(id) => {
          const i = client.program.findIndex((d) => d.id === id);
          const d = client.program[i];
          if (!d) return;
          setDayIdx(i);
          const l = Math.max(0, ...d.exercises.map((e) => weeksLogged(client.logbook[e.id])));
          setWeek(Math.max(1, l));
        }}
      />

      <div className="stack" style={{ gap: 12 }}>
        {day.exercises.map((ex, ei) => {
          const logs = client.logbook[ex.id] ?? [];
          const cur = logs[week - 1] ?? [];
          const prev = logs[week - 2] ?? [];
          const count = Math.max(4, ex.sets ?? 0, cur.length);
          const stats = setStats(cur);
          const prevStats = setStats(prev);
          const e1rms = logs.map((w) => setStats(w).bestE1rm);
          const n = weeksLogged(logs);
          const open = historyFor === ex.id;
          return (
            <section key={ex.id} className="card stack" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="row" style={{ alignItems: 'baseline', flexWrap: 'nowrap', minWidth: 0 }}>
                  <span className="idx" style={{ fontSize: '1.2rem' }}>
                    {letter(ei)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b>{ex.name || 'Unnamed exercise'}</b>
                    <div className="small muted">
                      {isNum(ex.sets) ? ex.sets : '–'} × {ex.reps || '–'}
                      {ex.rir && ` · RIR ${ex.rir}`}
                      {ex.tempo && ` · tempo ${ex.tempo}`}
                      {ex.rest && ` · rest ${ex.rest}`}
                    </div>
                  </div>
                </div>
                {n > 1 && (
                  <div className="row small muted" style={{ flexWrap: 'nowrap' }}>
                    <span>Est. 1RM</span>
                    <Sparkline values={e1rms} width={96} height={28} ariaLabel={`${ex.name} estimated one-rep max by week`} />
                  </div>
                )}
              </div>
              <div className="sets">
                {Array.from({ length: count }, (_, s) => (
                  <div className="set" key={s}>
                    <span className="t">Set {s + 1}</span>
                    <NumInput
                      ariaLabel={`Set ${s + 1} kg`}
                      value={cur[s]?.kg}
                      step={0.5}
                      placeholder={isNum(prev[s]?.kg) ? `${prev[s].kg}` : 'kg'}
                      onChange={(v) => setSet(ex.id, week, s, 'kg', v)}
                    />
                    <NumInput
                      ariaLabel={`Set ${s + 1} reps`}
                      value={cur[s]?.reps}
                      step={1}
                      placeholder={isNum(prev[s]?.reps) ? `${prev[s].reps}` : 'reps'}
                      onChange={(v) => setSet(ex.id, week, s, 'reps', v)}
                    />
                  </div>
                ))}
              </div>
              <div className="row small" style={{ justifyContent: 'space-between' }}>
                <span className="muted">
                  {stats.sets ? (
                    <>
                      Volume <b className="num" style={{ color: 'var(--ink)' }}>{num(stats.volume)} kg</b>
                      {prevStats.sets > 0 && (
                        <span className={`delta ${stats.volume > prevStats.volume ? 'good' : stats.volume < prevStats.volume ? 'bad' : 'flat'}`}>
                          {' '}
                          ({stats.volume >= prevStats.volume ? '+' : '−'}
                          {num(Math.abs(stats.volume - prevStats.volume))} vs previous session)
                        </span>
                      )}
                      {' · '}top set <b className="num" style={{ color: 'var(--ink)' }}>{num(stats.topKg, 1)} kg</b>
                    </>
                  ) : prevStats.sets ? (
                    <>Previous session: volume {num(prevStats.volume)} kg, top set {num(prevStats.topKg, 1)} kg</>
                  ) : (
                    'No sets logged in this session'
                  )}
                </span>
                {n > 0 && (
                  <button className="btn ghost small" onClick={() => setHistoryFor(open ? null : ex.id)}>
                    {open ? 'Hide history' : `History (${n} session${n === 1 ? '' : 's'})`}
                  </button>
                )}
              </div>
              {open && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Session</th>
                        {Array.from({ length: Math.max(4, ...logs.map((w) => w.length)) }, (_, s) => (
                          <th key={s}>Set {s + 1}</th>
                        ))}
                        <th className="n">Volume</th>
                        <th className="n">Est. 1RM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((w, i) => {
                        const st = setStats(w);
                        return (
                          <tr key={i} className={i + 1 === week ? 'current' : undefined}>
                            <td>{i + 1}</td>
                            {Array.from({ length: Math.max(4, ...logs.map((x) => x.length)) }, (_, s) => (
                              <td key={s} className="num small" style={{ whiteSpace: 'nowrap' }}>
                                {isNum(w[s]?.kg) || isNum(w[s]?.reps) ? `${num(w[s]?.kg, 1) || '–'} × ${num(w[s]?.reps) || '–'}` : ''}
                              </td>
                            ))}
                            <td className="n num">{st.sets ? num(st.volume) : ''}</td>
                            <td className="n num">{st.bestE1rm !== null ? num(st.bestE1rm, 1) : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
