import { useMemo, useState } from 'react';
import { useApp } from '../../context';
import { WEEKDAYS, type Client, type LoggedSet, type ProgramDay } from '../../types';
import { emptyWeek, exerciseIndex, hasSets, isNum, letter, num, safeHref, todayPosition } from '../../lib/calc';
import { describeFeeder, describeRest, describeRir, describeSets, describeTechnique, describeTempo, topReps } from '../../lib/explain';
import { sessionOn, shortDayTitle, trainingSchedule } from '../../lib/schedule';
import { Empty, NumInput, Picker } from '../../components/ui';

function sessionsLogged(client: Client, day: ProgramDay): number {
  let n = 0;
  for (const e of day.exercises) {
    (client.logbook[e.id] ?? []).forEach((w, i) => {
      if (hasSets(w)) n = Math.max(n, i + 1);
    });
  }
  return n;
}

/** Which session number today's workout is: the latest one if it was started
 * today, otherwise the next one. */
export function sessionForToday(client: Client, day: ProgramDay, todayISO: string): number {
  const latest = sessionsLogged(client, day);
  if (!latest) return 1;
  const started = client.sessionDates?.[day.id]?.[latest - 1];
  if (started) return started === todayISO ? latest : latest + 1;
  const complete = day.exercises.every((e) => hasSets(client.logbook[e.id]?.[latest - 1]));
  return complete ? latest + 1 : latest;
}

const setText = (s: LoggedSet | undefined) => (s && (isNum(s.kg) || isNum(s.reps)) ? `${isNum(s.kg) ? num(s.kg, 1) : '–'} kg × ${isNum(s.reps) ? s.reps : '–'}` : '');

export function Workout() {
  const { client, data, updateClient, notify, go } = useApp();
  const today = todayPosition(client.week1Date);
  const wd = (new Date().getDay() + 6) % 7;
  const todays = sessionOn(client, wd);
  const [dayId, setDayId] = useState(todays?.id ?? client.program[0]?.id ?? '');
  const day = client.program.find((d) => d.id === dayId) ?? client.program[0];
  const [session, setSession] = useState(() => (day ? sessionForToday(client, day, today.iso) : 1));
  const lib = useMemo(() => exerciseIndex(data.exercises), [data.exercises]);
  const sched = trainingSchedule(client);

  if (!day) {
    return (
      <Empty title="No workouts yet">
        <p>Your coach hasn't added a training program. It will appear here when they send it.</p>
      </Empty>
    );
  }

  const pickDay = (id: string) => {
    setDayId(id);
    const d = client.program.find((x) => x.id === id);
    if (d) setSession(sessionForToday(client, d, today.iso));
  };

  const setSet = (exId: string, s: number, key: 'kg' | 'reps', v: number | null) =>
    updateClient((c) => {
      const logs = (c.logbook[exId] ??= []);
      while (logs.length < session) logs.push([]);
      const sets = logs[session - 1];
      while (sets.length <= s) sets.push({ kg: null, reps: null });
      sets[s][key] = v;
      const dates = ((c.sessionDates ??= {})[day.id] ??= []);
      while (dates.length < session) dates.push('');
      if (!dates[session - 1]) dates[session - 1] = today.iso;
    });

  const daysFor = (id: string) => sched.map((x, i) => (x === id ? WEEKDAYS[i].slice(0, 3) : '')).filter(Boolean);
  const latest = sessionsLogged(client, day);
  const logged = day.exercises.some((e) => hasSets(client.logbook[e.id]?.[session - 1]));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{todays?.id === day.id ? "Today's workout" : 'Workout'}</div>
          <h1>{shortDayTitle(day.title)}</h1>
          <p>
            Session {session}
            {session <= latest ? '' : ' (new)'}. Grey numbers are what you did last time: try to match or beat them.
          </p>
        </div>
        <div className="row">
          <button className="btn" aria-label="Previous session" disabled={session <= 1} onClick={() => setSession((s) => s - 1)}>
            ‹
          </button>
          <span className="small ink2">Session {session}</span>
          <button className="btn" aria-label="Next session" disabled={session > latest} onClick={() => setSession((s) => s + 1)}>
            ›
          </button>
        </div>
      </div>

      {client.program.length > 1 && (
        <Picker label="Workout" value={day.id} onChange={pickDay} options={client.program.map((d) => ({ id: d.id, label: shortDayTitle(d.title), sub: daysFor(d.id).join(', ') || undefined }))} />
      )}

      <div className="stack" style={{ gap: 14 }}>
        {day.exercises.map((ex, i) => {
          const info = lib.get(ex.name.trim().toLowerCase());
          const logs = client.logbook[ex.id] ?? [];
          const cur = logs[session - 1] ?? [];
          const prev = logs[session - 2] ?? [];
          // Show the prescribed sets, plus any extra set that actually has data.
          const lastFilled = cur.reduce((n, st, k) => (isNum(st.kg) || isNum(st.reps) ? k + 1 : n), 0);
          const count = Math.max(ex.sets ?? 3, lastFilled, 1);
          const top = topReps(ex.reps);
          const prevDone = prev.filter((s) => isNum(s.reps));
          const readyToProgress = top !== null && prevDone.length >= (ex.sets ?? 1) && prevDone.every((s) => (s.reps ?? 0) >= top);
          const cues = [describeFeeder(ex.feeder), ex.tempo && describeTempo(ex.tempo) ? `Speed: ${describeTempo(ex.tempo)}` : null, describeRir(ex.rir), describeRest(ex.rest), describeTechnique(ex.technique)].filter(Boolean) as string[];
          const video = safeHref(info?.video);
          return (
            <section key={ex.id} className="card stack" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'nowrap' }}>
                <div className="row" style={{ alignItems: 'baseline', flexWrap: 'nowrap', minWidth: 0 }}>
                  <span className="idx" style={{ fontSize: '1.3rem' }}>
                    {letter(i)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: '1.1rem' }}>{ex.name}</h2>
                    <b className="ink2">{describeSets(ex)}</b>
                  </div>
                </div>
                {video && (
                  <a className="btn small" href={video} target="_blank" rel="noreferrer">
                    Watch ↗
                  </a>
                )}
              </div>
              {cues.length > 0 && (
                <ul className="cues">
                  {cues.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              {ex.notes && <p className="small quote-inline">Coach: {ex.notes}</p>}
              {info?.notes && (
                <details>
                  <summary>How to set up</summary>
                  <p className="prose small">{info.notes}</p>
                </details>
              )}
              {readyToProgress && <p className="pill good wrap" style={{ alignSelf: 'flex-start' }}>You hit {top} reps on every set last time. Try a little more weight.</p>}
              <div className="set-rows">
                {Array.from({ length: count }, (_, s) => (
                  <div className="set-row" key={s}>
                    <span className="set-n">Set {s + 1}</span>
                    <div className="unit-input">
                      <NumInput ariaLabel={`Set ${s + 1} weight`} value={cur[s]?.kg} step={0.5} placeholder={isNum(prev[s]?.kg) ? String(prev[s].kg) : ''} onChange={(v) => setSet(ex.id, s, 'kg', v)} />
                      <span>kg</span>
                    </div>
                    <div className="unit-input">
                      <NumInput ariaLabel={`Set ${s + 1} reps`} value={cur[s]?.reps} step={1} placeholder={isNum(prev[s]?.reps) ? String(prev[s].reps) : ''} onChange={(v) => setSet(ex.id, s, 'reps', v)} />
                      <span>reps</span>
                    </div>
                    <span className="small muted set-last">{setText(prev[s]) && `Last: ${setText(prev[s])}`}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {logged && todays?.id === day.id && (
        <section className="card stack" style={{ gap: 8 }}>
          <b>Finished?</b>
          <p className="small ink2">Your sets are saved. Add the workout to today's check-in so your coach sees it.</p>
          <button
            className="btn primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              updateClient((c) => {
                const w = (c.checkIns[today.week] ??= emptyWeek());
                w.days[today.day].session = shortDayTitle(day.title);
              });
              notify('Added to today’s check-in');
              go('log');
            }}
          >
            Add to today's check-in
          </button>
        </section>
      )}
    </>
  );
}
