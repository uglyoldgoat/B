import { useMemo } from 'react';
import { useApp } from '../../context';
import { WEEKDAYS } from '../../types';
import { dayMacros, daysLogged, foodIndex, formatDate, isNum, latestFeedback, loggedDays, num, summarizeWeek, toISODate, todayPosition } from '../../lib/calc';
import { DAILY_ESSENTIALS, SHORT_LABELS } from '../../lib/explain';
import { planOn, sessionOn, shortDayTitle } from '../../lib/schedule';
import { SendPackage } from '../../components/exchange';
import { Ticks, weekLetters } from '../../components/ui';

export function Today() {
  const { client, data, go, notify, preview, updateClient } = useApp();
  const p = client.profile;
  const now = new Date();
  const { week, day, beforeStart } = todayPosition(client.week1Date, now);
  const wd = (now.getDay() + 6) % 7;
  const wk = client.checkIns[week];
  const entry = wk?.days[day] ?? {};
  const missing = DAILY_ESSENTIALS.filter((k) => entry[k] === undefined || entry[k] === null || entry[k] === '');
  const doneCount = DAILY_ESSENTIALS.length - missing.length;
  const session = sessionOn(client, wd);
  const plan = planOn(client, wd);
  const idx = useMemo(() => foodIndex(data.foods), [data.foods]);
  const macros = plan ? dayMacros(plan, idx) : null;
  const s = summarizeWeek(wk);
  const weighIns = (wk?.days ?? []).filter((d) => isNum(d.bw)).length;
  const stepsTarget = client.timeline[week]?.steps ?? p.stepsTarget;
  const feedback = latestFeedback(client);
  const checkInDay = p.checkInDay === WEEKDAYS[wd];
  const measured = Object.values(wk?.measurements ?? {}).some(isNum);
  const photosDone = Object.keys(client.photos).some((k) => Number(k.split('-')[0]) === week);
  const answered = Object.values(wk?.summary ?? {}).some((v) => v && String(v).trim());

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {formatDate(toISODate(now), { weekday: 'long', day: 'numeric', month: 'long' })} · Week {week}
          </div>
          <h1>Hi {p.name.split(' ')[0] || 'there'}</h1>
          {p.goal && <p>Working toward: {p.goal}</p>}
        </div>
      </div>

      {checkInDay && (
        <section className="card highlight stack" style={{ gap: 10 }}>
          <h2>It's check-in day</h2>
          <p className="ink2">Four things, then send it to your coach.</p>
          <ol className="steps">
            <li className={doneCount === DAILY_ESSENTIALS.length ? 'done' : ''}>Log today</li>
            <li className={measured ? 'done' : ''}>Measurements</li>
            <li className={photosDone ? 'done' : ''}>Progress photos</li>
            <li className={answered ? 'done' : ''}>Answer the weekly questions</li>
          </ol>
          <div className="row">
            <button className="btn" onClick={() => go('log')}>
              Open the check-in
            </button>
          </div>
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
        </section>
      )}

      {beforeStart && (
        <section className="card highlight stack" style={{ gap: 6 }}>
          <h2>Your program starts {formatDate(client.week1Date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <p className="ink2">Look around your workouts and meals now. Daily logging opens on the first day.</p>
        </section>
      )}

      <div className="grid two">
        <section className="card stack hero-card" style={{ gap: 12 }} hidden={beforeStart}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'nowrap' }}>
            <h2>Today's log</h2>
            {doneCount === DAILY_ESSENTIALS.length ? (
              <span className="pill good">✓ Done</span>
            ) : (
              <span className="count">
                <span className="figure">{doneCount}</span> of {DAILY_ESSENTIALS.length}
              </span>
            )}
          </div>
          <Ticks size="lg" on={DAILY_ESSENTIALS.map((k) => !missing.includes(k))} label={`${doneCount} of ${DAILY_ESSENTIALS.length} daily items logged`} />
          {missing.length > 0 ? (
            <p className="small ink2">Still to add: {missing.map((k) => SHORT_LABELS[k] ?? k).join(', ')}.</p>
          ) : (
            <p className="small ink2">Everything for today is in. Nice.</p>
          )}
          <button className="btn primary big" onClick={() => go('log')}>
            {doneCount ? 'Continue today’s log' : 'Log today'}
          </button>
        </section>

        <section className="card stack" style={{ gap: 10 }}>
          <h2>Today's workout</h2>
          {session ? (
            <>
              <b>{shortDayTitle(session.title)}</b>
              <p className="small ink2">{session.exercises.map((e) => e.name).join(' · ')}</p>
              <button className="btn primary big" onClick={() => go('workout')}>
                Start workout
              </button>
            </>
          ) : (
            <>
              <b>Rest day</b>
              <p className="small ink2">
                Recovery is part of the plan.
                {isNum(stepsTarget) ? ` Still aim for ${num(stepsTarget)} steps.` : ''}
              </p>
              {client.program.length > 0 && (
                <button className="btn" onClick={() => go('workout')}>
                  See all workouts
                </button>
              )}
            </>
          )}
        </section>

        <section className="card stack" style={{ gap: 10 }}>
          <h2>Today's food</h2>
          {plan && macros ? (
            <>
              <b>{plan.name}</b>
              <div className="mini-stats">
                <span>
                  <b className="figure">{num(macros.kcal)}</b> kcal
                </span>
                <span>
                  <b className="figure">{num(macros.pro)}</b> g protein
                </span>
                {isNum(plan.water) && (
                  <span>
                    <b className="figure">{num(plan.water, 1)}</b> L water
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="small ink2">{client.nutritionDays.length ? 'See your meal plan for today.' : 'Your coach has not added a meal plan yet.'}</p>
          )}
          {client.nutritionDays.length > 0 && (
            <button className="btn" onClick={() => go('meals')}>
              See meals
            </button>
          )}
        </section>

        <section className="card stack" style={{ gap: 10 }}>
          <h2>This week so far</h2>
          <Ticks on={loggedDays(wk)} marks={weekLetters(client.week1Date)} current={beforeStart ? undefined : day} label={`${daysLogged(wk)} of 7 days logged this week`} />
          <dl className="kv">
            <dt>Days logged</dt>
            <dd>{daysLogged(wk)} of 7</dd>
            <dt>Average weight</dt>
            <dd>
              {isNum(s.bw) ? `${num(s.bw, 1)} kg` : '—'}
              {weighIns > 0 && weighIns < 3 && <span className="muted"> (from {weighIns} weigh-in{weighIns === 1 ? '' : 's'}, weigh in daily for a fair average)</span>}
            </dd>
            <dt>Average steps</dt>
            <dd>
              {isNum(s.steps) ? num(s.steps) : '—'}
              {isNum(stepsTarget) && <span className="muted"> of {num(stepsTarget)}</span>}
            </dd>
          </dl>
        </section>
      </div>

      {feedback && (
        <section className="card quote stack" style={{ gap: 6 }}>
          <span className="eyebrow">From your coach · week {feedback.week}</span>
          <p style={{ whiteSpace: 'pre-line' }}>{feedback.text}</p>
        </section>
      )}

      {p.habits.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2>Habits to keep</h2>
          <div className="list">
            {p.habits.map((h, i) => (
              <div className="item" key={i}>
                <span className="idx">{i + 1}</span>
                <span className="grow">{h}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
