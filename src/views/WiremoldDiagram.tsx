import {
  wiremoldGeometry, fillBuild, formatLength, wireColor, wireLengthText, seriesLabel,
  FEED_ENDS, DEVICE_COLORS, sizeLabel,
  type WiremoldBuild, type WireColor, type DeviceType, type DeviceColor
} from '../data/wiremold';

// To-scale shop sketch of one wiremold build, drawn from wiremoldGeometry().
// Along the run everything is true to scale — the length, each box's length,
// and the spacing. Up and down it is a diagram: the raceway is a bar (two
// stacked channels when it is a double), and a box is drawn standing up or
// lying along the raceway. A long run wraps onto extra rows (up to 20 ft each).

const W = 940;            // drawing width
const PADX = 72;          // room beside the run for the feed arrow and its whip / end-cap label
const ROW_H = 160;
const TOP = 12;
const BAR_CY = 94;        // centerline of the raceway, within a row
const DIM_Y = 54;         // dimension line, within a row
const DEV_H = 50;         // a box standing up
const MIN_BOX_PX = 6;     // never draw a box thinner than this

const ink = 'var(--color-text)';
const accent = 'var(--color-accent)';
const muted = 'var(--color-neutral-600)';
const hair = 'var(--color-neutral-400)';

// One device box. `units` is 1 for a duplex, 2 for a double duplex; each unit
// shows its two outlets — stacked when the box stands up, side by side when it
// lies along the raceway.
function DeviceBox({ cx, cy, w, h, type, horizontal, color }: {
  cx: number; cy: number; w: number; h: number; type: DeviceType; horizontal: boolean; color: DeviceColor;
}) {
  const units = type === 'double' ? 2 : 1;
  const unitW = w / units;
  const x0 = cx - w / 2, y0 = cy - h / 2;
  const marks: JSX.Element[] = [];
  for (let u = 0; u < units; u++) {
    const ux = x0 + unitW * (u + 0.5);
    if (horizontal) {
      const ow = Math.min(13, (unitW - 11) / 2), oh = Math.min(10, h - 12);
      if (ow >= 3 && oh >= 3) {
        marks.push(<rect key={`a${u}`} x={ux - 2.5 - ow} y={cy - oh / 2} width={ow} height={oh} rx={2} fill={color.ink} opacity={0.42} />);
        marks.push(<rect key={`b${u}`} x={ux + 2.5} y={cy - oh / 2} width={ow} height={oh} rx={2} fill={color.ink} opacity={0.42} />);
        marks.push(<circle key={`c${u}`} cx={ux} cy={cy} r={1.4} fill={color.ink} opacity={0.6} />);
      }
    } else {
      const ow = Math.min(9, unitW - 5);
      if (ow >= 3) {
        marks.push(<rect key={`a${u}`} x={ux - ow / 2} y={y0 + 7} width={ow} height={13} rx={2} fill={color.ink} opacity={0.42} />);
        marks.push(<rect key={`b${u}`} x={ux - ow / 2} y={y0 + h - 20} width={ow} height={13} rx={2} fill={color.ink} opacity={0.42} />);
        marks.push(<circle key={`c${u}`} cx={ux} cy={cy} r={1.6} fill={color.ink} opacity={0.6} />);
      }
    }
  }
  return (
    <g>
      <rect className="wm-dev-box" data-type={type} x={x0} y={y0} width={w} height={h} rx={2.5}
        fill={color.hex} stroke="#201e1d" strokeWidth={1.5} />
      {units === 2 && unitW >= 5 && (
        <line x1={cx} y1={y0 + 3} x2={cx} y2={y0 + h - 3} stroke={color.ink} strokeWidth={1} opacity={0.45} />
      )}
      {marks}
    </g>
  );
}

export function WiremoldDiagram({ build: raw }: { build: WiremoldBuild }) {
  const build = fillBuild(raw);
  const g = wiremoldGeometry(build);
  const nRows = g.rows.length;
  const rowIn = g.rows[0].to - g.rows[0].from;
  const innerW = W - PADX * 2;
  const pxIn = Math.min(innerW / rowIn, 26);
  const rowW = rowIn * pxIn;
  const x0 = PADX + (innerW - rowW) / 2;
  const shift = nRows > 1 ? 0 : -26;          // a single row has no caption line above it
  const H = TOP + shift + nRows * ROW_H + 4;

  // The raceway: one channel, or two stacked. Wire and boxes that lie along the
  // raceway sit in the top channel; a box standing up spans the raceway.
  const double = g.channels === 2;
  const chH = double ? 22 : 28;
  const barH = chH * g.channels;
  const barTop = BAR_CY - barH / 2;
  const wireCy = barTop + chH / 2;             // centerline of the channel that carries the wire
  const boxH = g.horizontal ? chH + 8 : DEV_H;
  const boxCy = g.horizontal ? wireCy : BAR_CY;
  const boxTop = boxCy - boxH / 2;
  const labelY = BAR_CY + DEV_H / 2 + 16;      // device numbers share one baseline

  const X = (row: number, inches: number) => x0 + (inches - g.rows[row].from) * pxIn;
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
            <rect className="wm-raceway" x={xl} y={y(barTop)} width={xr - xl} height={barH} rx={isFirst && isLast ? 3 : 0}
              fill="#ebe7df" style={{ stroke: muted }} strokeWidth={1.2} />
            {double && (
              <line className="wm-divider" x1={xl} y1={y(barTop + chH)} x2={xr} y2={y(barTop + chH)} style={{ stroke: muted }} strokeWidth={1.2} />
            )}

            {/* conductors running the length of the run */}
            {conductors.map((c, i) => {
              const cy = y(barTop + ((i + 1) * chH) / (conductors.length + 1));
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
            {!isFirst && <path d={`M ${xl - 3},${y(barTop - 5)} L ${xl + 3},${y(barTop + barH + 5)}`} style={{ stroke: muted }} strokeWidth={2} />}
            {!isLast && <path d={`M ${xr - 3},${y(barTop - 5)} L ${xr + 3},${y(barTop + barH + 5)}`} style={{ stroke: muted }} strokeWidth={2} />}

            {/* feed: a whip, or the wire end capped */}
            {isFirst && feedLeft && <FeedArrow x={xl} cy={y(wireCy)} capTop={y(barTop - 5)} capH={barH + 10} dir="right" whipIn={build.whipIn} />}
            {isLast && feedRight && <FeedArrow x={xr} cy={y(wireCy)} capTop={y(barTop - 5)} capH={barH + 10} dir="left" whipIn={build.whipIn} />}

            {/* dimensions: one line per piece, its text printed once */}
            {segs.map(({ s, i }) => {
              const a = X(r.index, s.from), z = X(r.index, s.to);
              const dy = y(DIM_Y);
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

            {/* extension lines: to each box edge when spacing is between boxes, to its center otherwise */}
            {devs.map(d => {
              const at = g.measure === 'clear' ? [d.left, d.right] : [d.at];
              return at.map((inch, k) => (
                <line key={`e${d.index}-${k}`} x1={X(r.index, inch)} y1={y(DIM_Y)} x2={X(r.index, inch)} y2={y(boxTop)}
                  style={{ stroke: hair }} strokeWidth={1} />
              ));
            })}

            {/* devices */}
            {devs.map((d, k) => {
              const cx = X(r.index, d.at);
              const neighbor = Math.min(
                k > 0 ? cx - X(r.index, devs[k - 1].at) : Infinity,
                k < devs.length - 1 ? X(r.index, devs[k + 1].at) - cx : Infinity
              );
              const posLabel = formatLength(d.at);
              return (
                <g key={'d' + d.index}>
                  <DeviceBox cx={cx} cy={y(boxCy)} w={Math.max(MIN_BOX_PX, d.widthIn * pxIn)} h={boxH}
                    type={d.type} horizontal={g.horizontal} color={d.color} />
                  {neighbor >= 14 && (
                    <text x={cx} y={y(labelY)} textAnchor="middle" style={{ fill: ink }} fontSize={12} fontWeight={800}
                      fontFamily="var(--font-heading)">{d.index + 1}</text>
                  )}
                  {neighbor >= tw(posLabel, 10.5) + 6 && (
                    <text x={cx} y={y(labelY + 14)} textAnchor="middle" style={{ fill: muted }} fontSize={10.5}>{posLabel}</text>
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
function FeedArrow({ x, cy, capTop, capH, dir, whipIn }: {
  x: number; cy: number; capTop: number; capH: number; dir: 'left' | 'right'; whipIn: number | null;
}) {
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
      {!whipIn && <rect className="wm-endcap" x={x - 3} y={capTop} width={6} height={capH} rx={1.5} fill="#201e1d" />}
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
export function WiremoldFigure({ build: raw }: { build: WiremoldBuild }) {
  const build = fillBuild(raw);
  const counts = new Map<string, number>();
  for (const k of build.deviceColors) counts.set(k, (counts.get(k) || 0) + 1);
  const used = DEVICE_COLORS.filter(c => counts.has(c.key));
  const feed = FEED_ENDS.find(f => f.v === build.feed)!.label;

  // box sizes actually on this build, by type
  const kinds: { type: DeviceType; label: string }[] = [{ type: 'duplex', label: 'duplex' }, { type: 'double', label: 'double duplex' }];
  const boxes = kinds.map(k => {
    const idx = build.deviceTypes.map((t, i) => (t === k.type ? i : -1)).filter(i => i >= 0);
    const sizes = Array.from(new Set(idx.map(i => build.widthsIn[i])));
    return { ...k, n: idx.length, size: sizes.map(formatLength).join(' / ') };
  }).filter(k => k.n > 0);

  return (
    <figure className="wm-fig">
      <WiremoldDiagram build={build} />
      <figcaption className="wm-legend">
        <div className="wm-legend-row">
          <span className="wm-legend-k">Raceway</span>
          <span className="wm-key"><b>{seriesLabel(build.series)}</b></span>
          <span className="wm-key">{build.channels === 2 ? 'Double (two-channel)' : 'Single'}</span>
          <span className="wm-key">{formatLength(build.lengthIn)} long</span>
        </div>
        <div className="wm-legend-row">
          <span className="wm-legend-k">Boxes</span>
          {boxes.map(k => (
            <span key={k.type} className="wm-key"><b>{k.n} {k.label}</b>&nbsp;· {k.size} each</span>
          ))}
          <span className="wm-key">{build.horizontal ? 'turned along the raceway' : 'standing up'}</span>
          <span className="wm-note">Spacing shown {build.measure === 'clear' ? 'between boxes' : 'center to center'}</span>
        </div>
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
          <span className="wm-note">Left and right as you face the run · lengths to scale along the run</span>
        </div>
      </figcaption>
    </figure>
  );
}
