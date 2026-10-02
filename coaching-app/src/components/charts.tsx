import { useEffect, useRef, useState, type ReactNode } from 'react';

function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

/** Round axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/** Label every `step`-th tick plus the last one, skipping a tick that would crowd the last. */
function showTick(i: number, n: number, step: number): boolean {
  if (i === n - 1) return true;
  return i % step === 0 && n - 1 - i >= Math.ceil(step * 0.75);
}

const fmt = (n: number, d = 1) => n.toLocaleString(undefined, { maximumFractionDigits: d });

export interface LinePoint {
  x: number;
  y: number | null;
  tip?: ReactNode;
}

/** Single-series line with optional faint raw points (e.g. daily weights). */
export function LineChart({
  points,
  raw = [],
  height = 220,
  xLabel = (x) => `W${x}`,
  yDigits = 1,
  unit = '',
  reference,
  ariaLabel,
}: {
  points: LinePoint[];
  raw?: { x: number; y: number }[];
  height?: number;
  xLabel?: (x: number) => string;
  yDigits?: number;
  unit?: string;
  reference?: { y: number; label: string } | null;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const valid = points.filter((p) => p.y !== null) as { x: number; y: number; tip?: ReactNode }[];
  const ys = [...valid.map((p) => p.y), ...raw.map((p) => p.y), ...(reference ? [reference.y] : [])];
  if (!points.length || !ys.length) return <div className="chart" ref={ref} />;
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const xs = points.map((p) => p.x);
  // Raw points spread across each week, so leave half a week of room on both sides.
  const pad = raw.length ? 0.5 : 0;
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs, x0 + 1) + pad;
  const m = { l: 44, r: 52, t: 12, b: 26 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const sx = (x: number) => m.l + ((x - x0) / (x1 - x0)) * iw;
  const sy = (y: number) => m.t + ih - ((y - y0) / (y1 - y0 || 1)) * ih;

  // Break the line (and its area) where a week has no value.
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push({ x: p.x, y: p.y });
  }
  if (run.length) runs.push(run);
  const segments = runs.map((r) => r.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(''));
  const areas = runs
    .filter((r) => r.length > 1)
    .map((r) => `M${sx(r[0].x)},${sy(y0)}` + r.map((p) => `L${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('') + `L${sx(r[r.length - 1].x)},${sy(y0)}Z`);
  const last = valid[valid.length - 1];
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 48))));
  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = e.clientX - box.left;
          let best = 0;
          let bd = Infinity;
          points.forEach((p, i) => {
            const d = Math.abs(sx(p.x) - x);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          setHover(best);
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} />
            <text x={m.l - 8} y={sy(t) + 4} textAnchor="end">
              {fmt(t, yDigits)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          showTick(i, points.length, step) ? (
            <text key={p.x} x={sx(p.x)} y={height - 6} textAnchor="middle">
              {xLabel(p.x)}
            </text>
          ) : null,
        )}
        {reference && (
          <g>
            <line className="ref-line" x1={m.l} x2={m.l + iw} y1={sy(reference.y)} y2={sy(reference.y)} />
            <text className="ref-label" x={m.l + iw + 4} y={sy(reference.y) + 4}>
              {reference.label}
            </text>
          </g>
        )}
        {areas.map((d, i) => (
          <path key={i} d={d} fill="var(--series-1)" fillOpacity={0.1} stroke="none" />
        ))}
        {raw.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill="var(--series-1)" fillOpacity={0.3} />
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {valid.map((p) => (
          <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={3} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={1.5} />
        ))}
        {last && (
          <g>
            <circle cx={sx(last.x)} cy={sy(last.y)} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
            {!reference && (
              <text className="end-label" x={sx(last.x) + 9} y={sy(last.y) + 4}>
                {fmt(last.y, yDigits)}
                {unit}
              </text>
            )}
          </g>
        )}
        {hp && (
          <line className="axis-line" x1={sx(hp.x)} x2={sx(hp.x)} y1={m.t} y2={m.t + ih} />
        )}
        {hp && hp.y !== null && <circle cx={sx(hp.x)} cy={sy(hp.y)} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />}
      </svg>
      {hp && (
        <div className="tooltip" style={{ left: sx(hp.x), top: hp.y !== null ? sy(hp.y) : m.t + ih / 2 }}>
          {hp.tip ?? (
            <>
              {xLabel(hp.x)}: <b>{hp.y === null ? 'no data' : `${fmt(hp.y, yDigits)}${unit}`}</b>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Weekly columns against a target line. */
export function ColumnChart({
  data,
  target,
  height = 200,
  xLabel = (x) => `W${x}`,
  unit = '',
  ariaLabel,
}: {
  data: { x: number; y: number | null; target?: number | null }[];
  target?: string;
  height?: number;
  xLabel?: (x: number) => string;
  unit?: string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const vals = data.flatMap((d) => [d.y ?? 0, d.target ?? 0]);
  if (!data.length) return <div className="chart" ref={ref} />;
  const ticks = niceTicks(0, Math.max(1, ...vals), 4);
  const top = ticks[ticks.length - 1];
  const m = { l: 48, r: 12, t: 12, b: 26 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const band = iw / data.length;
  const bw = Math.min(24, Math.max(4, band - 6));
  const sy = (y: number) => m.t + ih - (y / top) * ih;
  const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 40))));
  const hd = hover !== null ? data[hover] : null;
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} />
            <text x={m.l - 8} y={sy(t) + 4} textAnchor="end">
              {fmt(t, 0)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = m.l + band * i + band / 2;
          const h = d.y ? sy(0) - sy(d.y) : 0;
          const r = Math.min(4, h, bw / 2);
          const x = cx - bw / 2;
          const yTop = sy(0) - h;
          return (
            <g key={d.x} onMouseEnter={() => setHover(i)}>
              <rect x={m.l + band * i} y={m.t} width={band} height={ih} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${sy(0)}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + bw - r}Q${x + bw},${yTop} ${x + bw},${yTop + r}V${sy(0)}Z`}
                  fill="var(--series-1)"
                  fillOpacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {d.target ? <line x1={cx - band / 2 + 2} x2={cx + band / 2 - 2} y1={sy(d.target)} y2={sy(d.target)} stroke="var(--ink)" strokeWidth={2} /> : null}
              {showTick(i, data.length, step) && (
                <text x={cx} y={height - 6} textAnchor="middle">
                  {xLabel(d.x)}
                </text>
              )}
            </g>
          );
        })}
        <line className="axis-line" x1={m.l} x2={m.l + iw} y1={sy(0)} y2={sy(0)} />
      </svg>
      {hd && (
        <div className="tooltip" style={{ left: m.l + band * (hover ?? 0) + band / 2, top: hd.y ? sy(hd.y) : sy(0) }}>
          {xLabel(hd.x)}: <b>{hd.y === null ? 'no data' : `${fmt(hd.y, 0)}${unit}`}</b>
          {hd.target ? (
            <>
              <br />
              {target ?? 'Target'}: <b>{fmt(hd.target, 0)}{unit}</b>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars with the value at the tip. */
export function BarList({ rows, unit = '', max }: { rows: { label: string; value: number; note?: string }[]; unit?: string; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="stack" role="list" style={{ gap: 6 }}>
      {rows.map((r) => (
        <div key={r.label} role="listitem" style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 140px) minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
          <span className="small ink2" style={{ overflowWrap: 'anywhere' }}>
            {r.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                height: 16,
                width: `${Math.max(2, (r.value / top) * 85)}%`,
                background: 'var(--series-1)',
                borderRadius: '0 4px 4px 0',
              }}
            />
            <span className="small num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
              {fmt(r.value, 1)}
              {unit}
              {r.note && <span className="muted"> {r.note}</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 32, ariaLabel }: { values: (number | null)[]; width?: number; height?: number; ariaLabel: string }) {
  const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v !== null) as { i: number; v: number }[];
  if (pts.length < 2) return <svg width={width} height={height} role="img" aria-label={ariaLabel} />;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const pad = 4;
  const sx = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
  const sy = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / (max - min || 1));
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${sx(p.i).toFixed(1)},${sy(p.v).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block', maxWidth: '100%' }}>
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last.i)} cy={sy(last.v)} r={3.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}

/** Calorie share of protein, carbohydrate and fat. */
export function MacroBar({ pro, cho, fat }: { pro: number; cho: number; fat: number }) {
  const p = pro * 4;
  const c = cho * 4;
  const f = fat * 9;
  const total = p + c + f || 1;
  const parts = [
    { label: 'Protein', kcal: p, g: pro, color: 'var(--series-1)' },
    { label: 'Carbs', kcal: c, g: cho, color: 'var(--series-2)' },
    { label: 'Fat', kcal: f, g: fat, color: 'var(--series-3)' },
  ];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="macro-bar" role="img" aria-label={parts.map((x) => `${x.label} ${Math.round((x.kcal / total) * 100)}%`).join(', ')}>
        {parts.map((x) => (x.kcal > 0 ? <span key={x.label} style={{ width: `${(x.kcal / total) * 100}%`, background: x.color }} /> : null))}
      </div>
      <div className="legend">
        {parts.map((x) => (
          <span key={x.label}>
            <span className="key" style={{ background: x.color }} />
            {x.label} <b className="num">{fmt(x.g, 0)} g</b> <span className="muted">{Math.round((x.kcal / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
