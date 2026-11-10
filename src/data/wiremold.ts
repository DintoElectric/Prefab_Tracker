// Wiremold (surface raceway) engine — turns what a foreman types for a build
// into exact device positions, a to-scale drawing, and the wire to cut.
//
// A TICKET holds many BUILDS, the same way a pull sheet holds many boxes. Each
// build is one run of raceway:
//   • length of the run
//   • how many devices, and the spacing between them (feet/inches)
//   • the color of each device
//   • which end it is fed from
//   • the wire: type, size, and the color of every conductor
//
// Spacing is ONE value (used between every pair of devices) or one per gap,
// in order. Devices are centered on the run unless the foreman gives the
// distance from the left end to the first device.
//
// "Left" and "right" are as you face the run.
//
// Imported by BOTH the browser and the Netlify function, so it must stay pure —
// no DOM, no React, no Node-only APIs.

export type FeedEnd = 'left' | 'right' | 'both';
export type WireRole = 'hot' | 'neutral' | 'ground';
export type WireSize = '14' | '12' | '10' | '8';
export type WmStatus = 'Submitted' | 'In Build' | 'Ready' | 'Closed';

export const WM_STATUSES: WmStatus[] = ['Submitted', 'In Build', 'Ready', 'Closed'];
export const MAX_LENGTH_IN = 100 * 12;   // longest run on one build
export const MAX_DEVICES = 60;
export const MAX_QTY = 99;
export const MAX_BUILDS = 40;
export const MAX_CONDUCTORS = 8;
export const SIXTEENTH = 1 / 16;

// ── choices ──
export const FEED_ENDS: { v: FeedEnd; label: string }[] = [
  { v: 'left', label: 'Left end' },
  { v: 'right', label: 'Right end' },
  { v: 'both', label: 'Both ends' }
];

export interface DeviceColor { key: string; label: string; note?: string; hex: string; ink: string; }
// Yale 26 27 26: faces are ivory in finished areas unless another color suits
// the wall; red marks emergency circuits; orange marks isolated ground.
export const DEVICE_COLORS: DeviceColor[] = [
  { key: 'ivory',  label: 'Ivory',  hex: '#f1e8c9', ink: '#201e1d' },
  { key: 'white',  label: 'White',  hex: '#ffffff', ink: '#201e1d' },
  { key: 'gray',   label: 'Gray',   hex: '#9ba1a8', ink: '#201e1d' },
  { key: 'black',  label: 'Black',  hex: '#1b1a19', ink: '#ffffff' },
  { key: 'brown',  label: 'Brown',  hex: '#6b4423', ink: '#ffffff' },
  { key: 'red',    label: 'Red',    note: 'emergency', hex: '#c8261b', ink: '#ffffff' },
  { key: 'orange', label: 'Orange', note: 'isolated ground', hex: '#ee8a0c', ink: '#201e1d' }
];
export const DEFAULT_DEVICE_COLOR = 'ivory';
export const deviceColor = (key: string): DeviceColor =>
  DEVICE_COLORS.find(c => c.key === key) || DEVICE_COLORS[0];
export const isDeviceColor = (k: unknown): k is string => DEVICE_COLORS.some(c => c.key === k);

export interface WireColor { key: string; label: string; hex: string; ink: string; tracer?: string; }
// Yale 26 05 00 G.1 — conductor colors. An isolated-ground conductor is green
// with a yellow tracer.
export const WIRE_COLORS: WireColor[] = [
  { key: 'black',       label: 'Black',                hex: '#1b1a19', ink: '#ffffff' },
  { key: 'red',         label: 'Red',                  hex: '#c8261b', ink: '#ffffff' },
  { key: 'blue',        label: 'Blue',                 hex: '#1f5fbf', ink: '#ffffff' },
  { key: 'white',       label: 'White',                hex: '#ffffff', ink: '#201e1d' },
  { key: 'gray',        label: 'Gray',                 hex: '#8b9098', ink: '#201e1d' },
  { key: 'green',       label: 'Green',                hex: '#2e8b57', ink: '#ffffff' },
  { key: 'greenyellow', label: 'Green / yellow tracer', hex: '#2e8b57', ink: '#ffffff', tracer: '#f5cf1e' },
  { key: 'brown',       label: 'Brown',                hex: '#6b4423', ink: '#ffffff' },
  { key: 'orange',      label: 'Orange',               hex: '#ee8a0c', ink: '#201e1d' },
  { key: 'yellow',      label: 'Yellow',               hex: '#f5cf1e', ink: '#201e1d' }
];
export const wireColor = (key: string): WireColor => WIRE_COLORS.find(c => c.key === key) || WIRE_COLORS[0];
export const isWireColor = (k: unknown): k is string => WIRE_COLORS.some(c => c.key === k);

export const WIRE_TYPES = ['THHN/THWN-2', 'XHHW-2', 'Other — see notes'];
export const WIRE_SIZES: WireSize[] = ['14', '12', '10', '8'];
export const DEFAULT_WIRE_TYPE = WIRE_TYPES[0];
export const DEFAULT_WIRE_SIZE: WireSize = '12';
export const ROLES: { v: WireRole; label: string }[] = [
  { v: 'hot', label: 'Hot' }, { v: 'neutral', label: 'Neutral' }, { v: 'ground', label: 'Ground' }
];
export const isRole = (r: unknown): r is WireRole => r === 'hot' || r === 'neutral' || r === 'ground';
export const isWireSize = (s: unknown): s is WireSize => WIRE_SIZES.includes(s as WireSize);

export interface Conductor { role: WireRole; color: string; }

// Quick starts for the wire section; every one stays editable.
export const WIRE_PRESETS: { id: string; label: string; conductors: Conductor[] }[] = [
  { id: '208-1', label: '120/208 V · 1 circuit — Black, White, Green', conductors: [
    { role: 'hot', color: 'black' }, { role: 'neutral', color: 'white' }, { role: 'ground', color: 'green' }] },
  { id: '208-2', label: '120/208 V · 2 circuits — Black, Red, White, Green', conductors: [
    { role: 'hot', color: 'black' }, { role: 'hot', color: 'red' }, { role: 'neutral', color: 'white' }, { role: 'ground', color: 'green' }] },
  { id: '480-1', label: '277/480 V · 1 circuit — Brown, Gray, Green', conductors: [
    { role: 'hot', color: 'brown' }, { role: 'neutral', color: 'gray' }, { role: 'ground', color: 'green' }] },
  { id: '480-2', label: '277/480 V · 2 circuits — Brown, Orange, Gray, Green', conductors: [
    { role: 'hot', color: 'brown' }, { role: 'hot', color: 'orange' }, { role: 'neutral', color: 'gray' }, { role: 'ground', color: 'green' }] }
];

// ── feet and inches ──

const normalize = (text: string) => text.toLowerCase()
  .replace(/[\u2019\u2032\u2018`]/g, "'")
  .replace(/[\u201d\u2033\u201c]/g, '"')
  .replace(/(\d)\s*(?:feet|foot|ft)\b\.?/g, "$1'")
  .replace(/(\d)\s*(?:inches|inch|in)\b\.?/g, '$1"')
  .replace(/\s+/g, ' ')
  .trim();

// "6", "6.5", "6 1/2", "1/2", with an optional closing inch mark.
function inchesPart(raw: string): number | null {
  const s = raw.trim().replace(/"$/, '').trim();
  if (!s) return 0;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return parseFloat(m[1]);
  if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) return +m[3] ? +m[1] + +m[2] / +m[3] : null;
  if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) return +m[2] ? +m[1] / +m[2] : null;
  return null;
}

// Reads the ways people write a length: 12'  12'-6"  12' 6"  12'6  12-6  6"
// 6 1/2"  2.5'  12 ft 6 in. A bare number has no mark, so the caller says
// whether it means feet or inches. Result is inches, to the nearest 1/16.
export function parseLength(text: string, bare: 'ft' | 'in'): number | null {
  const s = normalize(text);
  if (!s) return null;
  let total: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(.*)$/))) {
    const inch = inchesPart(m[2]);
    total = inch === null ? null : parseFloat(m[1]) * 12 + inch;
  } else if ((m = s.match(/^(\d+)\s*-\s*(.+)$/))) {
    const inch = inchesPart(m[2]);
    total = inch === null ? null : parseInt(m[1], 10) * 12 + inch;
  } else if (s.endsWith('"')) {
    total = inchesPart(s);
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) {
    total = parseFloat(m[1]) * (bare === 'ft' ? 12 : 1);
  } else {
    total = inchesPart(s);
  }
  if (total === null || !Number.isFinite(total)) return null;
  return Math.round(total / SIXTEENTH) * SIXTEENTH;
}

// 144 -> 12'-0"   30 -> 2'-6"   6.5 -> 6 1/2"   81.0625 -> 6'-9 1/16"
export function formatLength(inches: number): string {
  const total = Math.round(inches / SIXTEENTH) * SIXTEENTH;
  let ft = Math.floor(total / 12 + 1e-9);
  let rem = Math.round((total - ft * 12) / SIXTEENTH) * SIXTEENTH;
  if (rem >= 12) { ft += 1; rem = 0; }
  const whole = Math.floor(rem + 1e-9);
  const sixteenths = Math.round((rem - whole) / SIXTEENTH);
  let frac = '';
  if (sixteenths) {
    let n = sixteenths, d = 16;
    while (n % 2 === 0) { n /= 2; d /= 2; }
    frac = `${n}/${d}`;
  }
  const inchText = frac ? (whole || ft > 0 ? `${whole} ${frac}` : frac) : String(whole);
  return ft === 0 ? `${inchText}"` : `${ft}'-${inchText}"`;
}

// Spacing the way it's typed: "2'-6"" for every gap, or "2', 3', 2'-6"" one
// per gap. Commas or semicolons separate gaps (spaces belong inside a length).
export function parseSpacings(text: string): { gaps: number[]; bad: string[] } {
  const gaps: number[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[,;]+/)) {
    const tok = raw.trim();
    if (!tok) continue;
    const v = parseLength(tok, 'in');
    if (v === null) bad.push(tok); else gaps.push(v);
  }
  return { gaps, bad };
}

// ── one build ──
export interface WireSpec { type: string; size: WireSize; conductors: Conductor[]; }
export interface WiremoldBuild {
  label: string;               // 'Rm 204 north wall'
  qty: number;                 // identical copies of this build
  lengthIn: number;            // overall run, inches
  devices: number;
  gapsIn: number[];            // devices - 1 gaps, inches
  startIn: number | null;      // first device from the LEFT end; null = centered
  deviceColors: string[];      // one per device
  feed: FeedEnd;
  wire: WireSpec;
}

export interface Layout {
  positions: number[];         // inches from the left end, one per device
  startIn: number;             // left end -> first device
  endIn: number;               // last device -> right end
  spanIn: number;              // first device -> last device
}

export function layoutBuild(b: Pick<WiremoldBuild, 'lengthIn' | 'gapsIn' | 'startIn'>): Layout {
  const span = b.gapsIn.reduce((n, g) => n + g, 0);
  const start = b.startIn ?? (b.lengthIn - span) / 2;
  const positions = [start];
  for (const g of b.gapsIn) positions.push(positions[positions.length - 1] + g);
  return { positions, startIn: start, endIn: b.lengthIn - start - span, spanIn: span };
}

// Authoritative check of a finished build (the server runs this too, so the
// API can't be handed nonsense). Returns the cleaned build or the first problem.
export type BuildCheck = { ok: true; build: WiremoldBuild } | { ok: false; error: string };

export function checkBuild(raw: any): BuildCheck {
  const bad = (error: string): BuildCheck => ({ ok: false, error });
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const r16 = (n: number) => Math.round(n / SIXTEENTH) * SIXTEENTH;

  const label = String(raw?.label ?? '').trim().slice(0, 60);
  const qty = num(raw?.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return bad(`quantity must be a whole number, 1–${MAX_QTY}`);
  const lengthIn = r16(num(raw?.lengthIn));
  if (!(lengthIn > 0)) return bad('length is required');
  if (lengthIn > MAX_LENGTH_IN) return bad(`length is over ${formatLength(MAX_LENGTH_IN)}`);
  const devices = num(raw?.devices);
  if (!Number.isInteger(devices) || devices < 1 || devices > MAX_DEVICES) return bad(`devices must be 1–${MAX_DEVICES}`);

  const gapsRaw: unknown[] = Array.isArray(raw?.gapsIn) ? raw.gapsIn : [];
  if (gapsRaw.length !== devices - 1) return bad(`${devices} devices need ${devices - 1} spacing${devices - 1 === 1 ? '' : 's'}`);
  const gapsIn = gapsRaw.map(g => r16(num(g)));
  if (gapsIn.some(g => !(g > 0))) return bad('every spacing must be longer than zero');

  let startIn: number | null = null;
  if (raw?.startIn !== null && raw?.startIn !== undefined) {
    startIn = r16(num(raw.startIn));
    if (!(startIn >= 0)) return bad('first-device distance must be zero or more');
  }
  const over = (startIn ?? 0) + gapsIn.reduce((n, g) => n + g, 0) - lengthIn;
  if (over > 1e-9) return bad(`devices run ${formatLength(over)} past the end of the run`);

  const colorsRaw: unknown[] = Array.isArray(raw?.deviceColors) ? raw.deviceColors : [];
  if (colorsRaw.length !== devices || !colorsRaw.every(isDeviceColor)) return bad('every device needs a color');

  if (raw?.feed !== 'left' && raw?.feed !== 'right' && raw?.feed !== 'both') return bad('choose a feed end');

  const w = raw?.wire;
  const type = String(w?.type ?? '').trim().slice(0, 40);
  if (!type) return bad('wire type is required');
  if (!isWireSize(w?.size)) return bad('wire size is required');
  const cs: unknown[] = Array.isArray(w?.conductors) ? w.conductors : [];
  if (!cs.length || cs.length > MAX_CONDUCTORS) return bad(`list 1–${MAX_CONDUCTORS} conductors`);
  const conductors: Conductor[] = [];
  for (const c of cs as any[]) {
    if (!isRole(c?.role) || !isWireColor(c?.color)) return bad('every conductor needs a role and a color');
    conductors.push({ role: c.role, color: c.color });
  }

  return {
    ok: true,
    build: {
      label, qty, lengthIn, devices, gapsIn, startIn, deviceColors: colorsRaw as string[],
      feed: raw.feed, wire: { type, size: w.size, conductors }
    }
  };
}

// ── what the foreman has typed ──
export interface BuildDraft {
  label: string;
  qty: string;
  length: string;          // "12'" — a bare number means feet
  devices: string;
  spacing: string;         // "2'-6"" or "2', 3'" — a bare number means inches
  start: string;           // blank = centered; a bare number means inches
  feed: FeedEnd;
  deviceColor: string;     // color for every device…
  colors: string[];        // …unless this has an entry for that device
  each: boolean;           // the "color each device" panel is open
  wireType: string;
  wireSize: WireSize;
  conductors: Conductor[];
}

export const emptyBuildDraft = (): BuildDraft => ({
  label: '', qty: '1', length: '', devices: '', spacing: '', start: '', feed: 'left',
  deviceColor: DEFAULT_DEVICE_COLOR, colors: [], each: false,
  wireType: DEFAULT_WIRE_TYPE, wireSize: DEFAULT_WIRE_SIZE,
  conductors: WIRE_PRESETS[0].conductors.map(c => ({ ...c }))
});

export type DraftField = 'qty' | 'length' | 'devices' | 'spacing' | 'start' | 'wire' | 'fit';
export interface DraftResult {
  build: WiremoldBuild | null;                 // set only when nothing is wrong
  errors: Partial<Record<DraftField, string>>;
  echo: { length?: string; spacing?: string; start?: string; end?: string };   // how it was understood
  complete: boolean;                           // false while the essentials are still blank
}

// Turns typed text into a build, with a friendly message for each field that
// can't be read yet. Fields left blank aren't errors until the foreman submits
// (`complete` says whether the essentials are filled in).
export function resolveDraft(d: BuildDraft): DraftResult {
  const errors: DraftResult['errors'] = {};
  const echo: DraftResult['echo'] = {};
  let complete = true;

  // quantity
  let qty = NaN;
  if (/^\d+$/.test(d.qty.trim())) qty = parseInt(d.qty, 10);
  if (!(qty >= 1 && qty <= MAX_QTY)) errors.qty = `1–${MAX_QTY}`;

  // length
  let lengthIn = NaN;
  if (!d.length.trim()) complete = false;
  else {
    const v = parseLength(d.length, 'ft');
    if (v === null || !(v > 0)) errors.length = `Type the length like 12' or 12'-6"`;
    else if (v > MAX_LENGTH_IN) errors.length = `Longest run on one build is ${formatLength(MAX_LENGTH_IN)}`;
    else { lengthIn = v; echo.length = formatLength(v); }
  }

  // devices
  let devices = NaN;
  if (!d.devices.trim()) complete = false;
  else if (!/^\d+$/.test(d.devices.trim()) || +d.devices < 1 || +d.devices > MAX_DEVICES) errors.devices = `1–${MAX_DEVICES}`;
  else devices = parseInt(d.devices, 10);

  // spacing
  let gaps: number[] | null = null;
  if (Number.isFinite(devices)) {
    if (devices === 1) gaps = [];
    else if (!d.spacing.trim()) complete = false;
    else {
      const p = parseSpacings(d.spacing);
      if (p.bad.length) errors.spacing = `"${p.bad[0]}" isn't a length — try 2'-6" or 30"`;
      else if (p.gaps.some(g => !(g > 0))) errors.spacing = 'Spacing must be more than zero';
      else if (p.gaps.length === 1) { gaps = Array(devices - 1).fill(p.gaps[0]); echo.spacing = `${formatLength(p.gaps[0])} between each`; }
      else if (p.gaps.length === devices - 1) {
        gaps = p.gaps;
        echo.spacing = `${formatLength(p.gaps.reduce((a, b) => a + b, 0))} from first to last`;
      } else errors.spacing = `${devices} devices have ${devices - 1} gaps — type one spacing for all, or ${devices - 1} separated by commas`;
    }
  }

  // first-device distance
  let startIn: number | null = null;
  if (d.start.trim()) {
    const v = parseLength(d.start, 'in');
    if (v === null || v < 0) errors.start = `Type the distance like 1'-6" or 18"`;
    else { startIn = v; echo.start = formatLength(v); }
  }

  // does it fit?
  if (Number.isFinite(lengthIn) && gaps && !errors.start) {
    const lay = layoutBuild({ lengthIn, gapsIn: gaps, startIn });
    const over = (startIn ?? 0) + lay.spanIn - lengthIn;
    if (over > 1e-9) {
      errors.fit = `The devices run ${formatLength(over)} past the end of the run — shorten the spacing or the offset, or lengthen the run`;
    } else {
      if (startIn === null) echo.start = `${formatLength(lay.startIn)} (centered)`;
      echo.end = formatLength(lay.endIn);
    }
  }

  // wire
  if (!d.conductors.length) errors.wire = 'Add at least one conductor';
  else if (d.conductors.length > MAX_CONDUCTORS) errors.wire = `Up to ${MAX_CONDUCTORS} conductors`;

  let build: WiremoldBuild | null = null;
  if (complete && !Object.keys(errors).length && Number.isFinite(lengthIn) && Number.isFinite(devices) && gaps) {
    const colors = Array.from({ length: devices }, (_, i) =>
      isDeviceColor(d.colors[i]) ? d.colors[i] : isDeviceColor(d.deviceColor) ? d.deviceColor : DEFAULT_DEVICE_COLOR);
    const chk = checkBuild({
      label: d.label, qty, lengthIn, devices, gapsIn: gaps, startIn, deviceColors: colors, feed: d.feed,
      wire: { type: d.wireType, size: d.wireSize, conductors: d.conductors }
    });
    if (chk.ok) build = chk.build; else errors.wire = chk.error;
  }
  return { build, errors, echo, complete };
}

// ── the to-scale drawing ──
// Long runs wrap into equal rows (up to 20 ft each) so the drawing stays
// readable and prints. Everything is in inches from the LEFT end of the run.
export const ROW_TARGET_IN = 240;

export interface GeoRow { index: number; from: number; to: number; }
export interface GeoDevice { index: number; at: number; row: number; color: DeviceColor; }
export interface GeoSegment {
  kind: 'lead' | 'gap' | 'tail';
  dim: number;               // pieces of one dimension share this number
  from: number; to: number; row: number;
  label: string;             // the whole dimension's text, e.g. 2'-6" (the drawing prints it once, where it fits)
  startsHere: boolean;       // this piece holds the start of the dimension
  endsHere: boolean;         // …and this one holds the end
}
export interface Geometry {
  lengthIn: number;
  rows: GeoRow[];
  devices: GeoDevice[];
  segments: GeoSegment[];
  layout: Layout;
}

export function wiremoldGeometry(b: WiremoldBuild): Geometry {
  const nRows = Math.max(1, Math.ceil(b.lengthIn / ROW_TARGET_IN - 1e-9));
  const rowIn = b.lengthIn / nRows;
  const rows: GeoRow[] = Array.from({ length: nRows }, (_, i) => ({ index: i, from: i * rowIn, to: (i + 1) * rowIn }));
  const rowOf = (at: number) => Math.min(nRows - 1, Math.max(0, Math.floor(at / rowIn + 1e-9)));

  const layout = layoutBuild(b);
  const devices: GeoDevice[] = layout.positions.map((at, i) => ({
    index: i, at, row: rowOf(at), color: deviceColor(b.deviceColors[i])
  }));

  // A dimension runs from `a` to `z`; draw a piece of it on every row it crosses.
  const segs: GeoSegment[] = [];
  let dimCount = 0;
  const addDim = (kind: GeoSegment['kind'], a: number, z: number) => {
    if (z - a < 1e-6) return;
    const label = formatLength(z - a);
    const dim = dimCount++;
    for (const r of rows) {
      const from = Math.max(a, r.from), to = Math.min(z, r.to);
      if (to - from < 1e-6) continue;
      segs.push({ kind, dim, from, to, row: r.index, label, startsHere: from === a, endsHere: to === z });
    }
  };
  addDim('lead', 0, layout.positions[0]);
  for (let i = 0; i < b.gapsIn.length; i++) addDim('gap', layout.positions[i], layout.positions[i + 1]);
  addDim('tail', layout.positions[layout.positions.length - 1], b.lengthIn);

  return { lengthIn: b.lengthIn, rows, devices, segments: segs, layout };
}

// ── wire to cut ──
export interface CutLine { type: string; size: WireSize; color: WireColor; pieces: number; inches: number; }
export interface TicketTotals { builds: number; runs: number; devices: number; wireInches: number; lines: CutLine[]; }

// Every conductor is cut to the length of the run, times the quantity.
export function ticketTotals(builds: WiremoldBuild[]): TicketTotals {
  const acc = new Map<string, CutLine>();
  let runs = 0, devices = 0, wireInches = 0;
  for (const b of builds) {
    runs += b.qty;
    devices += b.devices * b.qty;
    for (const c of b.wire.conductors) {
      const key = `${b.wire.type}|${b.wire.size}|${c.color}`;
      const line = acc.get(key) || { type: b.wire.type, size: b.wire.size, color: wireColor(c.color), pieces: 0, inches: 0 };
      line.pieces += b.qty;
      line.inches += b.lengthIn * b.qty;
      acc.set(key, line);
      wireInches += b.lengthIn * b.qty;
    }
  }
  const colorOrder = (k: string) => WIRE_COLORS.findIndex(c => c.key === k);
  const lines = Array.from(acc.values()).sort((a, b) =>
    WIRE_SIZES.indexOf(a.size) - WIRE_SIZES.indexOf(b.size)
    || a.type.localeCompare(b.type)
    || colorOrder(a.color.key) - colorOrder(b.color.key));
  return { builds: builds.length, runs, devices, wireInches, lines };
}

export const fmtFeetDecimal = (inches: number) => {
  const ft = Math.round((inches / 12) * 10) / 10;
  return `${ft.toLocaleString('en-US', { maximumFractionDigits: 1 })} ft`;
};
export const sizeLabel = (s: WireSize) => `#${s}`;

// ── the record stored by the function ──
export interface WiremoldTicket {
  id: string;            // 'WM-1001'
  job: string;
  by: string;            // foreman display name, set from the session
  needBy: string;        // ISO date or ''
  priority: 'Standard' | 'Hot';
  notes: string;
  status: WmStatus;
  builds: WiremoldBuild[];
  createdAt: string;
}

export type CleanTicket =
  | { ok: true; value: Pick<WiremoldTicket, 'job' | 'needBy' | 'priority' | 'notes' | 'builds'> }
  | { ok: false; error: string };

export function cleanTicketInput(body: any): CleanTicket {
  const job = String(body?.job ?? '').trim().slice(0, 120);
  if (!job) return { ok: false, error: 'Job name is required' };
  const needBy = typeof body?.needBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.needBy) ? body.needBy : '';
  const priority = body?.priority === 'Hot' ? 'Hot' : 'Standard';
  const notes = String(body?.notes ?? '').slice(0, 2000);
  if (!Array.isArray(body?.builds) || !body.builds.length) return { ok: false, error: 'Add at least one build' };
  if (body.builds.length > MAX_BUILDS) return { ok: false, error: `Up to ${MAX_BUILDS} builds on one ticket` };

  const builds: WiremoldBuild[] = [];
  for (let i = 0; i < body.builds.length; i++) {
    const chk = checkBuild(body.builds[i]);
    const name = String(body.builds[i]?.label ?? '').trim() || `Build ${i + 1}`;
    if (!chk.ok) return { ok: false, error: `${name}: ${chk.error}` };
    builds.push({ ...chk.build, label: chk.build.label || `Build ${i + 1}` });
  }
  return { ok: true, value: { job, needBy, priority, notes, builds } };
}
