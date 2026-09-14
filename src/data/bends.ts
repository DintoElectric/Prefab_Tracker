// Conduit bending engine, calibrated to the shop's Gardner Bender B2000 Cyclone.
//
// The centerline bend radius (Table B) and 90° stub-up set-back (Table C) figures
// below are the manufacturer's published values for this exact machine, from the
// B2000 instruction sheet (RPS-0097). The B2000 has an adjustable degree scale to
// compensate for springback, so treat these as accurate starting points and
// confirm with one test bend per conduit size — then nudge any value here if the
// shop's shoe reads slightly long or short.
//
// Offsets, saddles and rolling offsets use the standard multiplier (cosecant)
// method electricians already know, so the marks match what the field expects
// off a bend chart. Stub-ups use the B2000's own set-back table directly.

export type BendMaterial = 'EMT' | 'Rigid' | 'IMC';
export type ConduitSize = '1/2' | '3/4' | '1' | '1-1/4' | '1-1/2' | '2';
export type BendType = 'offset' | 'rolling' | 'saddle3' | 'stub90';

export const BEND_SIZES: ConduitSize[] = ['1/2', '3/4', '1', '1-1/4', '1-1/2', '2'];
export const BEND_MATERIALS: BendMaterial[] = ['EMT', 'Rigid', 'IMC'];
export const BEND_TYPES: { v: BendType; label: string; blurb: string }[] = [
  { v: 'offset', label: 'Offset', blurb: 'Step the run over by a set depth — two equal bends.' },
  { v: 'rolling', label: 'Rolling offset', blurb: 'Offset that moves over and up at the same time.' },
  { v: 'saddle3', label: 'Three-point saddle', blurb: 'Hump the run over an obstruction (45° center).' },
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

// Angles offered for offsets and rolling offsets.
export const OFFSET_ANGLES = [10, 22.5, 30, 45, 60] as const;

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
  angle: number;         // offset / rolling: bend angle at each end
  depth: number;         // offset depth or saddle obstruction height
  rise: number;          // rolling offset — vertical component
  roll: number;          // rolling offset — horizontal component
  stubHeight: number;    // stub90 — finished stub height
  startInches: number;   // distance from reference end to the first mark (0 = "your first mark")
}

export interface BendMark { label: string; at: number; }
export interface BendResult {
  ok: boolean;
  warnings: string[];
  headline: string;               // e.g. "Two 30° bends"
  steps: string[];                // plain-language bend instructions
  marks: BendMark[];              // measured from the reference end, in order
  figures: { label: string; value: string }[]; // shrink, multiplier, radius, etc.
}

export const emptyInput = (): BendInput => ({
  type: 'offset', size: '3/4', material: 'EMT',
  angle: 30, depth: 0, rise: 0, roll: 0, stubHeight: 0, startInches: 0
});

export function computeBend(inp: BendInput): BendResult {
  const warnings: string[] = [];
  const radius = radiusFor(inp.size, inp.material);
  const aluminumNote = 'Rigid aluminum: set the dial ~4° short — it barely springs back.';

  if (inp.type === 'stub90') {
    const setback = stubSetbackFor(inp.size, inp.material);
    const mark = inp.stubHeight - setback;
    if (inp.stubHeight <= 0) warnings.push('Enter a finished stub height.');
    else if (mark <= 0) warnings.push(`Stub height must exceed the ${toFraction(setback)} set-back for ${inp.size}" ${inp.material} — a single 90° can't make a stub this short.`);
    return {
      ok: warnings.length === 0,
      warnings,
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

  if (inp.type === 'saddle3') {
    // Standard 45° three-point saddle: 45° center bend, two 22.5° side bends.
    const depth = inp.depth;
    if (depth <= 0) warnings.push('Enter the obstruction height.');
    const side = depth * 2.5;          // center mark to each side mark
    const shrink = depth * 0.1875;     // ~3/16" per inch of saddle
    const center = inp.startInches;    // distance from end to the obstruction center, if given
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
      ok: warnings.length === 0,
      warnings,
      headline: `Three-point saddle · 45° center, two 22.5° sides`,
      steps: [
        center > 0
          ? `Mark the obstruction center at ${toFraction(center)} from the end.`
          : `Mark the obstruction center on the pipe.`,
        `Measure ${toFraction(side)} to each side of the center mark and mark both.`,
        `Bend the center mark 45° (arrow toward you), then bend each side mark 22.5° the opposite way.`,
        aluminumNote
      ],
      marks,
      figures: [
        { label: 'Center-to-side spacing', value: toFraction(side) },
        { label: 'Shrink (gain)', value: toFraction(shrink) },
        { label: 'Bend radius', value: toFraction(radius) }
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
    const marks: BendMark[] = [
      { label: 'Mark 1 (from end)', at: start },
      { label: 'Mark 2 (from end)', at: start + spacing }
    ];
    return {
      ok: warnings.length === 0,
      warnings,
      headline: `Rolling offset · two ${angle}° bends`,
      steps: [
        `True offset (rise + roll combined): ${toFraction(trueOffset)}.`,
        `Mark 1, then Mark 2 a distance of ${toFraction(spacing)} further along.`,
        `Bend both marks to ${angle}°, rotating the pipe ~${Math.round(rollAngle)}° off vertical so the run travels over and up together.`,
        aluminumNote
      ],
      marks,
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
  const marks: BendMark[] = [
    { label: 'Mark 1 (from end)', at: start },
    { label: 'Mark 2 (from end)', at: start + spacing }
  ];
  return {
    ok: warnings.length === 0,
    warnings,
    headline: `Offset · two ${angle}° bends`,
    steps: [
      start > 0
        ? `Mark 1 at ${toFraction(start)} from the end.`
        : `Make Mark 1 where the offset should start.`,
      `Mark 2 a distance of ${toFraction(spacing)} past Mark 1.`,
      `Bend Mark 1 to ${angle}°, rotate the pipe 180° flat, then bend Mark 2 to ${angle}°.`,
      aluminumNote
    ],
    marks,
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
    case 'saddle3': return `${base} · 3-pt saddle, ${toFraction(inp.depth)} high`;
    case 'rolling': return `${base} · rolling offset ${toFraction(inp.rise)}↑ × ${toFraction(inp.roll)}→ @ ${inp.angle}°`;
    default: return `${base} · ${toFraction(inp.depth)} offset @ ${inp.angle}°`;
  }
}
