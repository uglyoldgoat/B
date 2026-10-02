// Sending and receiving files between coach and client.

import { useRef, useState } from 'react';
import { produce } from 'immer';
import type { AppData, Client, Exercise, Food } from '../types';
import { currentWeek } from '../lib/calc';
import { getPhoto, putPhoto } from '../lib/store';
import {
  applyPackage,
  buildClientUpdate,
  buildSetupPack,
  packageFileName,
  parsePackage,
  shareText,
  type ApplyResult,
  type Package,
} from '../lib/share';

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** Open a file (or pasted text) from the coach or a client. */
export function ImportPackage({
  data,
  apply,
  onResult,
  label = 'Open file…',
  primary = true,
}: {
  data: AppData;
  apply: (recipe: (d: AppData) => void) => void;
  onResult: (r: ApplyResult) => void;
  label?: string;
  primary?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');

  const run = async (raw: string) => {
    setError('');
    setBusy(true);
    try {
      const pkg: Package = parsePackage(raw);
      const keys = new Set<string>();
      if (pkg.kind === 'client-update' && pkg.photos) {
        for (const [key, url] of Object.entries(pkg.photos)) {
          const blob = await (await fetch(url)).blob();
          await putPhoto(key, blob);
          keys.add(key);
        }
      }
      // Work out the result on the current data, then apply for real.
      let result!: ApplyResult;
      produce(data, (d) => {
        result = applyPackage(d, pkg, keys);
      });
      apply((d) => void applyPackage(d, pkg, keys));
      onResult(result);
      setText('');
      setPasting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <button className={`btn ${primary ? 'primary' : ''}`} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Opening…' : label}
        </button>
        <button className="btn ghost small" onClick={() => setPasting((p) => !p)}>
          {pasting ? 'Cancel' : 'Paste text instead'}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept=".txt,.json,text/plain,application/json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) await run(await f.text());
        }}
      />
      {pasting && (
        <div className="stack" style={{ gap: 6 }}>
          <label className="sr-only" htmlFor="paste-package">
            Paste the text from the file
          </label>
          <textarea id="paste-package" rows={4} placeholder="Paste the whole text here" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn small" style={{ alignSelf: 'flex-start' }} disabled={!text.trim() || busy} onClick={() => void run(text)}>
            Open pasted text
          </button>
        </div>
      )}
      {error && (
        <p className="small" role="alert" style={{ color: 'var(--bad)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Share a client update (from a client) or a plan (from the coach). */
export function SendPackage({
  kind,
  client,
  exercises = [],
  foods = [],
  label,
  onSent,
  primary = true,
}: {
  kind: Package['kind'];
  client: Client;
  exercises?: Exercise[];
  foods?: Food[];
  label: string;
  onSent: (message: string) => void;
  primary?: boolean;
}) {
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState('');
  const week = currentWeek(client.week1Date) ?? 1;
  const recentPhotos = Object.entries(client.photos).filter(([slot]) => Number(slot.split('-')[0]) >= week - 1);

  const send = async () => {
    setBusy(true);
    setFallback('');
    try {
      let text: string;
      if (kind === 'client-update') {
        const photos: Record<string, string> = {};
        if (withPhotos) {
          for (const [, key] of recentPhotos) {
            const b = await getPhoto(key);
            if (b) photos[key] = await blobToDataUrl(b);
          }
        }
        text = JSON.stringify(buildClientUpdate(client, Object.keys(photos).length ? photos : undefined));
      } else {
        text = JSON.stringify(buildSetupPack(client, exercises, foods));
      }
      const name = packageFileName(client, kind);
      const outcome = await shareText(name, text, kind === 'client-update' ? 'Check-in for my coach' : 'Your coaching plan');
      if (outcome === 'shared') onSent('Sent');
      else if (outcome === 'downloaded') onSent(`Saved ${name}. Send that file on WhatsApp or by email.`);
      else if (outcome === 'failed') setFallback(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <button className={`btn ${primary ? 'primary' : ''}`} disabled={busy} onClick={() => void send()}>
        {busy ? 'Preparing…' : label}
      </button>
      {kind === 'client-update' && recentPhotos.length > 0 && (
        <label className="row small ink2">
          <input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
          Include {recentPhotos.length} recent photo{recentPhotos.length === 1 ? '' : 's'}
        </label>
      )}
      {fallback && (
        <div className="field">
          <label className="lbl" htmlFor="send-fallback">
            This browser can't share files. Copy this text and send it in a message instead.
          </label>
          <textarea id="send-fallback" readOnly rows={4} value={fallback} onFocus={(e) => e.currentTarget.select()} />
          <button
            className="btn small"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              navigator.clipboard?.writeText(fallback).then(
                () => onSent('Copied. Paste it into a message to send it.'),
                () => undefined,
              );
            }}
          >
            Copy text
          </button>
        </div>
      )}
    </div>
  );
}
