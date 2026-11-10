import {
  wiremoldGeometry, formatLength, wireColor, wireLengthText, FEED_ENDS, DEVICE_COLORS, sizeLabel,
  type WiremoldBuild, type WireColor
} from '../data/wiremold';

// To-scale shop sketch of one wiremold build, drawn from wiremoldGeometry().
// Lengths are true to scale along the run; the device symbols are enlarged so
// they stay readable. A long run wraps onto extra rows (up to 20 ft each).

const W = 940;            // drawing width
const PADX = 72;          // room beside the run for the feed arrow and its whip / end-cap label
const ROW_H = 160;
const TOP = 12;
const BAR_TOP = 80;       // raceway bar, within a row
const BAR_H = 28;
const DEV_W = 18;
const DEV_H = 50;

const ink = 'var(--color-text)';
const accent = 'var(--color-accent)';
const muted = 'var(--color-neutral-600)';
const hair = 'var(--color-neutral-400)';

export function WiremoldDiagram({ build }: { build: WiremoldBuild }) {
  const g = wiremoldGeometry(build);
  const nRows = g.rows.length;
  const rowIn = g.rows[0].to - g.rows[0].from;
  const innerW = W - PADX * 2;
  const pxIn = Math.min(innerW / rowIn, 26);
  const rowW = rowIn * pxIn;
  const x0 = PADX + (innerW - rowW) / 2;
  const shift = nRows > 1 ? 0 : -26;          // a single row has no caption line above it
  const H = TOP + shift + nRows * ROW_H + 4;

  const X = (row: number, inches: number) => x0 + (inches - g.rows[row].from) * pxIn;
  const barCy = BAR_TOP + BAR_H / 2;            // centerline of the raceway, within a row
  const devTop = barCy - DEV_H / 2;             // top of a device, within a row
  const conductors = build.wire.conductors;
  const feedLeft = build.feed === 'left' || build.feed === 'both';
  const feedRight = build.feed === 'right' || build.feed === 'both';
  const tw = (s: string, size: number) => s.length * size * 0.58;   // rough text width

  // A dimension that crosses a row break is drawn on every row it touches, but
  // its text is printed once — on the widest piece that has room for it.
  const pieceW = (i: number) => X(g.segments[i].row, g.segments[i].to) - X(g.segments[i].row, g.segments[i].from);
  const labelOn = new Map<number, number>();
  g.segments.forEach((s, i) => {
    if (pieceW(i) < tw(s.label, 11.5) + 6) return;
    const cur = labelOn.get(s.dim);
    if (cur === undefined || pieceW(i) > pieceW(cur)) labelOn.set(s.dim, i);
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', background: '#fff' }}
      role="img" aria-label={`Wiremold build, ${formatLength(build.lengthIn)} long with ${build.devices} devices`}>
      {g.rows.map(r => {
        const top = TOP + shift + r.index * ROW_H;
        const y = (n: number) => top + n;
        const xl = X(r.index, r.from), xr = X(r.index, r.to);
        const devs = g.devices.filter(d => d.row === r.index);
        const segs = g.segments.map((s, i) => ({ s, i })).filter(x => x.s.row === r.index);
        const isFirst = r.index === 0, isLast = r.index === nRows - 1;
        return (
          <g key={r.index}>
            {/* row caption for wrapped runs */}
            {nRows > 1 && (
              <text x={xl} y={y(14)} style={{ fill: muted }} fontSize={11.5} fontWeight={700}>
                {formatLength(r.from)} – {formatLength(r.to)}
              </text>
            )}
            {nRows > 1 && !isLast && (
              <text x={xr} y={y(14)} textAnchor="end" style={{ fill: muted }} fontSize={11.5} fontWeight={700}>continues below ↓</text>
            )}

            {/* raceway */}
            <rect x={xl} y={y(BAR_TOP)} width={xr - xl} height={BAR_H} rx={isFirst && isLast ? 3 : 0}
              fill="#ebe7df" style={{ stroke: muted }} strokeWidth={1.2} />

            {/* conductors running the length of the run */}
            {conductors.map((c, i) => {
              const cy = y(BAR_TOP + ((i + 1) * BAR_H) / (conductors.length + 1));
              const col: WireColor = wireColor(c.color);
              return (
                <g key={i}>
                  <line x1={xl + 2} y1={cy} x2={xr - 2} y2={cy} stroke="rgba(32,30,29,.55)" strokeWidth={3.6} strokeLinecap="round" />
                  <line x1={xl + 2} y1={cy} x2={xr - 2} y2={cy} stroke={col.hex} strokeWidth={2.2} strokeLinecap="round" />
                  {col.tracer && (
                    <line x1={xl + 2} y1={cy} x2={xr - 2} y2={cy} stroke={col.tracer} strokeWidth={2.2} strokeDasharray="5 7" />
                  )}
                </g>
              );
            })}

            {/* break marks where a long run wraps */}
            {!isFirst && <path d={`M ${xl - 3},${y(BAR_TOP - 5)} L ${xl + 3},${y(BAR_TOP + BAR_H + 5)}`} style={{ stroke: muted }} strokeWidth={2} />}
            {!isLast && <path d={`M ${xr - 3},${y(BAR_TOP - 5)} L ${xr + 3},${y(BAR_TOP + BAR_H + 5)}`} style={{ stroke: muted }} strokeWidth={2} />}

            {/* feed arrows */}
            {isFirst && feedLeft && <FeedArrow x={xl} cy={y(barCy)} dir="right" whipIn={build.whipIn ?? null} />}
            {isLast && feedRight && <FeedArrow x={xr} cy={y(barCy)} dir="left" whipIn={build.whipIn ?? null} />}

            {/* dimensions: one line per piece, labeled on the first piece only */}
            {segs.map(({ s, i }) => {
              const a = X(r.index, s.from), z = X(r.index, s.to);
              const dy = y(54);
              return (
                <g key={'s' + i}>
                  <line x1={a} y1={dy} x2={z} y2={dy} style={{ stroke: muted }} strokeWidth={1} />
                  {s.startsHere
                    ? <line x1={a} y1={dy - 5} x2={a} y2={dy + 5} style={{ stroke: muted }} strokeWidth={1} />
                    : <path d={`M ${a + 6},${dy - 3} L ${a},${dy} L ${a + 6},${dy + 3}`} fill="none" style={{ stroke: muted }} strokeWidth={1} />}
                  {s.endsHere
                    ? <line x1={z} y1={dy - 5} x2={z} y2={dy + 5} style={{ stroke: muted }} strokeWidth={1} />
                    : <path d={`M ${z - 6},${dy - 3} L ${z},${dy} L ${z - 6},${dy + 3}`} fill="none" style={{ stroke: muted }} strokeWidth={1} />}
                  {labelOn.get(s.dim) === i && (
                    <text x={(a + z) / 2} y={dy - 7} textAnchor="middle" style={{ fill: ink }} fontSize={11.5} fontWeight={700}>{s.label}</text>
                  )}
                </g>
              );
            })}

            {/* extension lines from each device up to the dimension line */}
            {devs.map(d => (
              <line key={'e' + d.index} x1={X(r.index, d.at)} y1={y(54)} x2={X(r.index, d.at)} y2={y(devTop)}
                style={{ stroke: hair }} strokeWidth={1} />
            ))}

            {/* devices */}
            {devs.map((d, k) => {
              const cx = X(r.index, d.at);
              const dTop = y(devTop);
              const neighbor = Math.min(
                k > 0 ? cx - X(r.index, devs[k - 1].at) : Infinity,
                k < devs.length - 1 ? X(r.index, devs[k + 1].at) - cx : Infinity
              );
              const posLabel = formatLength(d.at);
              return (
                <g key={'d' + d.index}>
                  <rect x={cx - DEV_W / 2} y={dTop} width={DEV_W} height={DEV_H} rx={2.5}
                    fill={d.color.hex} stroke="#201e1d" strokeWidth={1.5} />
                  {/* duplex face: two outlets and a screw line */}
                  <rect x={cx - 4.5} y={dTop + 7} width={9} height={13} rx={2} fill={d.color.ink} opacity={0.42} />
                  <rect x={cx - 4.5} y={dTop + DEV_H - 20} width={9} height={13} rx={2} fill={d.color.ink} opacity={0.42} />
                  <circle cx={cx} cy={dTop + DEV_H / 2} r={1.6} fill={d.color.ink} opacity={0.6} />
                  {neighbor >= 14 && (
                    <text x={cx} y={dTop + DEV_H + 16} textAnchor="middle" style={{ fill: ink }} fontSize={12} fontWeight={800}
                      fontFamily="var(--font-heading)">{d.index + 1}</text>
                  )}
                  {neighbor >= tw(posLabel, 10.5) + 6 && (
                    <text x={cx} y={dTop + DEV_H + 30} textAnchor="middle" style={{ fill: muted }} fontSize={10.5}>{posLabel}</text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// The fed end of the run. `dir` is the way the feed points: "right" sits left of
// the run (feeding the left end), "left" sits right of it.
//   • with a whip: a wavy lead into the run, labeled with the whip's length
//   • without one: a straight arrow into an end cap — the wire stops there, capped
// The whip is not to scale (it hangs off the end of the run).
function FeedArrow({ x, cy, dir, whipIn }: { x: number; cy: number; dir: 'left' | 'right'; whipIn: number | null }) {
  const side = dir === 'right' ? -1 : 1;          // which side of the run it sits on
  const tail = x + side * 64;
  const tip = x + side * 4;
  const base = tip + side * 9;                    // back of the arrowhead
  const mid = (tail + tip) / 2;
  const waves = 5, step = (base - tail) / waves;  // signed: runs from the tail toward the run
  const wavy = `M ${tail},${cy} ` + Array.from({ length: waves }, (_, i) =>
    `Q ${tail + step * (i + 0.5)},${cy + (i % 2 ? 8 : -8)} ${tail + step * (i + 1)},${cy}`).join(' ');
  return (
    <g>
      {whipIn
        ? <path d={wavy} fill="none" style={{ stroke: accent }} strokeWidth={3} strokeLinecap="round" />
        : <line x1={tail} y1={cy} x2={base} y2={cy} style={{ stroke: accent }} strokeWidth={3.5} />}
      <polygon points={`${tip},${cy} ${base},${cy - 7} ${base},${cy + 7}`} style={{ fill: accent }} />
      {!whipIn && <rect x={x - 3} y={cy - BAR_H / 2 - 5} width={6} height={BAR_H + 10} rx={1.5} fill="#201e1d" />}
      <text x={mid} y={cy - 14} textAnchor="middle" style={{ fill: accent }} fontSize={11} fontWeight={800} letterSpacing={1}>FEED</text>
      <text x={mid} y={cy + 24} textAnchor="middle" style={{ fill: ink }} fontSize={10.5} fontWeight={800}>
        {whipIn ? formatLength(whipIn) : 'END'}
      </text>
      <text x={mid} y={cy + 36} textAnchor="middle" style={{ fill: muted }} fontSize={10} fontWeight={700} letterSpacing={0.6}>
        {whipIn ? 'WHIP' : 'CAPPED'}
      </text>
    </g>
  );
}

// Everything the foreman or the shop needs beside the drawing.
export function WiremoldFigure({ build }: { build: WiremoldBuild }) {
  const counts = new Map<string, number>();
  for (const k of build.deviceColors) counts.set(k, (counts.get(k) || 0) + 1);
  const used = DEVICE_COLORS.filter(c => counts.has(c.key));
  const feed = FEED_ENDS.find(f => f.v === build.feed)!.label;

  return (
    <figure className="wm-fig">
      <WiremoldDiagram build={build} />
      <figcaption className="wm-legend">
        <div className="wm-legend-row">
          <span className="wm-legend-k">Devices</span>
          {used.map(c => (
            <span key={c.key} className="wm-key">
              <i className="wm-sw" style={{ background: c.hex }} />{c.label}{c.note ? ` (${c.note})` : ''} × {counts.get(c.key)}
            </span>
          ))}
        </div>
        <div className="wm-legend-row">
          <span className="wm-legend-k">Wire</span>
          <span className="wm-key"><b>{sizeLabel(build.wire.size)} {build.wire.type}</b></span>
          {build.wire.conductors.map((c, i) => {
            const col = wireColor(c.color);
            return (
              <span key={i} className="wm-key">
                <i className="wm-sw wire" style={{ background: col.tracer ? `repeating-linear-gradient(90deg, ${col.hex} 0 5px, ${col.tracer} 5px 9px)` : col.hex }} />
                {c.role[0].toUpperCase() + c.role.slice(1)} · {col.label}
              </span>
            );
          })}
        </div>
        <div className="wm-legend-row">
          <span className="wm-legend-k">Cut wire</span>
          <span className="wm-key"><b>{wireLengthText(build)}</b></span>
        </div>
        <div className="wm-legend-row">
          <span className="wm-legend-k">Fed from</span>
          <span className="wm-key"><b>{feed}</b></span>
          <span className="wm-key">
            {build.whipIn
              ? `${formatLength(build.whipIn)} whip${build.feed === 'both' ? ' at each end' : ''}`
              : 'no whip — wire end capped'}
          </span>
          <span className="wm-note">Left and right as you face the run · positions to scale, devices enlarged</span>
        </div>
      </figcaption>
    </figure>
  );
}
