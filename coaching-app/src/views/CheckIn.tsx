import { useMemo, useState } from 'react';
import { useApp } from '../context';
import { CHECKIN_FIELDS, CHECKIN_SECTIONS, SUMMARY_QUESTIONS, type DayEntry, type FieldDef } from '../types';
import {
  addDays,
  currentWeek,
  daysLogged,
  emptyWeek,
  formatDate,
  formatHours,
  inferCycleDay,
  isNum,
  num,
  summarizeWeek,
  toISODate,
  weekStart,
  type SummaryValue,
} from '../lib/calc';
import { Block, Choice, NumInput, Scale, TextArea, TextInput, signed } from '../components/ui';

export function formatSummary(f: FieldDef, v: SummaryValue | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string') return v;
  switch (f.agg) {
    case 'avgHours':
      return formatHours(v);
    case 'countYes':
    case 'countText':
      return `${v} day${v === 1 ? '' : 's'}`;
    case 'countWorkouts':
      return `${v} workout${v === 1 ? '' : 's'}`;
    case 'countIrregular':
      return `${v} irregular`;
    case 'sum':
      return `${num(v)}${f.unit ? ` ${f.unit}` : ''}`;
    default:
      return `${num(v, f.agg === 'avg1' ? 1 : 0)}${f.unit ? ` ${f.unit}` : ''}`;
  }
}

function aggLabel(f: FieldDef): string {
  switch (f.agg) {
    case 'sum':
      return 'total';
    case 'countYes':
      return 'days “yes”';
    case 'countText':
      return 'days reported';
    case 'countWorkouts':
      return 'workouts';
    case 'countIrregular':
      return 'irregular days';
    case 'avgClock':
      return 'average time';
    default:
      return 'average';
  }
}

function FieldInput({
  f,
  value,
  onChange,
  compact,
  placeholder,
}: {
  f: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  compact?: boolean;
  placeholder?: string;
}) {
  const label = f.label;
  switch (f.type) {
    case 'number':
      return <NumInput ariaLabel={label} value={value as number | null} step={f.step} placeholder={placeholder} onChange={onChange} className={compact ? 'bare' : undefined} />;
    case 'scale5':
    case 'scale7': {
      const max = f.type === 'scale5' ? 5 : 7;
      if (compact) {
        return (
          <select className="bare" aria-label={label} value={isNum(value) ? String(value) : ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
            <option value="" />
            {Array.from({ length: max }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        );
      }
      return <Scale label={label} max={max} value={value as number | null} onChange={onChange} />;
    }
    case 'yesno':
    case 'regular': {
      const opts = f.type === 'yesno' ? ['Yes', 'No'] : ['Regular', 'Irregular'];
      if (compact) {
        return (
          <select className="bare" aria-label={label} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="" />
            {opts.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        );
      }
      return <Choice label={label} options={opts} value={value as string} onChange={onChange} />;
    }
    case 'time':
      return <input className={compact ? 'bare' : undefined} aria-label={label} type="time" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'longtext':
      return compact ? (
        <TextInput className="bare" ariaLabel={label} value={value as string} onChange={onChange} />
      ) : (
        <TextArea ariaLabel={label} value={value as string} onChange={onChange} />
      );
    default:
      return <TextInput className={compact ? 'bare' : undefined} ariaLabel={label} value={value as string} onChange={onChange} />;
  }
}

export function CheckIn() {
  const { client, updateClient } = useApp();
  const today = currentWeek(client.week1Date) ?? 1;
  const [week, setWeek] = useState(today);
  const [mode, setMode] = useState<'day' | 'week'>(() => (typeof window !== 'undefined' && window.innerWidth < 860 ? 'day' : 'week'));
  const start = weekStart(client.week1Date, week);
  const todayISO = toISODate(new Date());
  const todayIdx = Array.from({ length: 7 }, (_, i) => addDays(start, i)).indexOf(todayISO);
  const [day, setDay] = useState(todayIdx >= 0 ? todayIdx : 0);
  const wk = client.checkIns[week] ?? emptyWeek();
  const summary = useMemo(() => summarizeWeek(client.checkIns[week]), [client.checkIns, week]);
  const weeks = Math.max(52, today + 4);

  const ensureWeek = (c: typeof client) => {
    if (!c.checkIns[week]) c.checkIns[week] = emptyWeek();
    return c.checkIns[week];
  };
  const setDayValue = (d: number, key: keyof DayEntry, v: unknown) =>
    updateClient((c) => {
      const w = ensureWeek(c);
      const entry = w.days[d] as Record<string, unknown>;
      if (v === null || v === '' || v === undefined) delete entry[key];
      else entry[key] = v;
    });

  // Previous week with measurements, for the change column.
  const prevMeasured = useMemo(() => {
    for (let w = week - 1; w >= 1; w--) {
      const m = client.checkIns[w]?.measurements;
      if (m && Object.values(m).some(isNum)) return { week: w, m };
    }
    return null;
  }, [client.checkIns, week]);

  const hintFor = (f: FieldDef, d: number): string | undefined => {
    if (f.key !== 'cycleDay') return undefined;
    const n = inferCycleDay(client, week, d);
    return n === null ? undefined : String(n);
  };

  const sections = CHECKIN_SECTIONS.map((s) => ({ name: s, fields: CHECKIN_FIELDS.filter((f) => f.section === s) }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Daily check-in</div>
          <h1>Week {week}</h1>
          <p>
            {formatDate(start, { weekday: 'short', day: 'numeric', month: 'short' })} – {formatDate(addDays(start, 6), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}
            {daysLogged(client.checkIns[week])}/7 days logged
            {wk.complete && (
              <>
                {' · '}
                <span className="pill good">✓ Complete</span>
              </>
            )}
          </p>
        </div>
        <div className="week-nav">
          <button className="btn" aria-label="Previous week" disabled={week <= 1} onClick={() => setWeek((w) => w - 1)}>
            ‹
          </button>
          <label className="sr-only" htmlFor="ci-week">
            Week
          </label>
          <select id="ci-week" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Week {w} · {formatDate(weekStart(client.week1Date, w))}
                {w === today ? ' (this week)' : ''}
              </option>
            ))}
          </select>
          <button className="btn" aria-label="Next week" onClick={() => setWeek((w) => w + 1)}>
            ›
          </button>
          {week !== today && (
            <button className="btn ghost" onClick={() => setWeek(today)}>
              This week
            </button>
          )}
          <div className="seg" role="group" aria-label="Layout">
            <button aria-pressed={mode === 'day'} onClick={() => setMode('day')}>
              Day
            </button>
            <button aria-pressed={mode === 'week'} onClick={() => setMode('week')}>
              Week grid
            </button>
          </div>
        </div>
      </div>

      {mode === 'day' ? (
        <>
          <div className="day-chips" role="group" aria-label="Day">
            {wk.days.map((d, i) => {
              const iso = addDays(start, i);
              const filled = Object.values(d).some((v) => v !== undefined && v !== null && v !== '');
              return (
                <button
                  key={i}
                  className={`chip ${filled ? 'done' : ''} ${iso === todayISO ? 'today' : ''}`}
                  aria-pressed={day === i}
                  aria-label={`${formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long' })}${iso === todayISO ? ', today' : ''}${filled ? ', has entries' : ''}`}
                  onClick={() => setDay(i)}
                >
                  <span className="d">{formatDate(iso, { weekday: 'short' })}</span>
                  <span className="n">{formatDate(iso, { day: 'numeric' })}</span>
                </button>
              );
            })}
          </div>
          <div className="grid two" style={{ alignItems: 'start' }}>
            {sections.map((s) => (
              <section key={s.name} className="card stack" style={{ gap: 12 }}>
                <h3>{s.name}</h3>
                {s.fields.map((f) => {
                  const id = `ci-${f.key}`;
                  const wv = formatSummary(f, summary[f.key]);
                  return (
                    <div className="field" key={f.key}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <label className="lbl" htmlFor={id} style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--ink-2)' }}>
                          {f.label}
                          {f.unit ? <span className="muted"> ({f.unit})</span> : null}
                        </label>
                        {wv && (
                          <span className="small muted">
                            Week {aggLabel(f)}: <b className="num" style={{ color: 'var(--ink)' }}>{wv}</b>
                          </span>
                        )}
                      </div>
                      {f.hint && <span className="hint">{f.hint}</span>}
                      <div id={id}>
                        <FieldInput f={f} value={wk.days[day]?.[f.key]} placeholder={hintFor(f, day)} onChange={(v) => setDayValue(day, f.key, v)} />
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="table-wrap" style={{ maxHeight: '75vh' }}>
          <table className="grid-table">
            <thead>
              <tr>
                <th className="sticky" style={{ minWidth: 190 }}>
                  Metric
                </th>
                {wk.days.map((_, i) => {
                  const iso = addDays(start, i);
                  return (
                    <th key={i} style={{ minWidth: 92, color: iso === todayISO ? 'var(--accent)' : undefined }}>
                      {formatDate(iso, { weekday: 'short', day: 'numeric' })}
                    </th>
                  );
                })}
                <th className="n pin-right" style={{ minWidth: 100 }}>
                  Week
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => [
                <tr className="group" key={s.name}>
                  <td className="sticky">{s.name}</td>
                  <td colSpan={7} />
                  <td className="pin-right" />
                </tr>,
                ...s.fields.map((f) => (
                  <tr key={f.key}>
                    <td className="sticky small" title={f.hint}>
                      {f.label}
                      {f.unit ? <span className="muted"> ({f.unit})</span> : null}
                    </td>
                    {wk.days.map((d, i) => (
                      <td key={i}>
                        <FieldInput compact f={f} value={d[f.key]} placeholder={hintFor(f, i)} onChange={(v) => setDayValue(i, f.key, v)} />
                      </td>
                    ))}
                    <td className="n sum small pin-right" style={{ whiteSpace: 'nowrap' }}>{formatSummary(f, summary[f.key])}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid two" style={{ alignItems: 'start' }}>
        <Block title="Measurements" eyebrow="Once a week, in cm">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th className="n">This week</th>
                  <th className="n">{prevMeasured ? `vs week ${prevMeasured.week}` : 'Change'}</th>
                </tr>
              </thead>
              <tbody>
                {client.measurementSites.map((site) => {
                  const v = wk.measurements[site];
                  const pv = prevMeasured?.m[site];
                  const ch = isNum(v) && isNum(pv) ? v - pv : null;
                  return (
                    <tr key={site}>
                      <td>{site}</td>
                      <td className="n" style={{ width: 120 }}>
                        <NumInput
                          ariaLabel={`${site} (cm)`}
                          value={v}
                          step={0.1}
                          onChange={(n) =>
                            updateClient((c) => {
                              const w = ensureWeek(c);
                              if (n === null) delete w.measurements[site];
                              else w.measurements[site] = n;
                            })
                          }
                        />
                      </td>
                      <td className="n num">{ch === null ? '' : signed(ch, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Block>

        <Block title="Weekly summary" eyebrow="Answer on check-in day">
          <div className="stack" style={{ gap: 12 }}>
            {SUMMARY_QUESTIONS.map((q) => (
              <div className="field" key={q.key}>
                <label className="lbl" htmlFor={`sq-${q.key}`}>
                  {q.label}
                </label>
                <TextArea
                  id={`sq-${q.key}`}
                  value={wk.summary[q.key]}
                  onChange={(v) =>
                    updateClient((c) => {
                      ensureWeek(c).summary[q.key] = v;
                    })
                  }
                />
              </div>
            ))}
            <div className="field">
              <label className="lbl" htmlFor="sq-coach">
                Coach feedback
              </label>
              <TextArea
                id="sq-coach"
                rows={3}
                placeholder="Notes and changes for next week"
                value={wk.coachFeedback}
                onChange={(v) =>
                  updateClient((c) => {
                    ensureWeek(c).coachFeedback = v;
                  })
                }
              />
            </div>
            <label className="row" style={{ fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={wk.complete}
                onChange={(e) =>
                  updateClient((c) => {
                    ensureWeek(c).complete = e.target.checked;
                  })
                }
              />
              Check-in complete
            </label>
          </div>
        </Block>
      </div>
    </>
  );
}
