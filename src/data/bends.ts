// Conduit bending engine, calibrated to the shop's Gardner Bender B2000 Cyclone.
//
// The centerline bend radius (Table B) and 90° stub-up set-back (Table C) figures
// below are the manufacturer's published values for this exact machine, from the
// B2000 instruction sheet (RPS-0097). The B2000 has an adjustable degree scale to
// compensate for springback, so treat these as accurate starting points and
// confirm with one test bend per conduit size — then nudge any value here if the
// shop's shoe reads slightly long or short.
//
// Offsets, saddles, kicks and rolling offsets use the standard multiplier
// (cosecant) method electricians already know, so the marks match what the field
// expects off a bend chart. Stub-ups use the B2000's own set-back table directly.

export type BendMaterial = 'EMT' | 'Rigid' | 'IMC';
export type ConduitSize = '1/2' | '3/4' | '1' | '1-1/4' | '1-1/2' | '2';
export type BendType = 'offset' | 'rolling' | 'saddle3' | 'saddle4' | 'kick' | 'stub90';

export const BEND_SIZES: ConduitSize[] = ['1/2', '3/4', '1', '1-1/4', '1-1/2', '2'];
export const BEND_MATERIALS: BendMaterial[] = ['EMT', 'Rigid', 'IMC'];
export const BEND_TYPES: { v: BendType; label: string; blurb: string }[] = [
  { v: 'offset', label: 'Offset', blurb: 'Step the run over by a set depth — two equal bends.' },
  { v: 'rolling', label: 'Rolling offset', blurb: 'Offset that moves over and up at the same time.' },
  { v: 'saddle3', label: 'Three-point saddle', blurb: 'Hump over an obstruction (45° center).' },
  { v: 'saddle4', label: 'Four-point saddle', blurb: 'Bridge a wide obstruction — flat top, four bends.' },
  { v: 'kick', label: 'Kick', blurb: 'Single angled bend to nudge the run.' },
  { v: 'stub90', label: '90° stub-up', blurb: 'Single 90° to a finished stub height.' }
];

// Table B — centerline bend radius (inches). Rigid and IMC share a column.
const RADIUS: Record<ConduitSize, Record<BendMaterial, number>> = {
  '1/2': { EMT: 3.875, Rigid: 3.96875, IMC: 3.96875 },
  '3/4': { EMT: 4.90625, Rigid: 4.78125, IMC: 4.78125 },
  '1': { EMT: 5.90625, Rigid: 5.5625, IMC: 5.5625 },
  '1-1/4': { EMT: 7.09375, Rigid: 6.875, IMC: 6.875 },
  '1-1/2': { EMT: 7.5, Rigid: 7.5625, IMC: 7.5625 },
  '2': { EMT: 8.5625, Rigid: 8.28125, IMC: 8.28125 }
};

// Table C — 90° stub-up set-back / deduct (inches), per size and material.
const STUB_SETBACK: Record<ConduitSize, Record<BendMaterial, number>> = {
  '1/2': { EMT: 7.625, Rigid: 7.75, IMC: 7.75 },
  '3/4': { EMT: 8.5, Rigid: 9, IMC: 9 },
  '1': { EMT: 10.375, Rigid: 10.125, IMC: 10.125 },
  '1-1/4': { EMT: 13, Rigid: 12.75, IMC: 12.5 },
  '1-1/2': { EMT: 13.5, Rigid: 13.5, IMC: 13.5 },
  '2': { EMT: 15.5, Rigid: 15.75, IMC: 15.5 }
};

export const radiusFor = (size: ConduitSize, material: BendMaterial) => RADIUS[size][material];
export const stubSetbackFor = (size: ConduitSize, material: BendMaterial) => STUB_SETBACK[size][material];

// Angles offered for offsets, rolling offsets, 4-point saddles and kicks.
export const OFFSET_ANGLES = [10, 15, 22.5, 30, 45, 60] as const;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const csc = (deg: number) => 1 / Math.sin(toRad(deg));
const cot = (deg: number) => 1 / Math.tan(toRad(deg));

// Nearest 1/16", reduced — e.g. 7.625 -> 7-5/8"
export function toFraction(inches: number): string {
  if (!isFinite(inches)) return '—';
  const neg = inches < 0;
  let v = Math.abs(inches);
  let whole = Math.floor(v);
  let sixteenths = Math.round((v - whole) * 16);
  if (sixteenths === 16) { whole += 1; sixteenths = 0; }
  let frac = '';
  if (sixteenths > 0) {
    let num = sixteenths, den = 16;
    while (num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
    frac = `${num}/${den}`;
  }
  const body = frac ? (whole ? `${whole}-${frac}` : frac) : `${whole}`;
  return (neg ? '-' : '') + body + '"';
}

export interface BendInput {
  type: BendType;
  size: ConduitSize;
  material: BendMaterial;
  angle: number;         // offset / rolling / saddle4 / kick: bend angle
  depth: number;         // offset depth or saddle obstruction height
  width: number;         // saddle4: width of the obstruction (flat top run)
  rise: number;          // rolling offset — vertical component
  roll: number;          // rolling offset — horizontal component
  runAfter: number;      // kick: run past the bend, to report the rise gained
  stubHeight: number;    // stub90 — finished stub height
  startInches: number;   // distance from reference end to the first mark (0 = "your first mark")
  notes: string;         // free-text instructions for prefab
}

export interface BendMark { label: string; at: number; }
export interface BendResult {
  ok: boolean;
  warnings: string[];
  headline: string;
  steps: string[];
  marks: BendMark[];
  figures: { label: string; value: string }[];
}

export const emptyInput = (): BendInput => ({
  type: 'offset', size: '3/4', material: 'EMT',
  angle: 30, depth: 0, width: 0, rise: 0, roll: 0, runAfter: 0,
  stubHeight: 0, startInches: 0, notes: ''
});

const ALUM = 'Rigid aluminum: set the dial ~4° short — it barely springs back.';

export function computeBend(inp: BendInput): BendResult {
  const warnings: string[] = [];
  const radius = radiusFor(inp.size, inp.material);

  if (inp.type === 'stub90') {
    const setback = stubSetbackFor(inp.size, inp.material);
    const mark = inp.stubHeight - setback;
    if (inp.stubHeight <= 0) warnings.push('Enter a finished stub height.');
    else if (mark <= 0) warnings.push(`Stub height must exceed the ${toFraction(setback)} set-back for ${inp.size}" ${inp.material} — a single 90° can't make a stub this short.`);
    return {
      ok: warnings.length === 0, warnings,
      headline: `One 90° bend · ${inp.size}" ${inp.material}`,
      steps: [
        `Measure ${toFraction(mark)} from the end of the conduit and mark it.`,
        `Line the mark up with the front edge of the shoe clamp and bend to 90°.`,
        `Finished stub, end to back of pipe: ${toFraction(inp.stubHeight)}.`
      ],
      marks: mark > 0 ? [{ label: 'Bend mark (from end)', at: mark }] : [],
      figures: [
        { label: 'Set-back (deduct)', value: toFraction(setback) },
        { label: 'Bend radius', value: toFraction(radius) }
      ]
    };
  }

  if (inp.type === 'kick') {
    const angle = inp.angle;
    const mark = inp.startInches;
    const rise = inp.runAfter > 0 ? inp.runAfter * Math.sin(toRad(angle)) : 0;
    const figures = [
      { label: 'Bend angle', value: `${angle}°` },
      { label: 'Bend radius', value: toFraction(radius) }
    ];
    if (inp.runAfter > 0) figures.splice(1, 0, { label: `Rise over ${toFraction(inp.runAfter)} run`, value: toFraction(rise) });
    return {
      ok: true, warnings,
      headline: `Kick · single ${angle}° bend`,
      steps: [
        mark > 0 ? `Measure ${toFraction(mark)} from the end and mark it.` : `Mark where the kick should start.`,
        `Bend that mark to ${angle}°.`,
        inp.runAfter > 0 ? `Over the ${toFraction(inp.runAfter)} of run past the bend, the pipe lifts ${toFraction(rise)}.` : `Run past the bend rises at ${angle}°.`,
        ALUM
      ],
      marks: mark > 0 ? [{ label: 'Kick mark (from end)', at: mark }] : [],
      figures
    };
  }

  if (inp.type === 'saddle3') {
    const depth = inp.depth;
    if (depth <= 0) warnings.push('Enter the obstruction height.');
    const side = depth * 2.5;
    const shrink = depth * 0.1875;
    const center = inp.startInches;
    const marks: BendMark[] = center > 0
      ? [
        { label: 'Side mark 1 (from end)', at: center - side },
        { label: 'Center mark (from end)', at: center },
        { label: 'Side mark 2 (from end)', at: center + side }
      ].filter(m => m.at > 0)
      : [
        { label: 'Center mark', at: 0 },
        { label: 'Side marks — each side of center', at: side }
      ];
    return {
      ok: warnings.length === 0, warnings,
      headline: `Three-point saddle · 45° center, two 22.5° sides`,
      steps: [
        center > 0 ? `Mark the obstruction center at ${toFraction(center)} from the end.` : `Mark the obstruction center on the pipe.`,
        `Measure ${toFraction(side)} to each side of the center mark and mark both.`,
        `Bend the center mark 45° (arrow toward you), then bend each side mark 22.5° the opposite way.`,
        ALUM
      ],
      marks,
      figures: [
        { label: 'Center-to-side spacing', value: toFraction(side) },
        { label: 'Shrink (gain)', value: toFraction(shrink) },
        { label: 'Bend radius', value: toFraction(radius) }
      ]
    };
  }

  if (inp.type === 'saddle4') {
    const depth = inp.depth;
    const width = inp.width;
    const angle = inp.angle;
    if (depth <= 0) warnings.push('Enter the obstruction height.');
    if (width <= 0) warnings.push('Enter the obstruction width (the flat run across the top).');
    const spacing = depth * csc(angle);
    const shrink = 2 * depth * (csc(angle) - cot(angle));
    const start = inp.startInches;
    const marks: BendMark[] = [
      { label: 'Bend 1 (from end)', at: start },
      { label: 'Bend 2 — up to level', at: start + spacing },
      { label: 'Bend 3 — start down', at: start + spacing + width },
      { label: 'Bend 4 — back to level', at: start + spacing + width + spacing }
    ];
    return {
      ok: warnings.length === 0, warnings,
      headline: `Four-point saddle · four ${angle}° bends`,
      steps: [
        start > 0 ? `Bend 1 at ${toFraction(start)} from the end.` : `Make Bend 1 where the climb should start.`,
        `Climb: Bend 2 is ${toFraction(spacing)} past Bend 1.`,
        `Flat top across the obstruction: Bend 3 is ${toFraction(width)} past Bend 2.`,
        `Descent: Bend 4 is ${toFraction(spacing)} past Bend 3.`,
        `All four bends are ${angle}°, alternating direction (rotate 180° between each pair).`,
        ALUM
      ],
      marks,
      figures: [
        { label: 'Climb / descent spacing', value: toFraction(spacing) },
        { label: 'Flat top', value: toFraction(width) },
        { label: `Multiplier (${angle}°)`, value: csc(angle).toFixed(2) },
        { label: 'Shrink (gain)', value: toFraction(shrink) }
      ]
    };
  }

  // offset & rolling offset share the multiplier math
  const angle = inp.angle;
  const mult = csc(angle);
  const shrinkPerIn = csc(angle) - cot(angle);

  if (inp.type === 'rolling') {
    const trueOffset = Math.sqrt(inp.rise * inp.rise + inp.roll * inp.roll);
    if (inp.rise <= 0 && inp.roll <= 0) warnings.push('Enter the rise and the roll.');
    const spacing = trueOffset * mult;
    const shrink = trueOffset * shrinkPerIn;
    const rollAngle = inp.rise > 0 ? Math.atan2(inp.roll, inp.rise) * 180 / Math.PI : 90;
    const start = inp.startInches;
    return {
      ok: warnings.length === 0, warnings,
      headline: `Rolling offset · two ${angle}° bends`,
      steps: [
        `True offset (rise + roll combined): ${toFraction(trueOffset)}.`,
        `Mark 1, then Mark 2 a distance of ${toFraction(spacing)} further along.`,
        `Bend both marks to ${angle}°, rotating the pipe ~${Math.round(rollAngle)}° off vertical so the run travels over and up together.`,
        ALUM
      ],
      marks: [
        { label: 'Mark 1 (from end)', at: start },
        { label: 'Mark 2 (from end)', at: start + spacing }
      ],
      figures: [
        { label: 'True offset', value: toFraction(trueOffset) },
        { label: 'Distance between marks', value: toFraction(spacing) },
        { label: `Multiplier (${angle}°)`, value: mult.toFixed(2) },
        { label: 'Shrink (gain)', value: toFraction(shrink) },
        { label: 'Roll direction', value: `${Math.round(rollAngle)}° off vertical` }
      ]
    };
  }

  // straight offset
  const depth = inp.depth;
  if (depth <= 0) warnings.push('Enter the offset depth.');
  const spacing = depth * mult;
  const shrink = depth * shrinkPerIn;
  const start = inp.startInches;
  return {
    ok: warnings.length === 0, warnings,
    headline: `Offset · two ${angle}° bends`,
    steps: [
      start > 0 ? `Mark 1 at ${toFraction(start)} from the end.` : `Make Mark 1 where the offset should start.`,
      `Mark 2 a distance of ${toFraction(spacing)} past Mark 1.`,
      `Bend Mark 1 to ${angle}°, rotate the pipe 180° flat, then bend Mark 2 to ${angle}°.`,
      ALUM
    ],
    marks: [
      { label: 'Mark 1 (from end)', at: start },
      { label: 'Mark 2 (from end)', at: start + spacing }
    ],
    figures: [
      { label: 'Distance between marks', value: toFraction(spacing) },
      { label: `Multiplier (${angle}°)`, value: mult.toFixed(2) },
      { label: 'Shrink (gain)', value: toFraction(shrink) },
      { label: 'Bend radius', value: toFraction(radius) }
    ]
  };
}

// One-line summary for a saved custom bend, used on the request line and ticket.
export function bendSummary(inp: BendInput): string {
  const base = `${inp.size}" ${inp.material}`;
  switch (inp.type) {
    case 'stub90': return `${base} · 90° stub to ${toFraction(inp.stubHeight)}`;
    case 'kick': return `${base} · ${inp.angle}° kick`;
    case 'saddle3': return `${base} · 3-pt saddle, ${toFraction(inp.depth)} high`;
    case 'saddle4': return `${base} · 4-pt saddle, ${toFraction(inp.depth)} high × ${toFraction(inp.width)} wide @ ${inp.angle}°`;
    case 'rolling': return `${base} · rolling offset ${toFraction(inp.rise)}↑ × ${toFraction(inp.roll)}→ @ ${inp.angle}°`;
    default: return `${base} · ${toFraction(inp.depth)} offset @ ${inp.angle}°`;
  }
}

// ── Diagram geometry ──
// Returns the conduit centerline as a polyline plus dimension lines and angle
// labels, in inches with y measured UP from the baseline. The diagram component
// scales this to fit and flips y for SVG. Shapes are proportioned to the real
// inputs so the sketch reads true to the bend.
export interface BendGeometry {
  w: number;
  h: number;
  path: [number, number][];
  dims: { x1: number; y1: number; x2: number; y2: number; label: string; axis: 'v' | 'h' }[];
  verts: { x: number; y: number; label: string }[];
}

export function bendGeometry(inp: BendInput): BendGeometry {
  const lead = 6;
  const path: [number, number][] = [];
  const dims: BendGeometry['dims'] = [];
  const verts: BendGeometry['verts'] = [];

  if (inp.type === 'stub90') {
    const stub = Math.max(2, inp.stubHeight || 8);
    path.push([0, 0], [lead, 0], [lead, stub]);
    dims.push({ x1: lead + 2, y1: 0, x2: lead + 2, y2: stub, label: toFraction(inp.stubHeight || 0), axis: 'v' });
    verts.push({ x: lead, y: 0, label: '90°' });
    return { w: lead + 3, h: stub, path, dims, verts };
  }

  if (inp.type === 'kick') {
    const ang = inp.angle || 30;
    const run = 9;
    const rise = run * Math.sin(toRad(ang));
    const hrun = run * Math.cos(toRad(ang));
    const mark = Math.max(3, inp.startInches || 6);
    path.push([0, 0], [mark, 0], [mark + hrun, rise]);
    verts.push({ x: mark, y: 0, label: `${ang}°` });
    return { w: mark + hrun, h: Math.max(2, rise), path, dims, verts };
  }

  if (inp.type === 'saddle3') {
    const d = Math.max(1.5, inp.depth || 3);
    const run = d / Math.tan(toRad(22.5));
    path.push([0, 0], [lead, 0], [lead + run, d], [lead + 2 * run, 0], [lead + 2 * run + lead, 0]);
    dims.push({ x1: lead + run, y1: 0, x2: lead + run, y2: d, label: toFraction(inp.depth || 0), axis: 'v' });
    verts.push({ x: lead, y: 0, label: '22.5°' }, { x: lead + run, y: d, label: '45°' }, { x: lead + 2 * run, y: 0, label: '22.5°' });
    return { w: 2 * lead + 2 * run, h: d, path, dims, verts };
  }

  if (inp.type === 'saddle4') {
    const d = Math.max(1.5, inp.depth || 3);
    const ang = inp.angle || 22.5;
    const wid = Math.max(3, inp.width || 6);
    const run = d / Math.tan(toRad(ang));
    path.push([0, 0], [lead, 0], [lead + run, d], [lead + run + wid, d], [lead + 2 * run + wid, 0], [lead + 2 * run + wid + lead, 0]);
    dims.push({ x1: lead + run, y1: 0, x2: lead + run, y2: d, label: toFraction(inp.depth || 0), axis: 'v' });
    dims.push({ x1: lead + run, y1: d, x2: lead + run + wid, y2: d, label: toFraction(inp.width || 0), axis: 'h' });
    verts.push(
      { x: lead, y: 0, label: `${ang}°` }, { x: lead + run, y: d, label: `${ang}°` },
      { x: lead + run + wid, y: d, label: `${ang}°` }, { x: lead + 2 * run + wid, y: 0, label: `${ang}°` }
    );
    return { w: 2 * lead + 2 * run + wid, h: d, path, dims, verts };
  }

  // offset & rolling
  const raw = inp.type === 'rolling' ? Math.sqrt((inp.rise || 0) ** 2 + (inp.roll || 0) ** 2) : (inp.depth || 3);
  const d = Math.max(1.5, raw);
  const ang = inp.angle || 30;
  const run = d / Math.tan(toRad(ang));
  path.push([0, 0], [lead, 0], [lead + run, d], [lead + run + lead, d]);
  dims.push({ x1: lead + run, y1: 0, x2: lead + run, y2: d, label: toFraction(raw), axis: 'v' });
  verts.push({ x: lead, y: 0, label: `${ang}°` }, { x: lead + run, y: d, label: `${ang}°` });
  return { w: 2 * lead + run, h: d, path, dims, verts };
}
