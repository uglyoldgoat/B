import { useRef, useState } from 'react';
import { useApp } from '../context';
import type { AppData, Exercise, Food } from '../types';
import { blankClient } from '../lib/clients';
import { formatDate, lastLoggedWeek, localDate, mergeLibrary, toISODate } from '../lib/calc';
import { deletePhoto, getPhoto, putPhoto, storageAvailable } from '../lib/store';
import { importFile } from '../lib/importer';
import { Block, ConfirmButton } from '../components/ui';

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

async function dataUrlToBlob(u: string): Promise<Blob> {
  return (await fetch(u)).blob();
}

interface Backup {
  app: 'coachbook';
  exportedAt: string;
  data: AppData;
  photos?: Record<string, string>;
}

export function DataView() {
  const { data, client, update, notify, go } = useApp();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [withPhotos, setWithPhotos] = useState(false);
  const [backupText, setBackupText] = useState('');
  const xlsx = useRef<HTMLInputElement>(null);
  const json = useRef<HTMLInputElement>(null);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(`Reading ${file.name}…`);
    try {
      const r = await importFile(file);
      for (const p of r.photos) {
        const key = `${r.client.id}/${p.week}/${p.pose}/i`;
        await putPhoto(key, new Blob([p.data as BlobPart], { type: p.type }));
        r.client.photos[`${p.week}-${p.pose}`] = key;
      }
      update((d) => {
        d.clients = d.clients.filter((c) => !c.isSample);
        d.clients.push(r.client);
        d.activeClientId = r.client.id;
        if (r.exercises.length) d.exercises = mergeLibrary<Exercise>(d.exercises, r.exercises);
        if (r.foods.length) d.foods = mergeLibrary<Food>(d.foods, r.foods);
      });
      notify(`Imported ${r.client.profile.name || 'client'}: ${Object.keys(r.client.checkIns).length} weeks of check-ins, ${r.photos.length} photos`);
      go('overview');
    } catch (e) {
      setError(`Couldn't read that file. Make sure it's an .xlsx workbook made from the coaching template (in Google Sheets: File → Download → Microsoft Excel). Details: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy('');
    }
  };

  const buildBackup = async (): Promise<string> => {
    const backup: Backup = { app: 'coachbook', exportedAt: new Date().toISOString(), data };
    if (withPhotos) {
      backup.photos = {};
      for (const c of data.clients) {
        for (const key of Object.values(c.photos)) {
          const b = await getPhoto(key);
          if (b) backup.photos[key] = await blobToDataUrl(b);
        }
      }
    }
    return JSON.stringify(backup);
  };

  const download = async () => {
    setBusy('Preparing backup…');
    try {
      const text = await buildBackup();
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `coachbook-backup-${toISODate(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      notify('Backup downloaded');
    } finally {
      setBusy('');
    }
  };

  const copy = async () => {
    const text = await buildBackup();
    try {
      await navigator.clipboard.writeText(text);
      notify('Backup copied to the clipboard');
    } catch {
      setBackupText(text);
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const b = JSON.parse(await file.text()) as Backup;
      if (b.app !== 'coachbook' || !b.data?.clients) throw new Error('This is not a Coachbook backup file.');
      if (b.photos) for (const [k, u] of Object.entries(b.photos)) await putPhoto(k, await dataUrlToBlob(u));
      update((d) => {
        const ids = new Set(b.data.clients.map((c) => c.id));
        d.clients = [...d.clients.filter((c) => !ids.has(c.id) && !c.isSample), ...b.data.clients];
        d.activeClientId = b.data.activeClientId && ids.has(b.data.activeClientId) ? b.data.activeClientId : d.clients[0].id;
        d.exercises = mergeLibrary(d.exercises, b.data.exercises ?? []);
        d.foods = mergeLibrary(d.foods, b.data.foods ?? []);
      });
      notify(`Restored ${b.data.clients.length} client(s)`);
    } catch (e) {
      setError(`Couldn't restore: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Coach</div>
          <h1>Settings & data</h1>
          <p>Everything is stored in this browser only. Nothing is uploaded anywhere.</p>
        </div>
      </div>

      {!storageAvailable && (
        <div className="banner">
          <span className="grow">This browser isn't letting the app save data (private window or blocked storage). Changes will be lost when the page closes. Download a backup before leaving.</span>
        </div>
      )}
      {error && (
        <div className="banner" role="alert" style={{ background: 'var(--bad-soft)' }}>
          <span className="grow">{error}</span>
        </div>
      )}

      <Block title="Import a client workbook" eyebrow="From the coaching spreadsheet template">
        <div className="card stack" style={{ gap: 10 }}>
          <p className="ink2" style={{ maxWidth: '68ch' }}>
            Choose a client's <b>.xlsx</b> file. The app reads the Dashboard, Timeline, Check-In, Training, Logbook, Meal Plan, Photos, Supplements and the exercise and food databases. From Google Sheets, use File → Download → Microsoft Excel first.
          </p>
          <div className="row">
            <button className="btn primary" disabled={!!busy} onClick={() => xlsx.current?.click()}>
              {busy || 'Choose workbook…'}
            </button>
            <button
              className="btn"
              onClick={() => {
                const c = blankClient();
                update((d) => {
                  d.clients = d.clients.filter((x) => !x.isSample);
                  d.clients.push(c);
                  d.activeClientId = c.id;
                });
                go('overview');
              }}
            >
              Start a blank client
            </button>
          </div>
          <input ref={xlsx} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </Block>

      <Block title="Clients">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Goal</th>
                <th className="n">Weeks logged</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.id} className={c.id === client.id ? 'current' : undefined}>
                  <td>
                    <b>{c.profile.name || 'Unnamed'}</b>
                    {c.isSample && <span className="pill" style={{ marginLeft: 6 }}>sample</span>}
                  </td>
                  <td className="small">{c.profile.goal}</td>
                  <td className="n num">{lastLoggedWeek(c)}</td>
                  <td className="small muted">{c.importedFrom ? `${c.importedFrom}, ${formatDate(localDate(c.importedAt))}` : c.isSample ? 'Made-up data' : 'Created here'}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      {c.id !== client.id && (
                        <button className="btn small" onClick={() => update((d) => void (d.activeClientId = c.id))}>
                          Open
                        </button>
                      )}
                      <ConfirmButton
                        label="Delete"
                        confirmLabel="Click again to delete"
                        onConfirm={() => {
                          for (const key of Object.values(c.photos)) void deletePhoto(key);
                          update((d) => {
                            d.clients = d.clients.filter((x) => x.id !== c.id);
                            if (!d.clients.length) d.clients.push(blankClient());
                            if (!d.clients.some((x) => x.id === d.activeClientId)) d.activeClientId = d.clients[0].id;
                          });
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block title="Backup & restore">
        <div className="card stack" style={{ gap: 10 }}>
          <p className="ink2" style={{ maxWidth: '68ch' }}>
            Browser storage can be cleared, so download a backup regularly. Use a backup to move data to another device or browser.
          </p>
          <label className="row small">
            <input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
            Include progress photos (larger file)
          </label>
          <div className="row">
            <button className="btn primary" disabled={!!busy} onClick={() => void download()}>
              Download backup
            </button>
            <button className="btn" onClick={() => void copy()}>
              Copy backup
            </button>
            <button className="btn" onClick={() => json.current?.click()}>
              Restore from backup…
            </button>
            <input ref={json} type="file" hidden accept=".json,application/json" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {backupText && (
            <label className="field">
              <span className="lbl">Copy this text and save it in a file</span>
              <textarea readOnly rows={4} value={backupText} onFocus={(e) => e.currentTarget.select()} />
            </label>
          )}
        </div>
      </Block>

      <Block title="This device">
        <div className="card stack" style={{ gap: 10 }}>
          <p className="ink2">This device is set up for a <b>coach</b>. A client's phone should be set up for a client instead: open the app there and choose “I'm a client”.</p>
          <div>
            <ConfirmButton
              className="btn small"
              label="Switch this device to client mode"
              confirmLabel={`Click again: show ${client.profile.name || 'this client'}'s app`}
              onConfirm={() => {
                update((d) => void (d.mode = 'client'));
                go('today');
              }}
            />
          </div>
        </div>
      </Block>
    </>
  );
}
