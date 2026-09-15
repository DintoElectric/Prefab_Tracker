import { bendGeometry, type BendInput } from '../data/bends';

// To-scale shop sketch of the bend, drawn from bendGeometry(). Inches come in
// with y measured UP from the baseline; we flip y for SVG and scale uniformly so
// the drawing stays true to the real proportions.
export function BendDiagram({ input }: { input: BendInput }) {
  const g = bendGeometry(input);
  if (!g.path.length) return null;

  const PAD = 48;
  const scale = Math.min(560 / g.w, 300 / Math.max(g.h, 2));
  const W = g.w * scale + PAD * 2;
  const H = g.h * scale + PAD * 2;

  const X = (x: number) => PAD + x * scale;
  const Y = (y: number) => H - PAD - y * scale;

  const pts = g.path.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');

  const ink = 'var(--color-text)';
  const accent = 'var(--color-accent)';
  const muted = 'var(--color-neutral-600)';
  const hair = 'var(--color-neutral-400)';

  return (
    <svg viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`} width="100%"
      style={{ display: 'block', maxHeight: 360, background: '#fff' }}
      role="img" aria-label="Bend diagram to scale">

      {/* baseline / floor reference */}
      <line x1={X(0)} y1={Y(0)} x2={X(g.w)} y2={Y(0)}
        style={{ stroke: hair }} strokeWidth={1} strokeDasharray="5 4" />

      {/* conduit centerline */}
      <polyline points={pts} fill="none" style={{ stroke: accent }}
        strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />

      {/* bend vertices + angle labels */}
      {g.verts.map((v, i) => (
        <g key={'v' + i}>
          <circle cx={X(v.x)} cy={Y(v.y)} r={3.5} style={{ fill: ink }} />
          <text x={X(v.x)} y={Y(v.y) - 10} textAnchor="middle"
            style={{ fill: ink }} fontSize={12.5} fontWeight={700} fontFamily="var(--font-heading)">{v.label}</text>
        </g>
      ))}

      {/* dimension lines */}
      {g.dims.map((d, i) => {
        const x1 = X(d.x1), y1 = Y(d.y1), x2 = X(d.x2), y2 = Y(d.y2);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const isV = d.axis === 'v';
        const lblW = d.label.length * 7 + 10;
        // extension ticks perpendicular to the dimension line
        const tick = 5;
        return (
          <g key={'d' + i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: muted }} strokeWidth={1} />
            {isV ? (
              <>
                <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} style={{ stroke: muted }} strokeWidth={1} />
                <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} style={{ stroke: muted }} strokeWidth={1} />
                <rect x={x1 + 6} y={my - 9} width={lblW} height={18} fill="#fff" />
                <text x={x1 + 6 + lblW / 2} y={my + 4} textAnchor="middle"
                  style={{ fill: ink }} fontSize={12} fontWeight={700}>{d.label}</text>
              </>
            ) : (
              <>
                <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} style={{ stroke: muted }} strokeWidth={1} />
                <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} style={{ stroke: muted }} strokeWidth={1} />
                <rect x={mx - lblW / 2} y={my - 20} width={lblW} height={18} fill="#fff" />
                <text x={mx} y={my - 7} textAnchor="middle"
                  style={{ fill: ink }} fontSize={12} fontWeight={700}>{d.label}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
