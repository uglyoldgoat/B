// Small line icons (24 × 24 grid). Stroke follows the text colour.

const paths: Record<string, string> = {
  // client tabs
  today: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  log: 'M8 4h8M9 4v2h6V4M6 6h12v15H6zM9 11l2 2 4-4M9 17h6',
  workout: 'M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12',
  meals: 'M4 12h16a8 8 0 0 1-16 0zM9 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4',
  progress: 'M4 19h16M6 16l4-5 3 3 5-7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  // coach sections
  clients: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5c1.9.8 3.2 2.8 3.5 5.5',
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  review: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  checkin: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01',
  timeline: 'M4 19h16M6 16l4-5 3 3 5-7',
  training: 'M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12',
  logbook: 'M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM9 3v18M12 8h3M12 12h3',
  nutrition: 'M4 12h16a8 8 0 0 1-16 0zM9 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4',
  photos: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  supplements: 'M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7zM7 10l7 7',
  library: 'M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM20 19v2H6M8 7h8',
  data: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  // actions
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  close: 'M6 6l12 12M18 6 6 18',
};

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.more} />
    </svg>
  );
}

/** The app mark: a loaded bar seen end-on, on the brand colour. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="brand-glyph">
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <g fill="var(--accent-ink)">
        <rect x="10" y="26" width="6" height="12" rx="2" />
        <rect x="48" y="26" width="6" height="12" rx="2" />
        <rect x="17" y="19" width="7" height="26" rx="2" />
        <rect x="40" y="19" width="7" height="26" rx="2" />
        <rect x="24" y="30" width="16" height="4" />
      </g>
    </svg>
  );
}
