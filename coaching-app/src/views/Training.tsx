import { useMemo, useState } from 'react';
import { useApp } from '../context';
import { TECHNIQUES, type ProgramExercise } from '../types';
import { exerciseIndex, isNum, letter, safeHref, uid, volumeByMuscle } from '../lib/calc';
import { Block, ConfirmButton, Empty, NumInput, TextInput } from '../components/ui';
import { BarList } from '../components/charts';

function newExercise(): ProgramExercise {
  return { id: uid('ex'), name: '', feeder: '', sets: 3, reps: '', tempo: '', rir: '', technique: '', rest: '', notes: '' };
}

export function Training() {
  const { client, data, updateClient } = useApp();
  const [editing, setEditing] = useState(false);
  const lib = useMemo(() => exerciseIndex(data.exercises), [data.exercises]);
  const volume = useMemo(() => volumeByMuscle(client.program, data.exercises), [client.program, data.exercises]);
  const volumeRows = [...volume.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const unknown = client.program.flatMap((d) => d.exercises).filter((e) => e.name && !lib.has(e.name.trim().toLowerCase()));

  const setEx = (dayIdx: number, exIdx: number, patch: Partial<ProgramExercise>) =>
    updateClient((c) => {
      Object.assign(c.program[dayIdx].exercises[exIdx], patch);
    });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Program</div>
          <h1>Training</h1>
          <p>{client.profile.trainingFocus || 'Weekly training program'}</p>
        </div>
        <div className="row">
          {editing && (
            <button
              className="btn"
              onClick={() =>
                updateClient((c) => {
                  c.program.push({ id: uid('day'), title: `Day ${c.program.length + 1}`, exercises: [newExercise()] });
                })
              }
            >
              Add day
            </button>
          )}
          <button className={`btn ${editing ? 'primary' : ''}`} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done editing' : 'Edit program'}
          </button>
        </div>
      </div>

      <datalist id="exercise-names">
        {data.exercises.map((e) => (
          <option key={e.name} value={e.name} />
        ))}
      </datalist>
      <datalist id="techniques">
        {TECHNIQUES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {!client.program.length && (
        <Empty title="No training program yet">
          <button className="btn primary" onClick={() => setEditing(true)}>
            Create a program
          </button>
        </Empty>
      )}

      <div className="grid two" style={{ alignItems: 'start' }}>
        {client.program.map((day, di) => (
          <section key={day.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              {editing ? (
                <TextInput
                  ariaLabel="Day name"
                  value={day.title}
                  onChange={(v) =>
                    updateClient((c) => {
                      c.program[di].title = v;
                    })
                  }
                />
              ) : (
                <h2>{day.title}</h2>
              )}
              {!editing && (
                <span className="pill">
                  {day.exercises.reduce((a, e) => a + (e.sets ?? 0), 0)} sets
                </span>
              )}
              {editing && (
                <ConfirmButton
                  label="Remove day"
                  confirmLabel="Click again to remove"
                  onConfirm={() =>
                    updateClient((c) => {
                      c.program.splice(di, 1);
                    })
                  }
                />
              )}
            </div>
            {day.exercises.map((ex, ei) => {
              const info = lib.get(ex.name.trim().toLowerCase());
              return (
                <div className="exercise" key={ex.id}>
                  <span className="idx" style={{ fontSize: '1.2rem' }}>
                    {letter(ei)}
                  </span>
                  {editing ? (
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <TextInput ariaLabel="Exercise" list="exercise-names" placeholder="Exercise" value={ex.name} onChange={(v) => setEx(di, ei, { name: v })} />
                        <button className="icon-btn" aria-label="Move up" disabled={ei === 0} onClick={() => updateClient((c) => void swap(c.program[di].exercises, ei, ei - 1))}>
                          ↑
                        </button>
                        <button
                          className="icon-btn"
                          aria-label="Move down"
                          disabled={ei === day.exercises.length - 1}
                          onClick={() => updateClient((c) => void swap(c.program[di].exercises, ei, ei + 1))}
                        >
                          ↓
                        </button>
                        <button className="icon-btn" aria-label="Remove exercise" onClick={() => updateClient((c) => void c.program[di].exercises.splice(ei, 1))}>
                          ×
                        </button>
                      </div>
                      <div className="fields" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 6 }}>
                        <label className="field">
                          <span className="lbl">Feeder sets</span>
                          <TextInput value={ex.feeder} onChange={(v) => setEx(di, ei, { feeder: v })} />
                        </label>
                        <label className="field">
                          <span className="lbl">Sets</span>
                          <NumInput value={ex.sets} onChange={(v) => setEx(di, ei, { sets: v })} />
                        </label>
                        <label className="field">
                          <span className="lbl">Reps</span>
                          <TextInput value={ex.reps} placeholder="8-12" onChange={(v) => setEx(di, ei, { reps: v })} />
                        </label>
                        <label className="field">
                          <span className="lbl">Tempo</span>
                          <TextInput value={ex.tempo} placeholder="3-1-1-0" onChange={(v) => setEx(di, ei, { tempo: v })} />
                        </label>
                        <label className="field">
                          <span className="lbl">RPE/RIR</span>
                          <TextInput value={ex.rir} onChange={(v) => setEx(di, ei, { rir: v })} />
                        </label>
                        <label className="field">
                          <span className="lbl">Technique</span>
                          <TextInput list="techniques" value={ex.technique} onChange={(v) => setEx(di, ei, { technique: v })} />
                        </label>
                        <label className="field">
                          <span className="lbl">Rest</span>
                          <TextInput value={ex.rest} placeholder="90 sec" onChange={(v) => setEx(di, ei, { rest: v })} />
                        </label>
                      </div>
                      <TextInput ariaLabel="Coach note" placeholder="Coach note (optional)" value={ex.notes} onChange={(v) => setEx(di, ei, { notes: v })} />
                    </div>
                  ) : (
                    <div className="stack" style={{ gap: 4 }}>
                      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'baseline' }}>
                        <b>{ex.name}</b>
                        {safeHref(info?.video) && (
                          <a className="small" href={safeHref(info?.video)} target="_blank" rel="noreferrer">
                            Video ↗
                          </a>
                        )}
                      </div>
                      <div className="rx">
                        <span>
                          <b>{isNum(ex.sets) ? ex.sets : '–'}</b> × <b>{ex.reps || '–'}</b>
                        </span>
                        {ex.tempo && (
                          <span>
                            Tempo <b>{ex.tempo}</b>
                          </span>
                        )}
                        {ex.rir && (
                          <span>
                            RIR <b>{ex.rir}</b>
                          </span>
                        )}
                        {ex.rest && (
                          <span>
                            Rest <b>{ex.rest}</b>
                          </span>
                        )}
                        {ex.feeder && (
                          <span>
                            Feeder <b>{ex.feeder}</b>
                          </span>
                        )}
                        {ex.technique && <span className="pill">{ex.technique}</span>}
                      </div>
                      {ex.notes && <p className="small">{ex.notes}</p>}
                      {info?.notes && (
                        <details>
                          <summary>Set-up notes</summary>
                          <p className="prose small">{info.notes}</p>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {editing && (
              <button className="btn small" onClick={() => updateClient((c) => void c.program[di].exercises.push(newExercise()))}>
                Add exercise
              </button>
            )}
          </section>
        ))}
      </div>

      <div className="grid two" style={{ alignItems: 'start' }}>
        <Block title="Weekly sets per body part" eyebrow="Sets count toward primary and secondary muscles">
          {volumeRows.length ? <BarList rows={volumeRows} unit=" sets" /> : <p className="muted">Add exercises from the library to see volume.</p>}
          {unknown.length > 0 && (
            <p className="small muted">
              Not in the exercise library, so not counted: {unknown.map((e) => e.name).join(', ')}.
            </p>
          )}
        </Block>
        <Block title="Technique key">
          <dl className="kv">
            <dt>SS</dt>
            <dd>Straight set</dd>
            <dt>P</dt>
            <dd>Potentiation set</dd>
            <dt>RP</dt>
            <dd>Rest-pause (RP×2 = two pauses)</dd>
            <dt>DS</dt>
            <dd>Drop set (DS×2 = two drops)</dd>
            <dt>MDS</dt>
            <dd>Mechanical drop set</dd>
            <dt>MR</dt>
            <dd>Muscle round</dd>
            <dt>FR / PR</dt>
            <dd>Forced reps / partial reps</dd>
            <dt>BFR</dt>
            <dd>Blood flow restriction</dd>
            <dt>Tempo</dt>
            <dd>Lower – pause – lift – pause, in seconds</dd>
            <dt>RIR</dt>
            <dd>Reps left in the tank at the end of the set</dd>
          </dl>
        </Block>
      </div>
    </>
  );
}

function swap<T>(arr: T[], i: number, j: number) {
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
