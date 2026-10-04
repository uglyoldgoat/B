import { useMemo, useState } from 'react';
import { useApp } from '../context';
import { PHASES, SUMMARY_QUESTIONS, type TimelineWeek } from '../types';
import { addDays, currentWeek, daysLogged, emptyWeek, formatDate, isNum, lastLoggedWeek, localDate, weekStart } from '../lib/calc';
import { reviewRows, weekFlags, weekToReview } from '../lib/review';
import { Block, NumInput, Select, TextArea, TextInput, signed } from '../components/ui';
import { SendPackage } from '../components/exchange';
import { CompareImage } from './Photos';

const BLANK: TimelineWeek = { phase: '', intakeHigh: null, intakeMed: null, intakeLow: null, cardio: '', steps: null, training: '', supplements: '', goals: '', notes: '' };
const ICON = { warn: '!', good: '✓', info: '•' } as const;

export function Review() {
  const { client, data, updateClient, notify, go } = useApp();
  const now = currentWeek(client.week1Date) ?? 1;
  const [week, setWeek] = useState(() => weekToReview(client, now) ?? Math.min(now, lastLoggedWeek(client) || now));
  const wk = client.checkIns[week];
  const flags = useMemo(() => weekFlags(client, week, data.foods), [client, week, data.foods]);
  const rows = useMemo(() => reviewRows(client, week, data.foods), [client, week, data.foods]);
  const start = weekStart(client.week1Date, week);
  const next = week + 1;
  const nextT = client.timeline[next] ?? BLANK;
  const answers = SUMMARY_QUESTIONS.filter((q) => wk?.summary[q.key]?.trim());

  // Measurements against the previous week that has them.
  const prevMeasured = useMemo(() => {
    for (let w = week - 1; w >= 1; w--) {
      const m = client.checkIns[w]?.measurements;
      if (m && Object.values(m).some(isNum)) return { week: w, m };
    }
    return null;
  }, [client.checkIns, week]);
  const measured = client.measurementSites.filter((s) => isNum(wk?.measurements[s]));

  // Photos: this week next to the most recent earlier week with photos.
  const photoWeeks = [...new Set(Object.keys(client.photos).map((k) => Number(k.split('-')[0])))];
  const thisPhotos = client.photoPoses.map((_, i) => i).filter((i) => client.photos[`${week}-${i}`]);
  const prevPhotoWeek = Math.max(0, ...photoWeeks.filter((w) => w < week));

  const setNext = <K extends keyof TimelineWeek>(k: K, v: TimelineWeek[K]) =>
    updateClient((c) => {
      c.timeline[next] ??= { ...BLANK };
      c.timeline[next][k] = v;
    });
  const ensure = (c: typeof client) => (c.checkIns[week] ??= emptyWeek());

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Weekly review · {client.profile.name}</div>
          <h1>Week {week}</h1>
          <p>
            {formatDate(start, { day: 'numeric', month: 'short' })} – {formatDate(addDays(start, 6), { day: 'numeric', month: 'short' })} · {daysLogged(wk)}/7 days logged
            {wk?.complete && <span className="pill good" style={{ marginLeft: 8 }}>Client marked it done</span>}
            {wk?.reviewed && <span className="pill accent" style={{ marginLeft: 8 }}>Reviewed</span>}
          </p>
        </div>
        <div className="week-nav">
          <button className="btn" aria-label="Previous week" disabled={week <= 1} onClick={() => setWeek((w) => w - 1)}>
            ‹
          </button>
          <span className="small ink2">Week {week}</span>
          <button className="btn" aria-label="Next week" disabled={week >= now} onClick={() => setWeek((w) => w + 1)}>
            ›
          </button>
          <button className="btn ghost" onClick={() => go('checkin')}>
            Full check-in
          </button>
        </div>
      </div>

      <section className="card stack" style={{ gap: 8 }}>
        <h2>What stands out</h2>
        <ul className="flags">
          {flags.map((f) => (
            <li key={f.text} className={`flag ${f.tone}`}>
              <span className="flag-icon" aria-hidden="true">
                {ICON[f.tone]}
              </span>
              <span>
                <span className="sr-only">{f.tone === 'warn' ? 'Needs attention: ' : f.tone === 'good' ? 'Good: ' : ''}</span>
                {f.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid two" style={{ alignItems: 'start' }}>
        <Block title="Numbers">
          <div className="table-wrap">
            <table className="numbers">
              <thead>
                <tr>
                  <th />
                  <th className="n">Week {week}</th>
                  <th className="n">Week {week - 1 || '–'}</th>
                  <th className="n">Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td className="small">{r.label}</td>
                    <td className="n num" style={{ fontWeight: 600, color: r.tone === 'warn' ? 'var(--warn)' : r.tone === 'good' ? 'var(--good)' : undefined }}>
                      {r.value}
                    </td>
                    <td className="n num muted">{r.prev}</td>
                    <td className="n small ink2">{r.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>

        <div className="stack" style={{ gap: 20 }}>
          <Block title="In their words">
            {answers.length ? (
              <dl className="answers">
                {answers.map((q) => (
                  <div key={q.key}>
                    <dt>{q.label}</dt>
                    <dd>{wk!.summary[q.key]}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted small">No weekly answers yet.</p>
            )}
          </Block>
          {measured.length > 0 && (
            <Block title="Measurements" eyebrow={prevMeasured ? `Change since week ${prevMeasured.week}` : undefined}>
              <div className="mini-stats">
                {measured.map((s) => {
                  const v = wk!.measurements[s]!;
                  const p = prevMeasured?.m[s];
                  return (
                    <span key={s}>
                      {s} <b>{v}</b>
                      {isNum(p) && <span className="muted"> ({signed(v - p, 1)})</span>}
                    </span>
                  );
                })}
              </div>
            </Block>
          )}
        </div>
      </div>

      {thisPhotos.length > 0 && (
        <Block title="Photos" eyebrow={prevPhotoWeek ? `Week ${prevPhotoWeek} next to week ${week}` : `Week ${week}`}>
          <div className="compare">
            {thisPhotos.map((p) => (
              <div key={p} className="stack" style={{ gap: 6 }}>
                <b className="small">{client.photoPoses[p]}</b>
                <div className="pair">
                  {prevPhotoWeek > 0 && <CompareImage photoKey={client.photos[`${prevPhotoWeek}-${p}`]} label={`Week ${prevPhotoWeek}`} />}
                  <CompareImage photoKey={client.photos[`${week}-${p}`]} label={`Week ${week}`} />
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      <div className="grid two" style={{ alignItems: 'start' }}>
        <Block title="Your feedback">
          <TextArea
            ariaLabel="Feedback for the client"
            rows={6}
            placeholder={`What went well, what to change for week ${next}`}
            value={wk?.coachFeedback}
            onChange={(v) => updateClient((c) => void (ensure(c).coachFeedback = v))}
          />
          <p className="small muted">The client sees this on their Today screen after you send the plan.</p>
        </Block>
        <Block
          title={`Targets for week ${next}`}
          actions={
            client.timeline[week] && (
              <button
                className="btn small"
                onClick={() =>
                  updateClient((c) => {
                    c.timeline[next] = { ...(c.timeline[week] ?? BLANK) };
                  })
                }
              >
                Same as week {week}
              </button>
            )
          }
        >
          <div className="fields">
            <label className="field">
              <span className="lbl">Phase</span>
              <Select value={nextT.phase} options={PHASES} onChange={(v) => setNext('phase', v)} />
            </label>
            <label className="field">
              <span className="lbl">Daily steps</span>
              <NumInput value={nextT.steps} step={500} onChange={(v) => setNext('steps', v)} />
            </label>
            <label className="field">
              <span className="lbl">Calories, high day</span>
              <NumInput value={nextT.intakeHigh} step={25} onChange={(v) => setNext('intakeHigh', v)} />
            </label>
            <label className="field">
              <span className="lbl">Calories, medium day</span>
              <NumInput value={nextT.intakeMed} step={25} onChange={(v) => setNext('intakeMed', v)} />
            </label>
            <label className="field">
              <span className="lbl">Calories, low day</span>
              <NumInput value={nextT.intakeLow} step={25} onChange={(v) => setNext('intakeLow', v)} />
            </label>
            <label className="field">
              <span className="lbl">Cardio</span>
              <TextInput value={nextT.cardio} onChange={(v) => setNext('cardio', v)} />
            </label>
          </div>
          <p className="small muted">Changing calorie targets here doesn't change the meal plan. Edit the plan on the Meal plan tab.</p>
        </Block>
      </div>

      <section className="card stack" style={{ gap: 10 }}>
        <h2>Finish the review</h2>
        <label className="row" style={{ fontWeight: 600 }}>
          <input type="checkbox" checked={!!wk?.reviewed} onChange={(e) => updateClient((c) => void (ensure(c).reviewed = e.target.checked))} />
          Week {week} reviewed
        </label>
        <p className="small ink2">Then send {client.profile.name || 'the client'} the updated plan and your feedback. They open the file in their app; their own logs are not touched.</p>
        <SendPackage
          kind="client-setup"
          client={client}
          exercises={data.exercises}
          foods={data.foods}
          label={`Send plan & feedback to ${client.profile.name || 'client'}`}
          onSent={(m) => {
            updateClient((c) => void (c.lastSentAt = new Date().toISOString()));
            notify(m);
          }}
        />
        {client.lastSentAt && <p className="small muted">Last sent {formatDate(localDate(client.lastSentAt), { weekday: 'short', day: 'numeric', month: 'short' })}.</p>}
      </section>
    </>
  );
}
