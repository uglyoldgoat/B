import { useMemo } from 'react';
import { useApp } from '../context';
import { PHASES, type TimelineWeek } from '../types';
import { currentWeek, formatDate, isNum, lastLoggedWeek, num, weeklyRows } from '../lib/calc';
import { Block, NumInput, Select, TextInput, signed } from '../components/ui';
import { ColumnChart, LineChart, Sparkline } from '../components/charts';

const BLANK: TimelineWeek = {
  phase: '',
  intakeHigh: null,
  intakeMed: null,
  intakeLow: null,
  cardio: '',
  steps: null,
  training: '',
  supplements: '',
  goals: '',
  notes: '',
};

export function Timeline() {
  const { client, updateClient } = useApp();
  const now = currentWeek(client.week1Date) ?? 1;
  const last = lastLoggedWeek(client);
  const total = Math.max(52, now, last, ...Object.keys(client.timeline).map(Number));
  const rows = useMemo(() => weeklyRows(client, total), [client, total]);
  const shown = rows.filter((r) => r.week <= Math.max(last, now));
  const setT = <K extends keyof TimelineWeek>(week: number, k: K, v: TimelineWeek[K]) =>
    updateClient((c) => {
      if (!c.timeline[week]) c.timeline[week] = { ...BLANK };
      c.timeline[week][k] = v;
    });

  const measured = Array.from({ length: Math.max(last, 1) }, (_, i) => client.checkIns[i + 1]?.measurements ?? {});

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Week-by-week</div>
          <h1>Timeline</h1>
          <p>Averages come from the daily check-ins. Phases and targets are set by the coach.</p>
        </div>
      </div>

      <div className="grid two">
        <Block title="Average bodyweight">
          {shown.some((r) => r.avgBw !== null) ? (
            <LineChart
              ariaLabel="Average bodyweight by week"
              points={shown.map((r) => ({
                x: r.week,
                y: r.avgBw,
                tip: (
                  <>
                    Week {r.week} · {client.timeline[r.week]?.phase || 'No phase'}
                    <br />
                    <b>{r.avgBw === null ? 'no data' : `${num(r.avgBw, 1)} kg`}</b>
                    {r.change !== null && <> ({signed(r.change, 1)})</>}
                  </>
                ),
              }))}
              unit=" kg"
            />
          ) : (
            <p className="muted">No weigh-ins yet.</p>
          )}
        </Block>
        <Block title="Average daily steps" eyebrow="Bars: average · line: target">
          {shown.some((r) => r.steps !== null) ? (
            <ColumnChart
              ariaLabel="Average daily steps by week against target"
              data={shown.map((r) => ({ x: r.week, y: r.steps, target: client.timeline[r.week]?.steps ?? client.profile.stepsTarget }))}
              target="Target"
            />
          ) : (
            <p className="muted">No steps logged yet.</p>
          )}
        </Block>
      </div>

      <Block title="Measurements" eyebrow="Change since the first measurement">
        <div className="spark-tiles">
          {client.measurementSites.map((site) => {
            const series = measured.map((m) => (isNum(m[site]) ? m[site] : null));
            const vals = series.filter(isNum);
            const first = vals[0];
            const latest = vals[vals.length - 1];
            return (
              <div className="stat" key={site}>
                <span className="label">{site}</span>
                <span className="value" style={{ fontSize: '1.3rem' }}>
                  {isNum(latest) ? num(latest, 1) : '—'}
                  {isNum(latest) && <small>cm</small>}
                </span>
                <span className="delta flat">{vals.length > 1 ? `${signed(latest! - first!, 1, ' cm')} since week ${series.findIndex(isNum) + 1}` : 'One reading so far'}</span>
                <Sparkline values={series} ariaLabel={`${site} measurements by week`} width={140} />
              </div>
            );
          })}
        </div>
      </Block>

      <Block title="Weekly plan & results">
        <div className="table-wrap" style={{ maxHeight: '70vh' }}>
          <table className="grid-table">
            <thead>
              <tr>
                <th className="sticky">Week</th>
                <th>Starts</th>
                <th style={{ minWidth: 150 }}>Phase</th>
                <th className="n">Avg BW</th>
                <th className="n">Change</th>
                <th className="n">kcal</th>
                <th className="n">Cardio</th>
                <th className="n">Steps</th>
                <th className="n">Target high</th>
                <th className="n">Target med</th>
                <th className="n">Target low</th>
                <th style={{ minWidth: 180 }}>Cardio target</th>
                <th className="n">Steps target</th>
                <th style={{ minWidth: 160 }}>Training</th>
                <th style={{ minWidth: 140 }}>Supplements</th>
                <th style={{ minWidth: 160 }}>Goals</th>
                <th style={{ minWidth: 180 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = client.timeline[r.week] ?? BLANK;
                return (
                  <tr key={r.week} className={r.week === now ? 'current' : undefined}>
                    <td className="sticky n" style={{ fontWeight: 600 }}>
                      {r.week}
                    </td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(r.date)}
                    </td>
                    <td>
                      <Select className="bare" ariaLabel={`Week ${r.week} phase`} value={t.phase} options={PHASES} onChange={(v) => setT(r.week, 'phase', v)} />
                    </td>
                    <td className="n num">{r.avgBw !== null ? num(r.avgBw, 1) : ''}</td>
                    <td className="n num">{r.change !== null ? signed(r.change, 1) : ''}</td>
                    <td className="n num">{num(r.kcal)}</td>
                    <td className="n num">{r.cardio !== null ? `${num(r.cardio)} min` : ''}</td>
                    <td className="n num">{num(r.steps)}</td>
                    {(['intakeHigh', 'intakeMed', 'intakeLow'] as const).map((k) => (
                      <td key={k} style={{ width: 90 }}>
                        <NumInput className="bare" ariaLabel={`Week ${r.week} ${k}`} value={t[k]} onChange={(v) => setT(r.week, k, v)} />
                      </td>
                    ))}
                    <td>
                      <TextInput className="bare" ariaLabel={`Week ${r.week} cardio target`} value={t.cardio} onChange={(v) => setT(r.week, 'cardio', v)} />
                    </td>
                    <td style={{ width: 90 }}>
                      <NumInput className="bare" ariaLabel={`Week ${r.week} steps target`} value={t.steps} onChange={(v) => setT(r.week, 'steps', v)} />
                    </td>
                    {(['training', 'supplements', 'goals', 'notes'] as const).map((k) => (
                      <td key={k}>
                        <TextInput className="bare" ariaLabel={`Week ${r.week} ${k}`} value={t[k]} onChange={(v) => setT(r.week, k, v)} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Block>
    </>
  );
}
