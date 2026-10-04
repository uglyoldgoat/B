import { useMemo, useState } from 'react';
import { useApp } from '../context';
import type { Exercise, Food } from '../types';
import { isNum, num, safeHref } from '../lib/calc';
import { NumInput, Select, TextInput } from '../components/ui';

const CATEGORIES = ['PRO', 'CHO', 'FAT', 'VEG', 'FRUIT', 'OTHER'];
const PAGE = 60;

export function Library() {
  const [tab, setTab] = useState<'exercises' | 'foods'>('exercises');
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Shared by all clients</div>
          <h1>Library</h1>
          <p>Programs and meal plans look up exercises and foods here by name.</p>
        </div>
        <div className="seg" role="group" aria-label="Library">
          <button aria-pressed={tab === 'exercises'} onClick={() => setTab('exercises')}>
            Exercises
          </button>
          <button aria-pressed={tab === 'foods'} onClick={() => setTab('foods')}>
            Foods
          </button>
        </div>
      </div>
      {tab === 'exercises' ? <Exercises /> : <Foods />}
    </>
  );
}

function Exercises() {
  const { data, update } = useApp();
  const [q, setQ] = useState('');
  const [part, setPart] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<string | null>(null);
  const parts = useMemo(() => [...new Set(data.exercises.flatMap((e) => [e.primary, e.secondary]).filter(Boolean))].sort(), [data.exercises]);
  const list = data.exercises
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => (!q || e.name.toLowerCase().includes(q.toLowerCase())) && (!part || e.primary === part || e.secondary === part));
  const set = (i: number, k: keyof Exercise, v: string) => update((d) => void (d.exercises[i][k] = v));

  return (
    <>
      <div className="row">
        <span style={{ flex: '1 1 220px' }}>
          <TextInput ariaLabel="Search exercises" placeholder={`Search ${data.exercises.length} exercises`} value={q} onChange={setQ} />
        </span>
        <span style={{ flex: '0 1 200px' }}>
          <Select ariaLabel="Body part" value={part} options={parts} placeholder="All body parts" onChange={setPart} />
        </span>
        <button
          className="btn"
          onClick={() => {
            const name = q.trim() || 'New exercise';
            update((d) => void d.exercises.unshift({ name, primary: part, secondary: '', notes: '', video: '' }));
            setEditing(name);
          }}
        >
          Add exercise
        </button>
      </div>
      <div className="list card">
        {list.slice(0, limit).map(({ e, i }) => (
          <div className="item" key={`${e.name}-${i}`}>
            <div className="grow stack" style={{ gap: 4 }}>
              {editing === e.name ? (
                <div className="fields">
                  <label className="field">
                    <span className="lbl">Name</span>
                    <TextInput value={e.name} onChange={(v) => { set(i, 'name', v); setEditing(v); }} />
                  </label>
                  <label className="field">
                    <span className="lbl">Primary body part</span>
                    <TextInput list="body-parts" value={e.primary} onChange={(v) => set(i, 'primary', v)} />
                  </label>
                  <label className="field">
                    <span className="lbl">Secondary body part</span>
                    <TextInput list="body-parts" value={e.secondary} onChange={(v) => set(i, 'secondary', v)} />
                  </label>
                  <label className="field">
                    <span className="lbl">Video link</span>
                    <TextInput value={e.video} placeholder="https://" onChange={(v) => set(i, 'video', v)} />
                  </label>
                  <label className="field" style={{ gridColumn: '1 / -1' }}>
                    <span className="lbl">Set-up notes</span>
                    <textarea rows={3} value={e.notes} onChange={(ev) => set(i, 'notes', ev.target.value)} />
                  </label>
                </div>
              ) : (
                <>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b>{e.name}</b>
                    <span className="row">
                      {e.primary && <span className="pill accent">{e.primary}</span>}
                      {e.secondary && <span className="pill">{e.secondary}</span>}
                    </span>
                  </div>
                  {e.notes && (
                    <details>
                      <summary>Set-up notes</summary>
                      <p className="prose small">{e.notes}</p>
                    </details>
                  )}
                </>
              )}
            </div>
            <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
              {safeHref(e.video) && (
                <a className="small" href={safeHref(e.video)} target="_blank" rel="noreferrer">
                  Video ↗
                </a>
              )}
              <button className="btn ghost small" onClick={() => setEditing(editing === e.name ? null : e.name)}>
                {editing === e.name ? 'Done' : 'Edit'}
              </button>
              {editing === e.name && (
                <button className="btn ghost small" style={{ color: 'var(--bad)' }} onClick={() => update((d) => void d.exercises.splice(i, 1))}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
        {!list.length && <p className="muted" style={{ padding: 8 }}>No exercises match.</p>}
      </div>
      <datalist id="body-parts">
        {parts.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {list.length > limit && (
        <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({list.length - limit} left)
        </button>
      )}
    </>
  );
}

function Foods() {
  const { data, update } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState(false);
  const list = data.foods
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => (!q || f.name.toLowerCase().includes(q.toLowerCase())) && (!cat || f.category === cat));
  const setF = <K extends keyof Food>(i: number, k: K, v: Food[K]) => update((d) => void (d.foods[i][k] = v));

  return (
    <>
      <div className="row">
        <span style={{ flex: '1 1 220px' }}>
          <TextInput ariaLabel="Search foods" placeholder={`Search ${data.foods.length} foods`} value={q} onChange={setQ} />
        </span>
        <span style={{ flex: '0 1 180px' }}>
          <Select ariaLabel="Category" value={cat} options={CATEGORIES} placeholder="All categories" onChange={setCat} />
        </span>
        <button
          className="btn"
          onClick={() => {
            update((d) => void d.foods.unshift({ name: q.trim() || 'New food', amount: 100, unit: 'g', kcal: 0, pro: 0, cho: 0, fat: 0, category: cat || 'OTHER' }));
            setEditing(true);
          }}
        >
          Add food
        </button>
        <button className={`btn ${editing ? 'primary' : ''}`} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done editing' : 'Edit'}
        </button>
      </div>
      <div className="table-wrap">
        <table className={editing ? 'grid-table' : undefined}>
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Food</th>
              <th className="n">Per</th>
              <th>Unit</th>
              <th className="n">kcal</th>
              <th className="n">Protein</th>
              <th className="n">Carbs</th>
              <th className="n">Fat</th>
              <th>Category</th>
              {editing && <th />}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map(({ f, i }) =>
              editing ? (
                <tr key={i}>
                  <td>
                    <TextInput ariaLabel="Food name" value={f.name} onChange={(v) => setF(i, 'name', v)} />
                  </td>
                  <td style={{ width: 80 }}>
                    <NumInput ariaLabel="Serving" value={f.amount} onChange={(v) => setF(i, 'amount', v ?? 0)} />
                  </td>
                  <td style={{ width: 80 }}>
                    <TextInput ariaLabel="Unit" value={f.unit} onChange={(v) => setF(i, 'unit', v)} />
                  </td>
                  {(['kcal', 'pro', 'cho', 'fat'] as const).map((k) => (
                    <td key={k} style={{ width: 80 }}>
                      <NumInput ariaLabel={k} value={f[k]} onChange={(v) => setF(i, k, v ?? 0)} />
                    </td>
                  ))}
                  <td style={{ width: 110 }}>
                    <Select ariaLabel="Category" value={f.category} options={CATEGORIES} onChange={(v) => setF(i, 'category', v)} />
                  </td>
                  <td>
                    <button className="icon-btn" aria-label="Delete food" onClick={() => update((d) => void d.foods.splice(i, 1))}>
                      ×
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={i}>
                  <td>{f.name}</td>
                  <td className="n num">{num(f.amount, 1)}</td>
                  <td>{f.unit}</td>
                  <td className="n num">{num(f.kcal)}</td>
                  <td className="n num">{isNum(f.pro) ? num(f.pro, 1) : ''}</td>
                  <td className="n num">{isNum(f.cho) ? num(f.cho, 1) : ''}</td>
                  <td className="n num">{isNum(f.fat) ? num(f.fat, 1) : ''}</td>
                  <td>
                    <span className="pill">{f.category}</span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {list.length > limit && (
        <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({list.length - limit} left)
        </button>
      )}
    </>
  );
}
