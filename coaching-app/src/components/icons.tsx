// Small line icons for the client tab bar. Stroke follows the text colour.

const paths: Record<string, string> = {
  today: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  log: 'M8 4h8M9 4v2h6V4M6 6h12v15H6zM9 11l2 2 4-4M9 17h6',
  workout: 'M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12',
  meals: 'M4 12h16a8 8 0 0 1-16 0zM9 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4',
  progress: 'M4 19h16M6 16l4-5 3 3 5-7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.more} />
    </svg>
  );
}
