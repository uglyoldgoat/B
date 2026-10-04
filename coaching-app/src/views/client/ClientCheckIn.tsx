import { useState } from 'react';
import { useApp } from '../../context';
import { CHECKIN_FIELDS, SUMMARY_QUESTIONS, WEEKDAYS, type DayEntry, type FieldDef } from '../../types';
import { addDays, emptyWeek, formatDate, inferCycleDay, localDate, todayPosition, weekStart } from '../../lib/calc';
import { BRISTOL_WORDS, CLIENT_HELP, DAILY_ESSENTIALS, SCALE_WORDS } from '../../lib/explain';
import { shortDayTitle } from '../../lib/schedule';
import { Choice, NumInput, Scale, TextArea, TextInput } from '../../components/ui';
import { SendPackage } from '../../components/exchange';

const FIELD = new Map(CHECKIN_FIELDS.map((f) => [f.key, f]));

/** Friendlier labels for the client than the spreadsheet's. */
const CLIENT_LABEL: Partial<Record<keyof DayEntry, string>> = {
  bw: 'Morning weight',
  sleepHrs: 'Hours of sleep',
  adherence: 'How well did you follow the meal plan?',
  energy: 'Energy',
  stress: 'Stress',
  hunger: 'Hunger',
  sleepQuality: 'How well did you sleep?',
  kcal: 'Calories (if you track them)',
  session: 'Workout today',
  doms: 'Sore muscles?',
  illness: 'Feeling ill?',
  cardioMin: 'Cardio',
  pro: 'Protein',
  cho: 'Carbs',
  fat: 'Fat',
};

const EXTRA_GROUPS: { title: string; keys: (keyof DayEntry)[] }[] = [
  { title: 'Training & cardio', keys: ['cardioMin', 'doms', 'trainingNotes'] },
  { title: 'Food details', keys: ['kcal', 'pro', 'cho', 'fat', 'fibre', 'cravings', 'nutritionNotes'] },
  { title: 'Cycle & health', keys: ['cycleDay', 'pms', 'illness'] },
  { title: 'Digestion', keys: ['stools', 'stoolRegular', 'bristol', 'digestion'] },
  { title: 'Sleep times', keys: ['bedTime', 'wakeTime', 'weighTime'] },
  { title: 'Watch & health readings', keys: ['hrv', 'hrvReadiness', 'rhr', 'bp', 'glucose'] },
];

export function ClientCheckIn() {
  const { client, updateClient, notify, preview } = useApp();
  const today = todayPosition(client.week1Date);
  const [week, setWeek] = useState(today.week);
  const [day, setDay] = useState(today.day);
  const start = weekStart(client.week1Date, week);
  const wk = client.checkIns[week] ?? emptyWeek();
  const entry = wk.days[day] ?? {};
  const iso = addDays(start, day);
  const isToday = iso === today.iso;
  const future = iso > today.iso;
  const sessionOptions = [...client.program.map((d) => shortDayTitle(d.title)), 'Rest day'];

  const ensure = (c: typeof client) => (c.checkIns[week] ??= emptyWeek());
  const set = (key: keyof DayEntry, v: unknown) =>
    updateClient((c) => {
      const e = ensure(c).days[day] as Record<string, unknown>;
      if (v === null || v === '' || v === undefined) delete e[key];
      else e[key] = v;
    });

  const row = (key: keyof DayEntry) => {
    const f = FIELD.get(key) as FieldDef;
    const id = `cc-${key}`;
    const words = SCALE_WORDS[key];
    const value = entry[key];
    let input;
    if (key === 'session') {
      input = <Choice big label="Workout today" options={sessionOptions} value={value as string} onChange={(v) => set(key, v)} />;
    } else if (f.type === 'scale5') {
      input = <Scale big label={f.label} max={5} value={value as number} words={words} onChange={(v) => set(key, v)} />;
    } else if (key === 'sleepQuality') {
      input = <Scale big label={f.label} max={5} value={value as number} words={words} onChange={(v) => set(key, v)} />;
    } else if (f.type === 'scale7') {
      input = <Scale big label={f.label} max={7} value={value as number} words={BRISTOL_WORDS} onChange={(v) => set(key, v)} />;
    } else if (f.type === 'yesno') {
      input = <Choice big label={f.label} options={['Yes', 'No']} value={value as string} onChange={(v) => set(key, v)} />;
    } else if (f.type === 'regular') {
      input = <Choice big label={f.label} options={['Regular', 'Irregular']} value={value as string} onChange={(v) => set(key, v)} />;
    } else if (f.type === 'number') {
      const placeholder = key === 'cycleDay' ? (inferCycleDay(client, week, day)?.toString() ?? '') : '';
      input = (
        <div className="unit-input">
          <NumInput id={id} value={value as number} step={f.step} placeholder={placeholder} onChange={(v) => set(key, v)} />
          {f.unit && <span>{f.unit}</span>}
        </div>
      );
    } else if (f.type === 'time') {
      input = <input id={id} type="time" value={(value as string) ?? ''} onChange={(e) => set(key, e.target.value)} />;
    } else if (f.type === 'longtext') {
      input = <TextArea id={id} value={value as string} onChange={(v) => set(key, v)} />;
    } else {
      input = <TextInput id={id} value={value as string} onChange={(v) => set(key, v)} />;
    }
    return (
      <div className="cfield" key={key}>
        <label className="cfield-label" htmlFor={id}>
          {CLIENT_LABEL[key] ?? f.label}
        </label>
        {CLIENT_HELP[key] && <span className="cfield-help">{CLIENT_HELP[key]}</span>}
        {input}
      </div>
    );
  };

  const extrasFilled = EXTRA_GROUPS.flatMap((g) => g.keys).filter((k) => entry[k] !== undefined && entry[k] !== '').length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Week {week}</div>
          <h1>{isToday ? 'How was today?' : `How was ${formatDate(iso, { weekday: 'long' })}?`}</h1>
          <p>{formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long' })}. Everything saves as you type.</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" aria-label="Previous week" disabled={week <= 1} onClick={() => setWeek((w) => w - 1)}>
            ‹ Week {week - 1 || ''}
          </button>
          {week < today.week && (
            <button className="btn" aria-label="Next week" onClick={() => setWeek((w) => w + 1)}>
              Week {week + 1} ›
            </button>
          )}
        </div>
      </div>

      <div className="day-chips" role="group" aria-label="Day">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(start, i);
          const filled = Object.values(wk.days[i] ?? {}).some((v) => v !== undefined && v !== null && v !== '');
          return (
            <button
              key={i}
              className={`chip ${filled ? 'done' : ''} ${d === today.iso ? 'today' : ''}`}
              aria-pressed={day === i}
              aria-label={`${formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}${d === today.iso ? ', today' : ''}${filled ? ', has entries' : ''}`}
              onClick={() => setDay(i)}
            >
              <span className="d">{formatDate(d, { weekday: 'narrow' })}</span>
              <span className="n">{formatDate(d, { day: 'numeric' })}</span>
            </button>
          );
        })}
      </div>

      {future ? (
        <p className="muted">This day hasn't happened yet. Pick today or an earlier day.</p>
      ) : (
        <>
          <section className="card stack" style={{ gap: 18 }}>
            <h2>Every day</h2>
            {DAILY_ESSENTIALS.map(row)}
            {client.program.length > 0 && row('session')}
          </section>

          <details className="card">
            <summary>
              <b style={{ color: 'var(--ink)' }}>More details</b> <span className="muted">(optional{extrasFilled ? `, ${extrasFilled} filled in` : ''})</span>
            </summary>
            <div className="stack" style={{ gap: 18, marginTop: 12 }}>
              {EXTRA_GROUPS.map((g) => (
                <div key={g.title} className="stack" style={{ gap: 14 }}>
                  <h3>{g.title}</h3>
                  {g.keys.map(row)}
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      <section className={`card stack ${client.profile.checkInDay === WEEKDAYS[(new Date().getDay() + 6) % 7] ? 'highlight' : ''}`} style={{ gap: 14 }}>
        <div>
          <h2>Weekly check-in</h2>
          <p className="small ink2">
            Once a week{client.profile.checkInDay ? `, on ${client.profile.checkInDay}` : ''}: measurements, the questions below, then send it to your coach.
          </p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <h3>Measurements (cm)</h3>
          <p className="small ink2">Measure in the morning at the same spot each week, standing relaxed. Tape snug, not tight.</p>
          <div className="measure-grid">
            {client.measurementSites.map((site) => (
              <label key={site} className="field">
                <span className="lbl">{site}</span>
                <NumInput
                  value={wk.measurements[site]}
                  step={0.1}
                  onChange={(n) =>
                    updateClient((c) => {
                      const w = ensure(c);
                      if (n === null) delete w.measurements[site];
                      else w.measurements[site] = n;
                    })
                  }
                />
              </label>
            ))}
          </div>
        </div>
        {SUMMARY_QUESTIONS.map((q) => (
          <div className="cfield" key={q.key}>
            <label className="cfield-label" htmlFor={`wq-${q.key}`}>
              {q.label}
            </label>
            <TextArea id={`wq-${q.key}`} value={wk.summary[q.key]} onChange={(v) => updateClient((c) => void (ensure(c).summary[q.key] = v))} />
          </div>
        ))}
        <label className="row" style={{ fontWeight: 600 }}>
          <input type="checkbox" checked={wk.complete} onChange={(e) => updateClient((c) => void (ensure(c).complete = e.target.checked))} />
          My check-in for week {week} is done
        </label>
        {wk.coachFeedback && (
          <div className="quote">
            <span className="eyebrow">Your coach's feedback</span>
            <p style={{ whiteSpace: 'pre-line' }}>{wk.coachFeedback}</p>
          </div>
        )}
        {!preview && (
          <SendPackage
            kind="client-update"
            client={client}
            label="Send my check-in to my coach"
            onSent={(m) => {
              updateClient((c) => void (c.lastSentAt = new Date().toISOString()));
              notify(m);
            }}
          />
        )}
        {client.lastSentAt && <p className="small muted">Last sent {formatDate(localDate(client.lastSentAt), { weekday: 'short', day: 'numeric', month: 'short' })}.</p>}
      </section>
    </>
  );
}
