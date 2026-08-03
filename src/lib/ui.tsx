import type { CSSProperties } from 'react';
import type { Status } from '../data/model';
import { codeSegs } from '../data/model';

const tagBase: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px',
  fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', whiteSpace: 'nowrap'
};

const STATUS_STYLE: Record<Status, CSSProperties> = {
  'Submitted': { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)' },
  'Scheduled': { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' },
  'In Build': { background: 'var(--color-accent)', color: '#fff' },
  'Ready': { background: 'var(--color-neutral-800)', color: '#fff' },
  'Closed': { background: 'transparent', color: 'var(--color-neutral-600)', border: '1px solid var(--color-neutral-400)' }
};

export function StatusTag({ s }: { s: Status }) {
  return <span style={{ ...tagBase, ...STATUS_STYLE[s] }}>{s}</span>;
}

export function PrioTag({ p }: { p: 'Standard' | 'Hot' }) {
  const st: CSSProperties = p === 'Hot'
    ? { background: 'var(--color-accent-700)', color: '#fff' }
    : { background: 'transparent', color: 'var(--color-neutral-600)', border: '1px solid var(--color-neutral-400)' };
  return <span style={{ ...tagBase, ...st }}>{p}</span>;
}

// Build code strip — boxed segments; blanks render as empty boxes, never fillers.
export function CodeStrip({ id, opts, size }: {
  id: string; opts: Record<string, string | string[]>; size: 'drawer' | 'ticket' | 'review' | 'cart';
}) {
  const segs = codeSegs(id, opts);
  if (!segs.length) return null;
  return (
    <span className={`code-strip code-${size}`}>
      {segs.map((s, i) => <span key={i} className="seg">{s.v}</span>)}
    </span>
  );
}

export function Thumb({ id, title, size, onZoom }: {
  id: string; title: string; size?: number; onZoom?: () => void;
}) {
  const style: CSSProperties = { backgroundImage: `url(assets/asm-${id}.png)` };
  if (size) { style.width = size; style.height = size; }
  if (onZoom) {
    return <button type="button" className="thumb" style={style} aria-label={`Zoom ${title}`} onClick={onZoom} />;
  }
  return <span className="thumb" style={{ ...style, display: 'inline-block', cursor: 'default' }} role="img" aria-label={title} />;
}
