import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Num } from '../types';

export function Field({ label, hint, children, id }: { label: string; hint?: string; children: ReactNode; id?: string }) {
  return (
    <div className="field">
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      {hint && <span className="hint">{hint}</span>}
      {children}
    </div>
  );
}

/** Number input that keeps partial typing ("52.") and commits numbers or null. */
export function NumInput({
  value,
  onChange,
  step,
  min,
  placeholder,
  className,
  id,
  ariaLabel,
}: {
  value: Num | undefined;
  onChange: (v: Num) => void;
  step?: number;
  min?: number;
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === null || value === undefined ? '' : String(value));
  }, [value]);
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className={className}
      type="number"
      inputMode="decimal"
      step={step ?? 'any'}
      min={min}
      placeholder={placeholder}
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(value === null || value === undefined ? '' : String(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.trim();
        if (t === '') onChange(null);
        else {
          const n = Number(t);
          if (Number.isFinite(n)) onChange(n);
        }
      }}
    />
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  className,
  id,
  ariaLabel,
  list,
  type = 'text',
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
  list?: string;
  type?: string;
}) {
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className={className}
      type={type}
      list={list}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 2,
  className,
  id,
  ariaLabel,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <textarea
      id={id}
      aria-label={ariaLabel}
      className={className}
      rows={rows}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select({
  value,
  options,
  onChange,
  className,
  id,
  ariaLabel,
  placeholder = '—',
}: {
  value: string | undefined;
  options: readonly string[];
  onChange: (v: string) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select id={id} aria-label={ariaLabel} className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** 1–N rating as a row of toggle buttons. Clicking the active value clears it.
 * With `words`, the meaning of the chosen point is shown next to it. */
export function Scale({
  value,
  max,
  onChange,
  label,
  words,
  big,
}: {
  value: Num | undefined;
  max: number;
  onChange: (v: Num) => void;
  label: string;
  words?: string[];
  big?: boolean;
}) {
  const chosen = typeof value === 'number' ? words?.[value - 1] : undefined;
  return (
    <div className="scale">
      <div className={`seg ${big ? 'big' : ''}`} role="group" aria-label={label}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" aria-pressed={value === n} title={words?.[n - 1]} onClick={() => onChange(value === n ? null : n)}>
            {n}
          </button>
        ))}
      </div>
      {words && (
        <span className={`scale-word ${chosen ? 'on' : ''}`}>
          {chosen ?? `1 = ${words[0].toLowerCase()}, ${max} = ${words[max - 1].toLowerCase()}`}
        </span>
      )}
    </div>
  );
}

export function Choice({
  value,
  options,
  onChange,
  label,
  big,
}: {
  value: string | undefined;
  options: string[];
  onChange: (v: string) => void;
  label: string;
  big?: boolean;
}) {
  return (
    <div className={`seg ${big ? 'big' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(value === o ? '' : o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Choose one of a few options, each with an optional second line (e.g. the weekdays it applies to).
 * Up to three options share the width; more scroll sideways with the chosen one kept in view. */
export function Picker({ label, options, value, onChange }: { label: string; options: { id: string; label: string; sub?: string }[]; value: string; onChange: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (box && el) box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
  }, [value]);
  return (
    <div ref={ref} className={`seg big picker ${options.length <= 3 ? 'fill' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          <span>{o.label}</span>
          {o.sub && <span className="sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  delta,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  delta?: { text: string; tone: 'good' | 'bad' | 'flat' } | null;
  children?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">
        {value}
        {unit && value !== '—' && <small>{unit}</small>}
      </span>
      {delta && <span className={`delta ${delta.tone}`}>{delta.text}</span>}
      {sub && <span className="sub">{sub}</span>}
      {children}
    </div>
  );
}

/** A meter with one tick per real unit: a day of the week, a daily item, a set.
 * `marks` labels each tick (e.g. weekday letters); `current` outlines one tick. */
export function Ticks({ on, label, marks, current, size }: { on: boolean[]; label: string; marks?: string[]; current?: number; size?: 'lg' }) {
  return (
    <div className={`ticks ${size ?? ''}`} role="img" aria-label={label} style={{ ['--n' as string]: on.length }}>
      <div className="ticks-bar">
        {on.map((v, i) => (
          <span key={i} className={`${v ? 'on' : ''} ${i === current ? 'now' : ''}`} />
        ))}
      </div>
      {marks && (
        <div className="ticks-marks" aria-hidden="true">
          {marks.map((m, i) => (
            <span key={i} className={i === current ? 'now' : ''}>
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Short weekday labels for the seven days of a check-in week, in the client's order and the phone's language. */
export function weekLetters(week1Date: string | undefined): string[] {
  const parsed = week1Date ? new Date(`${week1Date}T12:00:00`) : null;
  // Without a start date, weeks run Monday to Sunday (1 January 2024 was a Monday).
  const start = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(2024, 0, 1, 12);
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12)));
}

export function Block({ title, eyebrow, actions, children, id }: { title: ReactNode; eyebrow?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="block" id={id}>
      <div className="block-head">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2>{title}</h2>
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

/** Two-step button: the first click arms it, the second confirms. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn danger small' }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export function useUniqueId(prefix: string) {
  const id = useId();
  return `${prefix}-${id.replace(/:/g, '')}`;
}

export function deltaTone(change: number | null, goodWhen: 'down' | 'up' | 'none'): 'good' | 'bad' | 'flat' {
  if (change === null || change === 0 || goodWhen === 'none') return 'flat';
  return (change < 0) === (goodWhen === 'down') ? 'good' : 'bad';
}

export function signed(n: number, digits = 1, unit = ''): string {
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: digits });
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${s}${unit}`;
}
