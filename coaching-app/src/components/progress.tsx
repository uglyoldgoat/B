import { useMemo } from 'react';
import type { Client } from '../types';
import { currentWeek, formatDate, isNum, lastLoggedWeek, num, weeklyRows } from '../lib/calc';
import { LineChart, Sparkline } from './charts';
import { signed } from './ui';

/** Weekly average bodyweight with the daily weigh-ins as faint dots. */
export function WeightChart({ client, weeks = 16 }: { client: Client; weeks?: number }) {
  const now = currentWeek(client.week1Date) ?? 1;
  const last = lastLoggedWeek(client);
  const end = Math.max(now, last, 1);
  const rows = useMemo(() => weeklyRows(client, end).filter((r) => r.week > end - weeks), [client, end, weeks]);
  const raw = rows.flatMap((r) =>
    (client.checkIns[r.week]?.days ?? []).flatMap((d, i) => (isNum(d.bw) ? [{ x: r.week - 0.5 + (i + 0.5) / 7, y: d.bw }] : [])),
  );
  if (!rows.some((r) => r.avgBw !== null)) return <p className="muted">No weigh-ins yet. Daily weights from the check-in appear here.</p>;
  return (
    <LineChart
      ariaLabel="Weekly average bodyweight"
      points={rows.map((r) => ({
        x: r.week,
        y: r.avgBw,
        tip: (
          <>
            Week {r.week} · {formatDate(r.date)}
            <br />
            Average <b>{r.avgBw === null ? 'no data' : `${num(r.avgBw, 1)} kg`}</b>
            {r.change !== null && <> ({signed(r.change, 1)})</>}
          </>
        ),
      }))}
      raw={raw}
      unit=" kg"
    />
  );
}

/** One tile per measurement site: latest value, change since the first reading. */
export function MeasurementTiles({ client }: { client: Client }) {
  const last = Math.max(lastLoggedWeek(client), 1);
  const measured = Array.from({ length: last }, (_, i) => client.checkIns[i + 1]?.measurements ?? {});
  return (
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
            <span className="delta flat">
              {vals.length > 1 ? `${signed(latest! - first!, 1, ' cm')} since week ${series.findIndex(isNum) + 1}` : vals.length ? 'One reading so far' : 'Not measured yet'}
            </span>
            <Sparkline values={series} ariaLabel={`${site} measurements by week`} width={140} />
          </div>
        );
      })}
    </div>
  );
}
