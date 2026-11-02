// Wire pull engine — decides what colors of wire a panel's circuits need, and
// rolls a foreman's footages up into a cut list for the prefab shop.
//
// Phase colors follow the Yale Design Standard, Division 26 05 00 (Conductors
// and Cables), section G.1:
//   208Y/120 V  — black A, red B, blue C, white neutral, green ground
//   480Y/277 V  — brown A, orange B, yellow C, gray neutral, green ground
//   480 V       — same as 480Y/277 but no neutral
//
// A panel's breaker positions run down two columns (odd on the left, even on
// the right) and each PAIR of positions shares a phase, cycling A-B-C every six
// positions:  1-2 = A,  3-4 = B,  5-6 = C,  7-8 = A, ...
//   phase index of position n  =  floor((n - 1) / 2) mod 3
// A 2-pole breaker at circuit 1 sits on positions 1 and 3 (A and B); a 3-pole
// at circuit 1 sits on 1, 3 and 5 (A, B and C). Poles step by two positions.
//
// This file is imported by BOTH the browser and the Netlify function, so it
// must stay pure — no DOM, no React, no Node-only APIs.

export type VoltageSystem = '208Y/120' | '480Y/277' | '480';
export type WireSize = '14' | '12' | '10' | '8' | '6' | '4' | '3' | '2' | '1';
export type WireRole = 'hot' | 'neutral' | 'ground';
export type WirePullStatus = 'Submitted' | 'In Build' | 'Ready' | 'Closed';
export type Poles = 1 | 2 | 3;

export const WP_STATUSES: WirePullStatus[] = ['Submitted', 'In Build', 'Ready', 'Closed'];
export const WIRE_SIZES: WireSize[] = ['14', '12', '10', '8', '6', '4', '3', '2', '1'];
export const DEFAULT_WIRE_SIZE: WireSize = '12'; // Yale 26 05 00 B.2: #12 minimum for branch circuits
export const PANEL_SPACES = [12, 18, 20, 24, 30, 36, 40, 42, 54, 66, 72, 84];
export const MAX_FOOTAGE = 2000;
export const MAX_SPACES = 84;

export const sizeLabel = (s: WireSize) => `#${s}`;

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
  gray:   { key: 'gray',   label: 'Gray',   short: 'GRY', hex: '#6f747c', ink: '#ffffff' },
  white:  { key: 'white',  label: 'White',  short: 'WHT', hex: '#ffffff', ink: '#201e1d' },
  green:  { key: 'green',  label: 'Green',  short: 'GRN', hex: '#2e8b57', ink: '#ffffff' }
};

export interface SystemDef {
  v: VoltageSystem;
  label: string;
  blurb: string;
  phases: [string, string, string]; // color keys for phase A, B, C
  neutral: string | null;           // color key, or null when the system has no neutral
}
export const SYSTEMS: SystemDef[] = [
  { v: '208Y/120', label: '208Y/120 V', blurb: 'Black · Red · Blue — white neutral', phases: ['black', 'red', 'blue'], neutral: 'white' },
  { v: '480Y/277', label: '480Y/277 V', blurb: 'Brown · Orange · Yellow — gray neutral', phases: ['brown', 'orange', 'yellow'], neutral: 'gray' },
  { v: '480', label: '480 V (no neutral)', blurb: 'Brown · Orange · Yellow — no neutral', phases: ['brown', 'orange', 'yellow'], neutral: null }
];
export const DEFAULT_SYSTEM: VoltageSystem = '208Y/120';
export const systemDef = (v: string): SystemDef => SYSTEMS.find(s => s.v === v) || SYSTEMS[0];
export const isSystem = (v: unknown): v is VoltageSystem => SYSTEMS.some(s => s.v === v);
export const isSize = (v: unknown): v is WireSize => WIRE_SIZES.includes(v as WireSize);

// ── phase / position math ──
export const PHASE_LETTERS = ['A', 'B', 'C'] as const;
export const phaseIndex = (position: number): number => Math.floor((position - 1) / 2) % 3;
export const positionsOf = (circuit: number, poles: number): number[] =>
  Array.from({ length: poles }, (_, i) => circuit + 2 * i);

export const phaseColor = (position: number, system: VoltageSystem): WireColor =>
  WIRE_COLORS[systemDef(system).phases[phaseIndex(position)]];

export interface Conductor {
  role: WireRole;
  phase?: 'A' | 'B' | 'C';
  color: WireColor;
}

// Every conductor that makes up one circuit's pull, in the order the shop
// should read them: hot(s) by position, then neutral, then ground.
export function conductorsFor(circuit: number, poles: number, hasNeutral: boolean, system: VoltageSystem): Conductor[] {
  const def = systemDef(system);
  const out: Conductor[] = positionsOf(circuit, poles).map(pos => ({
    role: 'hot' as const,
    phase: PHASE_LETTERS[phaseIndex(pos)],
    color: WIRE_COLORS[def.phases[phaseIndex(pos)]]
  }));
  if (hasNeutral && def.neutral) out.push({ role: 'neutral', color: WIRE_COLORS[def.neutral] });
  out.push({ role: 'ground', color: WIRE_COLORS.green });
  return out;
}

// ── rows ──
export interface WirePullRow {
  circuit: number;   // first breaker position of the circuit
  poles: Poles;
  footage: number;   // whole feet, each conductor cut to this length
  size: WireSize;
  neutral: boolean;  // carries a neutral (ignored on 480 V 3-wire)
}

// Which circuit owns each panel position. Lowest circuit number claims first,
// so when two circuits collide the later one is the one flagged.
export function claimMap(rows: { circuit: number; poles: number }[]): Map<number, number> {
  const claims = new Map<number, number>();
  const sorted = rows.slice().sort((a, b) => a.circuit - b.circuit);
  for (const r of sorted) {
    for (const pos of positionsOf(r.circuit, r.poles)) {
      if (!claims.has(pos)) claims.set(pos, r.circuit);
    }
  }
  return claims;
}

// Problems keyed by circuit number. Empty map = the sheet is good to submit.
export function checkRows(rows: WirePullRow[], spaces: number): Map<number, string> {
  const problems = new Map<number, string>();
  const seen = new Set<number>();
  const claims = new Map<number, number>();
  const sorted = rows.slice().sort((a, b) => a.circuit - b.circuit);
  for (const r of sorted) {
    if (!Number.isInteger(r.circuit) || r.circuit < 1 || r.circuit > spaces) {
      problems.set(r.circuit, `not on a ${spaces}-space panel`);
      continue;
    }
    if (seen.has(r.circuit)) { problems.set(r.circuit, 'listed twice'); continue; }
    seen.add(r.circuit);
    const positions = positionsOf(r.circuit, r.poles);
    const last = positions[positions.length - 1];
    if (last > spaces) {
      problems.set(r.circuit, `${r.poles}-pole runs past the last space (${spaces})`);
      continue;
    }
    const hit = positions.find(p => claims.has(p));
    if (hit !== undefined) {
      problems.set(r.circuit, `Overlaps circuit ${claims.get(hit)} at space ${hit}`);
      continue;
    }
    for (const p of positions) claims.set(p, r.circuit);
  }
  return problems;
}

// ── cut list ──
export interface CutLine {
  size: WireSize;
  color: WireColor;
  role: WireRole;
  feet: number;    // total footage of this color and size
  pieces: number;  // how many separate conductors to cut
}

const roleOrder = (role: WireRole, color: WireColor, system: VoltageSystem): number => {
  if (role === 'neutral') return 3;
  if (role === 'ground') return 4;
  const idx = systemDef(system).phases.indexOf(color.key);
  return idx < 0 ? 0 : idx;
};

export function cutList(rows: WirePullRow[], system: VoltageSystem): CutLine[] {
  const acc = new Map<string, CutLine>();
  for (const r of rows) {
    for (const c of conductorsFor(r.circuit, r.poles, r.neutral, system)) {
      const key = `${r.size}|${c.role}|${c.color.key}`;
      const hit = acc.get(key);
      if (hit) { hit.feet += r.footage; hit.pieces += 1; }
      else acc.set(key, { size: r.size, color: c.color, role: c.role, feet: r.footage, pieces: 1 });
    }
  }
  return Array.from(acc.values()).sort((a, b) =>
    WIRE_SIZES.indexOf(a.size) - WIRE_SIZES.indexOf(b.size)
    || roleOrder(a.role, a.color, system) - roleOrder(b.role, b.color, system));
}

export const totalFeet = (lines: CutLine[]) => lines.reduce((n, l) => n + l.feet, 0);
export const fmtFeet = (n: number) => `${n.toLocaleString('en-US')} ft`;

// ── the record stored by the function ──
export interface WirePullSheet {
  id: string;          // 'WP-1001'
  job: string;
  panel: string;       // 'LP1-1'
  system: VoltageSystem;
  spaces: number;
  by: string;          // foreman display name, set from the session
  needBy: string;      // ISO date or ''
  priority: 'Standard' | 'Hot';
  notes: string;
  status: WirePullStatus;
  rows: WirePullRow[];
  createdAt: string;
}

// Shape + sanity validation for a submitted sheet. Used by the Netlify
// function so the API can't be fed nonsense, and uses the same checkRows()
// the sheet screen uses, so the two can never disagree.
export type CleanSheet =
  | { ok: true; value: Pick<WirePullSheet, 'job' | 'panel' | 'system' | 'spaces' | 'needBy' | 'priority' | 'notes' | 'rows'> }
  | { ok: false; error: string };

export function cleanSheetInput(body: any): CleanSheet {
  const job = String(body?.job ?? '').trim().slice(0, 120);
  if (!job) return { ok: false, error: 'Job name is required' };
  const panel = String(body?.panel ?? '').trim().slice(0, 40);
  if (!panel) return { ok: false, error: 'Panel name is required' };
  if (!isSystem(body?.system)) return { ok: false, error: 'Unknown voltage system' };
  const system = body.system as VoltageSystem;
  const spaces = Math.round(Number(body?.spaces));
  if (!Number.isInteger(spaces) || spaces < 2 || spaces > MAX_SPACES) {
    return { ok: false, error: `Panel size must be between 2 and ${MAX_SPACES} spaces` };
  }
  const needBy = typeof body?.needBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.needBy) ? body.needBy : '';
  const priority = body?.priority === 'Hot' ? 'Hot' : 'Standard';
  const notes = String(body?.notes ?? '').slice(0, 2000);

  if (!Array.isArray(body?.rows) || !body.rows.length) {
    return { ok: false, error: 'List footage for at least one circuit' };
  }
  if (body.rows.length > MAX_SPACES) return { ok: false, error: 'Too many circuits' };

  const rows: WirePullRow[] = [];
  for (const raw of body.rows) {
    const circuit = Math.round(Number(raw?.circuit));
    const poles = Math.round(Number(raw?.poles));
    const footage = Math.round(Number(raw?.footage));
    if (!Number.isInteger(circuit) || circuit < 1) return { ok: false, error: 'Bad circuit number' };
    if (![1, 2, 3].includes(poles)) return { ok: false, error: `Circuit ${circuit}: poles must be 1, 2 or 3` };
    if (!Number.isInteger(footage) || footage < 1 || footage > MAX_FOOTAGE) {
      return { ok: false, error: `Circuit ${circuit}: footage must be 1–${MAX_FOOTAGE}` };
    }
    if (!isSize(raw?.size)) return { ok: false, error: `Circuit ${circuit}: unknown wire size` };
    rows.push({
      circuit,
      poles: poles as Poles,
      footage,
      size: raw.size,
      neutral: systemDef(system).neutral ? raw?.neutral === true : false
    });
  }
  rows.sort((a, b) => a.circuit - b.circuit);

  const problems = checkRows(rows, spaces);
  if (problems.size) {
    const [circuit, msg] = Array.from(problems.entries())[0];
    return { ok: false, error: `Circuit ${circuit}: ${msg}` };
  }
  return { ok: true, value: { job, panel, system, spaces, needBy, priority, notes, rows } };
}
