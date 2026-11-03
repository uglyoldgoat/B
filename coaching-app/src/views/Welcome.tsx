import { useState } from 'react';
import type { AppData } from '../types';
import { blankClient } from '../lib/clients';
import { SAMPLE_EXERCISES, SAMPLE_FOODS, makeSampleData } from '../lib/sample';
import { ImportPackage } from '../components/exchange';
import { TextInput } from '../components/ui';
import { BrandMark, Icon } from '../components/icons';

const EMPTY: AppData = { version: 1, activeClientId: '', clients: [], exercises: [], foods: [] };

/** First run: who uses this device. */
export function Welcome({ onStart }: { onStart: (d: AppData) => void }) {
  const [step, setStep] = useState<'role' | 'client'>('role');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  if (step === 'client') {
    // A client device starts with the standard libraries; the coach's file adds theirs.
    const base: AppData = { ...EMPTY, mode: 'client', exercises: SAMPLE_EXERCISES, foods: SAMPLE_FOODS };
    return (
      <main className="welcome">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Set up</span>
          <h1>Your coaching app</h1>
          <p className="ink2">Your coach sends you a file with your plan. Open it here and everything is set up for you.</p>
        </div>
        <section className="card stack" style={{ gap: 12 }}>
          <h2>Open the file from your coach</h2>
          <p className="small ink2">Save the file from WhatsApp or email to your phone first, then choose it here.</p>
          <ImportPackage
            data={base}
            label="Choose the file"
            apply={(recipe) => {
              const next = structuredClone(base);
              recipe(next);
              onStart(next);
            }}
            onResult={(r) => setMsg(`Welcome, ${r.clientName}.`)}
          />
          {msg && <p className="small">{msg}</p>}
        </section>
        <section className="card stack" style={{ gap: 12 }}>
          <h2>No file yet?</h2>
          <p className="small ink2">Start logging now. When your coach's file arrives, open it from More → Files from your coach. Your logs are kept.</p>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <TextInput ariaLabel="Your first name" placeholder="Your first name" value={name} onChange={setName} />
            <button
              className="btn"
              disabled={!name.trim()}
              onClick={() => {
                const c = blankClient(name.trim());
                onStart({ ...base, clients: [c], activeClientId: c.id });
              }}
            >
              Start
            </button>
          </div>
        </section>
        <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setStep('role')}>
          ‹ Back
        </button>
      </main>
    );
  }

  return (
    <main className="welcome">
      <div className="welcome-hero">
        <BrandMark size={56} />
        <span className="brand-mark">
          Coach<span>book</span>
        </span>
        <p className="ink2">Check-ins, workouts, meal plans and progress for online coaching.</p>
      </div>
      <h2>Who will use this app on this device?</h2>
      <div className="role-grid">
        <button className="role" onClick={() => setStep('client')}>
          <span className="role-icon">
            <Icon name="today" />
          </span>
          <span className="role-title">I'm a client</span>
          <span className="role-text">Log your day in a minute, see today's workout and meals, and send your check-in to your coach.</span>
        </button>
        <button
          className="role"
          onClick={() => {
            const d = makeSampleData();
            onStart({ ...d, mode: 'coach' });
          }}
        >
          <span className="role-icon">
            <Icon name="clients" />
          </span>
          <span className="role-title">I'm a coach</span>
          <span className="role-text">See all your clients, review weekly check-ins, and send plans and feedback. Opens with a sample client to explore.</span>
        </button>
      </div>
      <p className="small muted">Everything stays on this device. Nothing is uploaded.</p>
    </main>
  );
}
