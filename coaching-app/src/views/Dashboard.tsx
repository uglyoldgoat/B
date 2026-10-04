import { useMemo, useState } from 'react';
import { useApp } from '../context';
import { WEEKDAYS, type Goal } from '../types';
import {
  addDays,
  ageOn,
  currentWeek,
  dayMacros,
  daysLogged,
  foodIndex,
  formatDate,
  isNum,
  lastLoggedWeek,
  latestWeight,
  loggedDays,
  num,
  summarizeWeek,
  timeUntil,
  todayPosition,
  weekStart,
  weeklyRows,
} from '../lib/calc';
import { Block, Field, NumInput, Select, Stat, TextArea, TextInput, Ticks, deltaTone, signed, weekLetters } from '../components/ui';
import { WeightChart } from '../components/progress';
import { nutritionSchedule, shortDayTitle, trainingSchedule } from '../lib/schedule';
import { phaseDirection } from '../lib/review';

export function Dashboard() {
  const { client, data, updateClient, go } = useApp();
  const p = client.profile;
  const [editing, setEditing] = useState(false);
  const week = currentWeek(client.week1Date) ?? 1;
  const phase = client.timeline[week]?.phase;
  const latest = latestWeight(client);
  const lastWeek = lastLoggedWeek(client);
  const rows = useMemo(() => weeklyRows(client, Math.max(week, lastWeek, 1)), [client, week, lastWeek]);
  const prevRow = latest ? rows.slice(0, latest.week - 1).reverse().find((r) => r.avgBw !== null) : undefined;
  const weekChange = latest && prevRow?.avgBw != null ? latest.kg - prevRow.avgBw : null;
  const thisWeek = client.checkIns[week];
  const logged = daysLogged(thisWeek);
  const summaryWeek = lastWeek ? (lastWeek === week && logged < 7 && lastWeek > 1 ? lastWeek - 1 : lastWeek) : 0;
  const s = summarizeWeek(client.checkIns[summaryWeek]);
  const tl = client.timeline[summaryWeek];
  const stepsTarget = tl?.steps ?? p.stepsTarget;
  const idx = useMemo(() => foodIndex(data.foods), [data.foods]);
  const plans = client.nutritionDays.filter((d) => !d.archived);
  const tSched = trainingSchedule(client);
  const nSched = nutritionSchedule(client);

  const age = ageOn(p.dob);
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) =>
    updateClient((c) => {
      c.profile[k] = v;
    });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            Week {week}
            {phase ? ` · ${phase}` : ''}
          </div>
          <h1>{p.name || 'Unnamed client'}</h1>
          <p>
            {p.goal || 'No goal set'}
            {p.goalDate && (
              <>
                {' '}
                · {timeUntil(p.goalDate)} to go ({formatDate(p.goalDate, { day: 'numeric', month: 'short', year: 'numeric' })})
              </>
            )}
          </p>
        </div>
        <button className="btn" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done editing' : 'Edit profile & goals'}
        </button>
      </div>

      {client.importNotes && client.importNotes.length > 0 && (
        <div className="banner">
          <div className="grow stack" style={{ gap: 6 }}>
            <b>Things the import found in the spreadsheet</b>
            <ul className="notes-list">
              {client.importNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <button
            className="btn small"
            onClick={() =>
              updateClient((c) => {
                c.importNotes = [];
              })
            }
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="stats">
        <Stat
          label={latest ? `Weight · week ${latest.week} average` : 'Weight'}
          value={latest ? latest.kg.toFixed(1) : '—'}
          unit="kg"
          delta={weekChange !== null && prevRow ? { text: `${signed(weekChange, 1, ' kg')} vs ${prevRow.week === latest!.week - 1 ? 'previous week' : `week ${prevRow.week}`}`, tone: deltaTone(weekChange, phaseDirection(phase)) } : null}
          sub={isNum(p.startWeightKg) && latest ? `Start ${num(p.startWeightKg, 1)} kg · ${signed(latest.kg - p.startWeightKg, 1, ' kg')} total` : undefined}
        />
        <Stat label={`This week's check-in`} value={`${logged}/7`} unit="days" sub={thisWeek?.complete ? 'Marked complete' : `Week of ${formatDate(weekStart(client.week1Date, week))}`}>
          <div style={{ marginTop: 6 }}>
            <Ticks on={loggedDays(thisWeek)} marks={weekLetters(client.week1Date)} current={todayPosition(client.week1Date).week === week ? todayPosition(client.week1Date).day : undefined} label={`${logged} of 7 days logged`} />
          </div>
          <button className="btn small" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={() => go('checkin')}>
            Open check-in
          </button>
        </Stat>
        <Stat
          label={summaryWeek ? `Steps · week ${summaryWeek} average` : 'Steps'}
          value={isNum(s.steps) ? num(s.steps) : '—'}
          sub={isNum(stepsTarget) ? `Target ${num(stepsTarget)}` : 'No target set'}
        >
          {isNum(s.steps) && isNum(stepsTarget) && stepsTarget > 0 && (
            <div className={`meter ${s.steps < stepsTarget ? 'warn' : ''}`}>
              <span style={{ width: `${Math.min(100, (s.steps / stepsTarget) * 100)}%` }} />
            </div>
          )}
        </Stat>
        <Stat
          label={summaryWeek ? `Calories · week ${summaryWeek} average` : 'Calories'}
          value={isNum(s.kcal) ? num(s.kcal) : '—'}
          unit="kcal"
          sub={
            tl && (isNum(tl.intakeHigh) || isNum(tl.intakeLow))
              ? `Targets ${[tl.intakeHigh, tl.intakeMed, tl.intakeLow].filter(isNum).map((v) => num(v)).join(' / ')}`
              : plans.length
                ? `Plan ${plans.map((d) => num(dayMacros(d, idx).kcal)).join(' / ')}`
                : undefined
          }
        />
      </div>

      <Block title="Bodyweight" eyebrow="Weekly average with daily weigh-ins" actions={<button className="btn small" onClick={() => go('timeline')}>Timeline</button>}>
        <WeightChart client={client} />
      </Block>

      <div className="grid two">
        <Block title="Targets" eyebrow="Nutrition & activity" actions={<button className="btn small" onClick={() => go('nutrition')}>Meal plan</button>}>
          {plans.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th className="n">kcal</th>
                    <th className="n">Protein</th>
                    <th className="n">Carbs</th>
                    <th className="n">Fat</th>
                    <th className="n">Water</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((d) => {
                    const m = dayMacros(d, idx);
                    return (
                      <tr key={d.id}>
                        <td>{d.name}</td>
                        <td className="n">{num(m.kcal)}</td>
                        <td className="n">{num(m.pro)} g</td>
                        <td className="n">{num(m.cho)} g</td>
                        <td className="n">{num(m.fat)} g</td>
                        <td className="n">{isNum(d.water) ? `${num(d.water, 1)} L` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No meal plan yet.</p>
          )}
          <dl className="kv">
            <dt>Steps</dt>
            <dd>{isNum(p.stepsTarget) ? `${num(p.stepsTarget)} a day` : '—'}</dd>
            <dt>Cardio</dt>
            <dd>{p.cardioTarget || '—'}</dd>
            <dt>Training</dt>
            <dd>{p.trainingFocus || '—'}</dd>
            <dt>Check-in day</dt>
            <dd>{p.checkInDay || '—'}</dd>
          </dl>
        </Block>

        <Block title="Goals">
          <GoalList title="Next 3 months" goals={p.shortTermGoals} onChange={(g) => set('shortTermGoals', g)} editing={editing} />
          <GoalList title="Next 6–12 months" goals={p.longTermGoals} onChange={(g) => set('longTermGoals', g)} editing={editing} />
          <div className="stack">
            <span className="eyebrow">Why</span>
            {editing ? (
              <StringList values={p.whys} onChange={(v) => set('whys', v)} placeholder="A reason this matters" />
            ) : p.whys.length ? (
              <div className="list">
                {p.whys.map((w, i) => (
                  <div className="item" key={i}>
                    <span className="idx">{i + 1}</span>
                    <span className="grow">{w}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No reasons written yet.</p>
            )}
          </div>
        </Block>
      </div>

      <Block
        title="Weekly schedule"
        eyebrow="Workouts & meal plans"
        actions={
          <button className="btn small" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        }
      >
        <p className="small ink2">The client's Today screen uses this to show the right workout and meal plan each day.</p>
        <div className="split">
          {WEEKDAYS.map((d, i) => {
            const session = client.program.find((x) => x.id === tSched[i]);
            const plan = client.nutritionDays.find((x) => x.id === nSched[i]);
            return (
              <div key={d} className={session ? '' : 'rest'}>
                <div className="d">{d.slice(0, 3)}</div>
                {editing ? (
                  <div className="stack" style={{ gap: 4 }}>
                    <select
                      className="bare"
                      aria-label={`${d} workout`}
                      value={tSched[i]}
                      onChange={(e) =>
                        updateClient((c) => {
                          const arr = [...trainingSchedule(c)];
                          arr[i] = e.target.value;
                          c.trainingSchedule = arr;
                        })
                      }
                    >
                      <option value="">Rest</option>
                      {client.program.map((x) => (
                        <option key={x.id} value={x.id}>
                          {shortDayTitle(x.title)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="bare"
                      aria-label={`${d} meal plan`}
                      value={nSched[i]}
                      onChange={(e) =>
                        updateClient((c) => {
                          const arr = [...nutritionSchedule(c)];
                          arr[i] = e.target.value;
                          c.nutritionSchedule = arr;
                        })
                      }
                    >
                      <option value="">No plan</option>
                      {plans.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="s">{session ? shortDayTitle(session.title) : <span className="muted">Rest</span>}</div>
                    <div className="small muted">{plan?.name ?? ''}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {!client.program.length && <p className="small muted">Add training days on the Training tab to schedule them here.</p>}
      </Block>

      <div className="grid two">
        <Block title="Daily & weekly habits">
          {editing ? (
            <StringList values={p.habits} onChange={(v) => set('habits', v)} placeholder="A habit to build" />
          ) : p.habits.length ? (
            <div className="list">
              {p.habits.map((h, i) => (
                <div className="item" key={i}>
                  <span className="idx">{i + 1}</span>
                  <span className="grow">{h}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No habits set.</p>
          )}
        </Block>
        <Block title="Client details">
          {editing ? (
            <div className="fields">
              <Field label="Name" id="pf-name">
                <TextInput id="pf-name" value={p.name} onChange={(v) => set('name', v)} />
              </Field>
              <Field label="Date of birth" id="pf-dob">
                <TextInput id="pf-dob" type="date" value={p.dob} onChange={(v) => set('dob', v)} />
              </Field>
              <Field label="Height (cm)" id="pf-h">
                <NumInput id="pf-h" value={p.heightCm} onChange={(v) => set('heightCm', v)} />
              </Field>
              <Field label="Start weight (kg)" id="pf-sw">
                <NumInput id="pf-sw" value={p.startWeightKg} step={0.1} onChange={(v) => set('startWeightKg', v)} />
              </Field>
              <Field label="Coaching start" id="pf-cs">
                <TextInput id="pf-cs" type="date" value={p.coachingStart} onChange={(v) => set('coachingStart', v)} />
              </Field>
              <Field label="Check-in week 1 starts" hint="Week numbers count from here" id="pf-w1">
                <TextInput
                  id="pf-w1"
                  type="date"
                  value={client.week1Date}
                  onChange={(v) =>
                    updateClient((c) => {
                      c.week1Date = v;
                    })
                  }
                />
              </Field>
              <Field label="Overarching goal" id="pf-goal">
                <TextInput id="pf-goal" value={p.goal} onChange={(v) => set('goal', v)} />
              </Field>
              <Field label="Goal date" id="pf-gd">
                <TextInput id="pf-gd" type="date" value={p.goalDate} onChange={(v) => set('goalDate', v)} />
              </Field>
              <Field label="Check-in day" id="pf-cid">
                <Select id="pf-cid" value={p.checkInDay} options={WEEKDAYS} onChange={(v) => set('checkInDay', v)} />
              </Field>
              <Field label="Daily steps target" id="pf-st">
                <NumInput id="pf-st" value={p.stepsTarget} step={500} onChange={(v) => set('stepsTarget', v)} />
              </Field>
              <Field label="Cardio target" id="pf-ct">
                <TextInput id="pf-ct" value={p.cardioTarget} onChange={(v) => set('cardioTarget', v)} />
              </Field>
              <Field label="Training focus" id="pf-tf">
                <TextInput id="pf-tf" value={p.trainingFocus} onChange={(v) => set('trainingFocus', v)} />
              </Field>
            </div>
          ) : (
            <dl className="kv">
              <dt>Age</dt>
              <dd>{age !== null ? `${age} (born ${formatDate(p.dob, { day: 'numeric', month: 'short', year: 'numeric' })})` : '—'}</dd>
              <dt>Height</dt>
              <dd>{isNum(p.heightCm) ? `${num(p.heightCm)} cm` : '—'}</dd>
              <dt>Start weight</dt>
              <dd>{isNum(p.startWeightKg) ? `${num(p.startWeightKg, 1)} kg` : '—'}</dd>
              <dt>Coaching start</dt>
              <dd>{p.coachingStart ? formatDate(p.coachingStart, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd>
              <dt>Week 1 starts</dt>
              <dd>
                {client.week1Date ? formatDate(client.week1Date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                {client.week1Date && <span className="muted"> · week {week} ends {formatDate(addDays(weekStart(client.week1Date, week), 6))}</span>}
              </dd>
            </dl>
          )}
        </Block>
      </div>

      {p.guide.length > 0 && (
        <Block title="Guide & common questions">
          <div className="grid two">
            {p.guide.map((g, i) => (
              <details key={i} className="card">
                <summary>
                  <b style={{ color: 'var(--ink)' }}>{g.title}</b>
                </summary>
                {editing ? (
                  <TextArea
                    ariaLabel={`${g.title} text`}
                    rows={6}
                    value={g.body}
                    onChange={(v) =>
                      updateClient((c) => {
                        c.profile.guide[i].body = v;
                      })
                    }
                  />
                ) : (
                  <p className="prose">{g.body}</p>
                )}
              </details>
            ))}
          </div>
        </Block>
      )}
    </>
  );
}

function GoalList({ title, goals, onChange, editing }: { title: string; goals: Goal[]; onChange: (g: Goal[]) => void; editing: boolean }) {
  return (
    <div className="stack">
      <span className="eyebrow">{title}</span>
      <div className="list">
        {goals.map((g, i) => (
          <div className="item" key={i} style={{ alignItems: 'center' }}>
            <input
              type="checkbox"
              aria-label={`Mark "${g.text}" achieved`}
              checked={g.done}
              onChange={(e) => onChange(goals.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
            />
            {editing ? (
              <>
                <TextInput className="bare" ariaLabel="Goal" value={g.text} onChange={(v) => onChange(goals.map((x, j) => (j === i ? { ...x, text: v } : x)))} />
                <button className="icon-btn" aria-label="Remove goal" onClick={() => onChange(goals.filter((_, j) => j !== i))}>
                  ×
                </button>
              </>
            ) : (
              <span className="grow" style={g.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>
                {g.text}
              </span>
            )}
          </div>
        ))}
        {!goals.length && !editing && <p className="muted small">No goals yet.</p>}
      </div>
      {editing && (
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...goals, { text: '', done: false }])}>
          Add goal
        </button>
      )}
    </div>
  );
}

function StringList({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div className="stack">
      {values.map((v, i) => (
        <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
          <TextInput ariaLabel={placeholder} value={v} placeholder={placeholder} onChange={(t) => onChange(values.map((x, j) => (j === i ? t : x)))} />
          <button className="icon-btn" aria-label="Remove" onClick={() => onChange(values.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...values, ''])}>
        Add
      </button>
    </div>
  );
}
