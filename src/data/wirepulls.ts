// Wire pull engine — turns a foreman's pull sheet (box → circuits → footage)
// into the report Harry cuts from: for EACH BOX, how many wires of each color
// and how many feet of each.
//
// The sheet mirrors the paper pull sheet the field already uses: one row per
// BOX, listing the circuits that go to that box and the footage. Footage can be
// ONE number (used for every circuit in the box, like the paper sheet) or ONE
// PER CIRCUIT in the same order the circuits are listed — "205" or
// "205, 200, 195, 190". Each circuit is its own wire, and its color comes from
// its circuit number. A circuit can also be marked as carrying a NEUTRAL: that
// adds a second wire of the same length in the system's neutral color (white on
// 208Y/120, gray on 480Y/277), listed in its own line of the box's report.
//
// Phase colors follow the Yale Design Standard, Division 26 05 00 (Conductors
// and Cables), section G.1:
//   208Y/120 V  — black A, red B, blue C, white neutral
//   480Y/277 V  — brown A, orange B, yellow C, gray neutral
//   (480 V 3-wire uses the same phase colors and simply has no neutral)
//
// A panel's breaker positions run down two columns (odd left, even right) and
// each PAIR of positions shares a phase, cycling A-B-C every six positions:
//   1-2 = A,  3-4 = B,  5-6 = C,  7-8 = A, ...
//   phase index of circuit n  =  floor((n - 1) / 2) mod 3
//
// This file is imported by BOTH the browser and the Netlify function, so it
// must stay pure — no DOM, no React, no Node-only APIs.

export type VoltageSystem = '208Y/120' | '480Y/277';
export type WirePullStatus = 'Submitted' | 'In Build' | 'Ready' | 'Closed';

export const WP_STATUSES: WirePullStatus[] = ['Submitted', 'In Build', 'Ready', 'Closed'];
export const MAX_FOOTAGE = 2000;
export const MAX_CIRCUIT = 84;   // largest panel the shop sees
export const MAX_BOXES = 80;

// ── colors ──
export interface WireColor {
  key: string;
  label: string;  // spelled out so a black-and-white printout still reads
  short: string;
  hex: string;
  ink: string;    // readable text color on top of hex
}
export const WIRE_COLORS: Record<string, WireColor> = {
  black:  { key: 'black',  label: 'Black',  short: 'BLK', hex: '#1b1a19', ink: '#ffffff' },
  red:    { key: 'red',    label: 'Red',    short: 'RED', hex: '#c8261b', ink: '#ffffff' },
  blue:   { key: 'blue',   label: 'Blue',   short: 'BLU', hex: '#1f5fbf', ink: '#ffffff' },
  brown:  { key: 'brown',  label: 'Brown',  short: 'BRN', hex: '#6b4423', ink: '#ffffff' },
  orange: { key: 'orange', label: 'Orange', short: 'ORG', hex: '#ee8a0c', ink: '#201e1d' },
  yellow: { key: 'yellow', label: 'Yellow', short: 'YEL', hex: '#f5cf1e', ink: '#201e1d' },
  white:  { key: 'white',  label: 'White',  short: 'WHT', hex: '#ffffff', ink: '#201e1d' },
  gray:   { key: 'gray',   label: 'Gray',   short: 'GRY', hex: '#8b9098', ink: '#201e1d' }
};

export interface SystemDef {
  v: VoltageSystem;
  label: string;
  blurb: string;
  phases: [string, string, string]; // color keys for phase A, B, C
  neutral: string;                  // color key for the neutral
}
export const SYSTEMS: SystemDef[] = [
  { v: '208Y/120', label: '208Y/120 V', blurb: 'Black · Red · Blue — white neutral', phases: ['black', 'red', 'blue'], neutral: 'white' },
  { v: '480Y/277', label: '480Y/277 V or 480 V', blurb: 'Brown · Orange · Yellow — gray neutral', phases: ['brown', 'orange', 'yellow'], neutral: 'gray' }
];
export const DEFAULT_SYSTEM: VoltageSystem = '208Y/120';
export const systemDef = (v: string): SystemDef => SYSTEMS.find(s => s.v === v) || SYSTEMS[0];
export const isSystem = (v: unknown): v is VoltageSystem => SYSTEMS.some(s => s.v === v);

// ── phase math ──
export const PHASE_LETTERS = ['A', 'B', 'C'] as const;
export const phaseIndex = (circuit: number): number => ((Math.floor((circuit - 1) / 2) % 3) + 3) % 3;
export const phaseColor = (circuit: number, system: VoltageSystem): WireColor =>
  WIRE_COLORS[systemDef(system).phases[phaseIndex(circuit)]];

// ── typing it in ──
// Foremen type circuits the way they write them on paper: "18, 19, 21" or
// "1,2,38." — commas, spaces or both, with the odd trailing period.
export function parseCircuits(text: string): { circuits: number[]; bad: string[] } {
  const circuits: number[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const tok = raw.replace(/[.]+$/, '');
    if (!tok) continue;
    if (/^\d{1,3}$/.test(tok)) circuits.push(parseInt(tok, 10));
    else bad.push(tok);
  }
  return { circuits, bad };
}

// Footage the same way: "205", "205'", "205 ft", or a list "205, 200, 195".
export function parseFootages(text: string): { footages: number[]; bad: string[] } {
  const footages: number[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const tok = raw.replace(/(?:'|\u2019|\u2032|ft|feet|\.)+$/i, '');
    if (!tok) continue;
    if (/^\d{1,4}$/.test(tok)) footages.push(parseInt(tok, 10));
    else bad.push(tok);
  }
  return { footages, bad };
}

// ── the wire itself: insulation type and size ──
// The same lists the Wiremold tickets use. A sheet has one wire for the whole
// panel; a box can have its own (a long run upsized to #10, say).
export const WIRE_TYPES = ['THHN/THWN-2', 'XHHW-2', 'Other — see notes'];
export const WIRE_SIZES = ['14', '12', '10', '8'];
export const DEFAULT_WIRE_TYPE = WIRE_TYPES[0];
export const DEFAULT_WIRE_SIZE = '12';
export const isWireType = (v: unknown): v is string => typeof v === 'string' && WIRE_TYPES.includes(v);
export const isWireSize = (v: unknown): v is string => typeof v === 'string' && WIRE_SIZES.includes(v);
export interface WireSpec { type: string; size: string; }
// '#12 THHN/THWN-2'. A sheet sent before wire could be chosen has none — say so
// rather than guess.
export const wireSpecLabel = (w: WireSpec | null) => (w ? `#${w.size} ${w.type}` : 'Wire not specified');
const specKey = (w: WireSpec | null) => (w ? `${w.size}|${w.type}` : '');

// ── rows ──
export interface Wire {
  circuit: number;
  footage: number | null;  // null = not measured yet; nothing to cut for it
  neutral: boolean;        // this circuit also carries a neutral (same length, neutral color)
}
export interface BoxRow {
  box: string;             // box number as written: '39', '12A'
  wires: Wire[];           // one wire per circuit, in the order listed
  wireType?: string;       // only when this box's wire differs from the sheet's…
  wireSize?: string;       // …both are given together, or neither
}
// The wire a box is pulled in: its own if it has one, otherwise the sheet's.
export function boxWire(row: Pick<BoxRow, 'wireType' | 'wireSize'>, sheet?: { wireType?: string; wireSize?: string }): WireSpec | null {
  if (isWireType(row.wireType) && isWireSize(row.wireSize)) return { type: row.wireType, size: row.wireSize };
  if (sheet && isWireType(sheet.wireType) && isWireSize(sheet.wireSize)) return { type: sheet.wireType, size: sheet.wireSize };
  return null;
}

// One footage typed → every wire gets it. A list → one per circuit, in order.
// None → not measured. (checkBoxRows has already rejected any other count.)
export function wiresFor(circuits: number[], footages: number[], neutrals: number[] = []): Wire[] {
  return circuits.map((circuit, i) => ({
    circuit,
    footage: footages.length === 0 ? null : footages.length === 1 ? footages[0] : (footages[i] ?? null),
    neutral: neutrals.includes(circuit)
  }));
}

// What the screen hands the checker for each row (blank rows included, so the
// answers line up with the rows on screen).
export interface BoxInput {
  box: string;
  circuits: number[];
  bad: string[];           // unreadable bits of the circuit text
  footages: number[];
  footageBad: string[];    // unreadable bits of the footage text
}

const isBlankInput = (r: BoxInput) =>
  !r.box.trim() && !r.circuits.length && !r.bad.length && !r.footages.length && !r.footageBad.length;

// One message (or null) per row. Null = fine. Blank rows are always fine —
// they're just empty lines on the sheet. The same circuit can be pulled to
// more than one box on a sheet, so a repeat on another row is allowed (see
// repeatNotes). Inside one row a repeat is still a typo.
export function checkBoxRows(rows: BoxInput[]): (string | null)[] {
  return rows.map(r => {
    if (isBlankInput(r)) return null;
    if (r.bad.length) return `"${r.bad[0]}" isn't a circuit number — list each circuit separately`;
    if (!r.box.trim()) return 'needs a box number';
    if (!r.circuits.length) return 'list at least one circuit';
    const seen = new Set<number>();
    for (const c of r.circuits) {
      if (c < 1 || c > MAX_CIRCUIT) return `circuit ${c} isn't on a panel (1–${MAX_CIRCUIT})`;
      if (seen.has(c)) return `circuit ${c} is listed twice`;
      seen.add(c);
    }
    if (r.footageBad.length) return `"${r.footageBad[0]}" isn't a footage — use whole feet, like 205`;
    if (r.footages.some(f => !Number.isInteger(f) || f < 1 || f > MAX_FOOTAGE)) {
      return `footage must be 1–${MAX_FOOTAGE}`;
    }
    if (r.footages.length > 1 && r.footages.length !== r.circuits.length) {
      return `${r.circuits.length} circuits but ${r.footages.length} footages — type one footage for all, or one per circuit`;
    }
    return null;
  });
}

// A circuit pulled to more than one box is normal — and it is also exactly
// what a slip looks like (12 written for 13). So the sheet says, without
// blocking anything, where else each repeated circuit appears. One note (or
// null) per row. Never an error.
export function repeatNotes(rows: BoxInput[]): (string | null)[] {
  const where = new Map<number, number[]>();          // circuit -> the rows it is on
  rows.forEach((r, i) => {
    if (isBlankInput(r)) return;
    for (const c of new Set(r.circuits)) where.set(c, [...(where.get(c) || []), i]);
  });
  const label = (j: number) => (rows[j].box.trim() ? `box ${rows[j].box.trim()}` : `row ${j + 1}`);
  return rows.map((r, i) => {
    if (isBlankInput(r)) return null;
    const parts: string[] = [];
    for (const c of new Set(r.circuits)) {
      const others = Array.from(new Set((where.get(c) || []).filter(j => j !== i).map(label)));
      if (others.length) parts.push(`circuit ${c} is also in ${others.join(', ')}`);
    }
    if (!parts.length) return null;
    const text = parts.join(' · ');
    return text[0].toUpperCase() + text.slice(1);
  });
}

// ── the report Harry cuts from ──
// Per box, per color: which wires, how many, how many feet. Each box has up to
// four lines — the three phase colors plus the neutral — and only the ones in
// use are listed.
export interface ColorGroup {
  color: WireColor;
  phase: 'A' | 'B' | 'C' | 'N';
  kind: 'hot' | 'neutral';
  wires: Wire[];          // every wire of this color in the box, in listed order
  feet: number;           // combined footage of the measured ones
  unmeasured: number;     // wires here with no footage yet
}
export interface BoxReport {
  box: string;
  wire: WireSpec | null;  // the wire this box is pulled in (null: sent before wire could be chosen)
  ownWire: boolean;       // true when the box has its own wire, different from the sheet's
  groups: ColorGroup[];   // A, B, C, then neutral — only lines that are in use
  wires: number;          // total conductors in the box (hots + neutrals)
  feet: number;
  unmeasured: number;
}
export interface ColorTotal {
  color: WireColor;
  phase: 'A' | 'B' | 'C' | 'N';
  kind: 'hot' | 'neutral';
  wires: number;
  feet: number;
  unmeasured: number;
}
// Everything pulled in one wire (one type and size), by color — one spool rack's worth.
export interface WireTotal {
  wire: WireSpec | null;
  label: string;          // '#12 THHN/THWN-2'
  boxes: string[];        // the boxes pulled in this wire
  totals: ColorTotal[];
  wires: number;
  feet: number;
  unmeasured: number;
}
export interface SheetReport {
  boxes: BoxReport[];
  byWire: WireTotal[];    // one entry per wire in use — the sheet's own wire first
  totals: ColorTotal[];   // every box combined, by color (all wires together)
  wires: number;
  feet: number;
  unmeasured: number;
}

export function buildReport(rows: BoxRow[], system: VoltageSystem, sheetWire?: { wireType?: string; wireSize?: string }): SheetReport {
  const def = systemDef(system);
  const slots = [
    ...[0, 1, 2].map(i => ({ color: WIRE_COLORS[def.phases[i]], phase: PHASE_LETTERS[i] as 'A' | 'B' | 'C' | 'N', kind: 'hot' as const })),
    { color: WIRE_COLORS[def.neutral], phase: 'N' as 'A' | 'B' | 'C' | 'N', kind: 'neutral' as const }
  ];
  const NEUTRAL = 3;
  const totals: ColorTotal[] = slots.map(sl => ({ ...sl, wires: 0, feet: 0, unmeasured: 0 }));

  // one running total per wire (type + size), in the order they are first met —
  // except the sheet's own wire, which always leads
  const sheetSpec = boxWire({}, sheetWire);
  const perWire = new Map<string, { wire: WireSpec | null; boxes: string[]; totals: ColorTotal[] }>();
  const bucket = (w: WireSpec | null) => {
    const k = specKey(w);
    if (!perWire.has(k)) perWire.set(k, { wire: w, boxes: [], totals: slots.map(sl => ({ ...sl, wires: 0, feet: 0, unmeasured: 0 })) });
    return perWire.get(k)!;
  };
  if (sheetSpec && rows.some(r => specKey(boxWire(r, sheetWire)) === specKey(sheetSpec))) bucket(sheetSpec);

  const boxes: BoxReport[] = rows.map(r => {
    const wire = boxWire(r, sheetWire);
    const mine = bucket(wire);
    if (!mine.boxes.includes(r.box)) mine.boxes.push(r.box);
    const groups: ColorGroup[] = slots.map(sl => ({ ...sl, wires: [], feet: 0, unmeasured: 0 }));
    const add = (slot: number, w: Wire) => {
      groups[slot].wires.push(w);
      totals[slot].wires += 1;
      mine.totals[slot].wires += 1;
      if (w.footage === null) { groups[slot].unmeasured += 1; totals[slot].unmeasured += 1; mine.totals[slot].unmeasured += 1; }
      else { groups[slot].feet += w.footage; totals[slot].feet += w.footage; mine.totals[slot].feet += w.footage; }
    };
    for (const w of r.wires) {
      add(phaseIndex(w.circuit), w);
      if (w.neutral) add(NEUTRAL, w);
    }
    const used = groups.filter(g => g.wires.length);
    return {
      box: r.box,
      wire,
      ownWire: specKey(wire) !== specKey(sheetSpec),
      groups: used,
      wires: used.reduce((n, g) => n + g.wires.length, 0),
      feet: used.reduce((n, g) => n + g.feet, 0),
      unmeasured: used.reduce((n, g) => n + g.unmeasured, 0)
    };
  });

  const used = totals.filter(t => t.wires > 0);
  const byWire: WireTotal[] = Array.from(perWire.values()).map(b => {
    const t = b.totals.filter(x => x.wires > 0);
    return {
      wire: b.wire, label: wireSpecLabel(b.wire), boxes: b.boxes, totals: t,
      wires: t.reduce((n, x) => n + x.wires, 0),
      feet: t.reduce((n, x) => n + x.feet, 0),
      unmeasured: t.reduce((n, x) => n + x.unmeasured, 0)
    };
  });
  return {
    boxes,
    byWire,
    totals: used,
    wires: used.reduce((n, t) => n + t.wires, 0),
    feet: used.reduce((n, t) => n + t.feet, 0),
    unmeasured: used.reduce((n, t) => n + t.unmeasured, 0)
  };
}

export const fmtFeet = (n: number) => `${n.toLocaleString('en-US')} ft`;

// ── attached panel schedules ──
// Foremen attach the panel schedule so prefab can see which circuits are 1-, 2-
// and 3-pole. PDF or photo, a few per sheet, kept small so uploads stay quick
// on a phone and fit inside a Netlify function request.
export interface FileMeta {
  id: string;
  name: string;
  type: 'application/pdf' | 'image/png' | 'image/jpeg';
  size: number;
}
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FILES = 3;
export const FILE_ACCEPT = 'application/pdf,image/png,image/jpeg,image/*';

// Decide a file's real type from its first bytes, not from its name or what
// the browser claimed — so only genuine PDFs and PNG/JPEG photos are stored.
export function sniffFileType(b: Uint8Array): FileMeta['type'] | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}
export const cleanFileName = (raw: string): string =>
  (raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 100)) || 'panel-schedule';

// ── the record stored by the function ──
export interface WirePullSheet {
  id: string;          // 'WP-1001'
  job: string;
  floor: string;
  panel: string;       // 'PP4-2'
  system: VoltageSystem;
  wireType?: string;   // insulation type for the sheet (absent on sheets sent before wire could be chosen)
  wireSize?: string;   // '12' = #12
  by: string;          // foreman display name, set from the session
  needBy: string;      // ISO date or ''
  priority: 'Standard' | 'Hot';
  notes: string;
  status: WirePullStatus;
  boxes: BoxRow[];
  files?: FileMeta[];  // attached panel schedules (absent on older sheets)
  createdAt: string;
}

// Shape + sanity validation for a submitted sheet. Used by the Netlify
// function so the API can't be fed nonsense, and runs the same checkBoxRows()
// the sheet screen uses, so the two can never disagree.
export type CleanSheet =
  | { ok: true; value: Pick<WirePullSheet, 'job' | 'floor' | 'panel' | 'system' | 'wireType' | 'wireSize' | 'needBy' | 'priority' | 'notes' | 'boxes'> }
  | { ok: false; error: string };

export function cleanSheetInput(body: any): CleanSheet {
  const job = String(body?.job ?? '').trim().slice(0, 120);
  if (!job) return { ok: false, error: 'Job name is required' };
  const panel = String(body?.panel ?? '').trim().slice(0, 40);
  if (!panel) return { ok: false, error: 'Panel name is required' };
  const floor = String(body?.floor ?? '').trim().slice(0, 20);
  if (!isSystem(body?.system)) return { ok: false, error: 'Unknown voltage system' };
  const system = body.system as VoltageSystem;
  // Wire type and size travel together. A browser still running the page from
  // before they existed sends neither, and that sheet is stored without them.
  const sheetWire: { wireType?: string; wireSize?: string } = {};
  if (body?.wireType !== undefined || body?.wireSize !== undefined) {
    if (!isWireType(body.wireType)) return { ok: false, error: 'Unknown wire type' };
    if (!isWireSize(body.wireSize)) return { ok: false, error: 'Unknown wire size' };
    sheetWire.wireType = body.wireType; sheetWire.wireSize = body.wireSize;
  }
  const needBy = typeof body?.needBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.needBy) ? body.needBy : '';
  const priority = body?.priority === 'Hot' ? 'Hot' : 'Standard';
  const notes = String(body?.notes ?? '').slice(0, 2000);

  if (!Array.isArray(body?.boxes) || !body.boxes.length) {
    return { ok: false, error: 'List at least one box with its circuits' };
  }
  if (body.boxes.length > MAX_BOXES) return { ok: false, error: 'Too many boxes on one sheet' };

  const inputs: BoxInput[] = [];
  const neutralsByRow: number[][] = [];
  const wireByRow: { wireType?: string; wireSize?: string }[] = [];
  for (const raw of body.boxes) {
    const box = String(raw?.box ?? '').trim().slice(0, 20);
    const own: { wireType?: string; wireSize?: string } = {};
    if (raw?.wireType !== undefined || raw?.wireSize !== undefined) {
      if (!isWireType(raw.wireType)) return { ok: false, error: `Box ${box || '?'}: unknown wire type` };
      if (!isWireSize(raw.wireSize)) return { ok: false, error: `Box ${box || '?'}: unknown wire size` };
      own.wireType = raw.wireType; own.wireSize = raw.wireSize;
    }
    wireByRow.push(own);
    const wires: any[] = Array.isArray(raw?.wires) ? raw.wires : [];
    const circuits = wires.map(w => Number(w?.circuit));
    const neutrals = wires.filter(w => w?.neutral === true).map(w => Number(w.circuit));
    if (circuits.some(c => !Number.isInteger(c))) return { ok: false, error: 'Circuits must be whole numbers' };
    const given = wires.map(w => (w?.footage === null || w?.footage === undefined ? null : Number(w.footage)));
    const measured = given.filter(f => f !== null) as number[];
    if (measured.length && measured.length !== given.length) {
      return { ok: false, error: `Box ${box || '?'}: give a footage for every wire in the box, or none` };
    }
    if (measured.some(f => !Number.isInteger(f))) return { ok: false, error: 'Footage must be whole feet' };
    inputs.push({ box, circuits, bad: [], footages: measured, footageBad: [] });
    neutralsByRow.push(neutrals);
  }

  const problems = checkBoxRows(inputs);
  const first = problems.findIndex(p => p !== null);
  if (first >= 0) {
    const label = inputs[first].box ? `Box ${inputs[first].box}` : `Row ${first + 1}`;
    return { ok: false, error: `${label}: ${problems[first]}` };
  }
  // The checker doesn't treat an empty row as an error, but a sheet with an
  // empty row in it is malformed — the screen never sends one.
  if (inputs.some(i => !i.box && !i.circuits.length)) return { ok: false, error: 'Empty box row' };

  const boxes: BoxRow[] = inputs.map((i, n) => ({ box: i.box, wires: wiresFor(i.circuits, i.footages, neutralsByRow[n]), ...wireByRow[n] }));
  return { ok: true, value: { job, floor, panel, system, ...sheetWire, needBy, priority, notes, boxes } };
}
