import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { currentWeek, formatDate, weekStart } from '../lib/calc';
import { deletePhoto, getPhoto, putPhoto } from '../lib/store';
import { Block, TextInput } from '../components/ui';

function usePhotoUrl(key: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    if (key) {
      void getPhoto(key).then((blob) => {
        if (!alive || !blob) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      });
    }
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key]);
  return url;
}

/** Shrink large phone photos so storage stays small. Falls back to the original. */
async function shrink(file: Blob, max = 1600): Promise<Blob> {
  try {
    if (typeof createImageBitmap === 'undefined') return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
    return out ?? file;
  } catch {
    return file;
  }
}

function PhotoCell({ photoKey, label, onPick, onRemove }: { photoKey?: string; label: string; onPick: () => void; onRemove?: () => void }) {
  const url = usePhotoUrl(photoKey);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className={`photo ${url ? 'has' : ''}`} onClick={onPick} aria-label={url ? `Replace ${label}` : `Add ${label}`} style={{ width: '100%' }}>
        {url ? <img src={url} alt={label} /> : <span>+ Add</span>}
        {url && <span className="cap">{label}</span>}
      </button>
      {url && onRemove && (
        <button type="button" className="icon-btn" aria-label={`Remove ${label}`} onClick={onRemove} style={{ position: 'absolute', top: 4, right: 4, background: 'var(--surface)' }}>
          ×
        </button>
      )}
    </div>
  );
}

export function CompareImage({ photoKey, label }: { photoKey?: string; label: string }) {
  const url = usePhotoUrl(photoKey);
  return (
    <figure style={{ margin: 0 }} className="stack">
      <div className={`photo ${url ? 'has' : ''}`} style={{ cursor: 'default' }}>
        {url ? <img src={url} alt={label} /> : <span>No photo</span>}
      </div>
      <figcaption className="small muted">{label}</figcaption>
    </figure>
  );
}

/** `simple` is the client version: this week's photos and a comparison only. */
export function Photos({ embedded = false, simple = false }: { embedded?: boolean; simple?: boolean }) {
  const { client, updateClient, notify } = useApp();
  const now = currentWeek(client.week1Date) ?? 1;
  const photoWeeks = Object.keys(client.photos).map((k) => Number(k.split('-')[0]));
  const lastPhotoWeek = Math.max(0, ...photoWeeks);
  const firstPhotoWeek = photoWeeks.length ? Math.min(...photoWeeks) : 1;
  const [a, setA] = useState(firstPhotoWeek);
  const [b, setB] = useState(Math.max(lastPhotoWeek, 1));
  const [editPoses, setEditPoses] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<{ week: number; pose: number } | null>(null);
  const weeks = Math.max(now, lastPhotoWeek, 1);
  const poses = client.photoPoses;
  const usedPoses = poses.map((_, i) => i).filter((i) => Object.keys(client.photos).some((k) => k.endsWith(`-${i}`)));
  const shownPoses = usedPoses.length ? usedPoses : [0, 1, 2];

  const pick = (week: number, pose: number) => {
    target.current = { week, pose };
    input.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    const t = target.current;
    if (!file || !t) return;
    const slot = `${t.week}-${t.pose}`;
    const old = client.photos[slot];
    // A fresh key per upload makes the thumbnail reload when a photo is replaced.
    const key = `${client.id}/${t.week}/${t.pose}/${Date.now().toString(36)}`;
    await putPhoto(key, await shrink(file));
    updateClient((c) => {
      c.photos[slot] = key;
    });
    if (old && old !== key) void deletePhoto(old);
    notify(`Saved ${poses[t.pose]} for week ${t.week}`);
  };

  const weekOptions = Array.from({ length: weeks }, (_, i) => i + 1);

  return (
    <>
      {!embedded && (
        <div className="page-head">
          <div>
            <div className="eyebrow">Progress photos</div>
            <h1>Photos</h1>
            <p>Photos stay in this browser. Take them in the same light, place and time of day each week.</p>
          </div>
        </div>
      )}
      {simple && (
        <Block title={`This week's photos (week ${now})`} eyebrow="Same place, same light, first thing in the morning">
          <div className="photo-grid">
            {shownPoses.map((p) => (
              <div key={p} className="stack" style={{ gap: 4 }}>
                <span className="small ink2">{poses[p]}</span>
                <PhotoCell photoKey={client.photos[`${now}-${p}`]} label={`${poses[p]}, week ${now}`} onPick={() => pick(now, p)} />
              </div>
            ))}
          </div>
        </Block>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <Block
        title="Compare weeks"
        actions={
          <div className="row">
            <label className="row small">
              From
              <select style={{ width: 'auto' }} value={a} onChange={(e) => setA(Number(e.target.value))}>
                {weekOptions.map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
            </label>
            <label className="row small">
              to
              <select style={{ width: 'auto' }} value={b} onChange={(e) => setB(Number(e.target.value))}>
                {weekOptions.map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      >
        {Object.keys(client.photos).length ? (
          <div className="compare">
            {shownPoses.map((p) => (
              <div key={p} className="stack" style={{ gap: 6 }}>
                <b>{poses[p]}</b>
                <div className="pair">
                  <CompareImage photoKey={client.photos[`${a}-${p}`]} label={`Week ${a} · ${formatDate(weekStart(client.week1Date, a))}`} />
                  <CompareImage photoKey={client.photos[`${b}-${p}`]} label={`Week ${b} · ${formatDate(weekStart(client.week1Date, b))}`} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No photos yet. Add your first set{simple ? ' above' : ' below'}, then compare any two weeks here.</p>
        )}
      </Block>

      {!simple && (
        <>
      <Block
        title="All photos"
        actions={
          <button className="btn small" onClick={() => setEditPoses((v) => !v)}>
            {editPoses ? 'Done' : 'Rename poses'}
          </button>
        }
      >
        {editPoses && (
          <div className="fields">
            {poses.map((p, i) => (
              <label key={i} className="field">
                <span className="lbl">Pose {i + 1}</span>
                <TextInput value={p} onChange={(v) => updateClient((c) => void (c.photoPoses[i] = v))} />
              </label>
            ))}
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="sticky">Week</th>
                {poses.map((p, i) => (
                  <th key={i} style={{ minWidth: 120 }}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: weeks }, (_, i) => weeks - i).map((w) => (
                <tr key={w} className={w === now ? 'current' : undefined}>
                  <td className="sticky small" style={{ whiteSpace: 'nowrap' }}>
                    <b>Week {w}</b>
                    <div className="muted">{formatDate(weekStart(client.week1Date, w))}</div>
                  </td>
                  {poses.map((p, i) => (
                    <td key={i} style={{ width: 130 }}>
                      <PhotoCell
                        photoKey={client.photos[`${w}-${i}`]}
                        label={`${p}, week ${w}`}
                        onPick={() => pick(w, i)}
                        onRemove={() => {
                          const key = client.photos[`${w}-${i}`];
                          if (key) void deletePhoto(key);
                          updateClient((c) => void delete c.photos[`${w}-${i}`]);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
        </>
      )}
    </>
  );
}
