import { useState } from 'react';
import { useApp } from '../context';
import type { Supplement } from '../types';
import { safeHref, uid } from '../lib/calc';
import { Empty, TextInput } from '../components/ui';

export function Supplements() {
  const { client, updateClient } = useApp();
  const [editing, setEditing] = useState(false);
  const set = (i: number, k: keyof Supplement, v: string) => updateClient((c) => void (c.supplements[i][k] = v));
  const add = () => {
    updateClient((c) => void c.supplements.push({ id: uid('sup'), name: '', dose: '', timing: '', notes: '', link: '' }));
    setEditing(true);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Recommendations</div>
          <h1>Supplements</h1>
        </div>
        <div className="row">
          {editing && (
            <button className="btn" onClick={add}>
              Add supplement
            </button>
          )}
          <button className={`btn ${editing ? 'primary' : ''}`} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done editing' : 'Edit'}
          </button>
        </div>
      </div>
      {!client.supplements.length ? (
        <Empty title="No supplements recommended">
          <button className="btn primary" onClick={add}>
            Add a supplement
          </button>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className={editing ? 'grid-table' : undefined}>
            <thead>
              <tr>
                <th>Supplement</th>
                <th>Dose</th>
                <th>When</th>
                <th>Why</th>
                <th>Where to buy</th>
                {editing && <th />}
              </tr>
            </thead>
            <tbody>
              {client.supplements.map((s, i) =>
                editing ? (
                  <tr key={s.id}>
                    {(['name', 'dose', 'timing', 'notes', 'link'] as const).map((k) => (
                      <td key={k} style={{ minWidth: k === 'notes' || k === 'link' ? 200 : 120 }}>
                        <TextInput ariaLabel={k} value={s[k]} placeholder={k === 'link' ? 'https://' : ''} onChange={(v) => set(i, k, v)} />
                      </td>
                    ))}
                    <td>
                      <button className="icon-btn" aria-label="Remove" onClick={() => updateClient((c) => void c.supplements.splice(i, 1))}>
                        ×
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                    </td>
                    <td>{s.dose}</td>
                    <td>{s.timing}</td>
                    <td className="small ink2" style={{ whiteSpace: 'pre-line' }}>
                      {s.notes}
                    </td>
                    <td>
                      {safeHref(s.link) ? (
                        <a href={safeHref(s.link)} target="_blank" rel="noreferrer">
                          Open link ↗
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">Check new supplements with a doctor or pharmacist, especially alongside medication or during pregnancy.</p>
    </>
  );
}
