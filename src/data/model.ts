// Domain model — values lifted verbatim from the design handoff's data-model.js.

export type Role = 'foreman' | 'prefab' | 'admin';
export type AssemblyKind = 'box' | 'conduit' | 'bracket' | 'whip' | 'hardware' | 'panel';
export type Category = 'Boxes' | 'Panelboards' | 'Brackets' | 'Conduit' | 'Whips' | 'Hardware';
export type System = 'Power' | 'Data' | 'Fire Alarm' | 'Raceway' | 'Lighting' | 'Support';
export type MaterialClass = 'box' | 'wire' | 'conduit' | 'other';
export type Status = 'Submitted' | 'Scheduled' | 'In Build' | 'Ready' | 'Closed';

export interface Assembly {
  id: string;          // '02', '24', 'P1' — matches assets/asm-<id>.png
  title: string;
  category: Category;
  system: System;
  kind: AssemblyKind;
}

export interface OptionField {
  key: string;
  num: string;
  label: string;
  options: { v: string; label: string }[];
  def: string | string[];
  code?: boolean;
  type?: 'checks';
}

export interface MaterialRow {
  desc: string;
  mfg: string;
  cat: string;
  per: string;
  cls: MaterialClass;
}

export interface RequestLine {
  assemblyId: string;
  opts: Record<string, string | string[]>;
  code: string;
  qty: number;
  mfgPref?: Partial<Record<'box' | 'wire' | 'conduit', string>>;
  mfgSel?: Record<number, string>;
}

export interface PrefabRequest {
  id: string;               // 'PR-1044'
  job: string;
  by: string;               // foreman display name
  needBy: string;           // ISO date
  priority: 'Standard' | 'Hot';
  notes: string;
  status: Status;
  week: string | null;      // ISO Monday of the assigned build week
  lines: RequestLine[];
  profileId?: string | null;   // job spec profile the request was built under
  profileName?: string | null; // snapshot of the profile name at submit time
}

// ── Job spec profiles — admin-defined allow-lists that narrow the catalog ──
// An absent key means "no restriction on that field". Empty-string option
// values (the "Blank — box only" style choices) always pass, since selecting
// nothing can't violate a spec.
export interface SpecProfileLimits {
  mfgBox?: string[];
  mfgWire?: string[];
  mfgConduit?: string[];
  boxStyle?: string[];
  ringStyle?: string[];
  ringSize?: string[];
  trade?: string[];
  conn?: string[];
}
export interface SpecProfile {
  id: string;
  name: string;
  active: boolean;
  notes?: string;
  limits: SpecProfileLimits;
  createdAt?: string;
}

export type LimitKey = keyof SpecProfileLimits;
export const MFG_LIMIT_KEY: Record<'box' | 'wire' | 'conduit', LimitKey> = {
  box: 'mfgBox', wire: 'mfgWire', conduit: 'mfgConduit'
};
// Schema field keys that a profile can constrain (field key === limit key).
export const LIMITED_FIELD_KEYS = ['boxStyle', 'ringStyle', 'ringSize', 'trade', 'conn'] as const;

// Intersect a field's options with a profile's allow-list. Blank values pass.
export function allowedOptions(profile: SpecProfile | null, fieldKey: string, options: { v: string; label: string }[]) {
  if (!profile) return options;
  const limit = (profile.limits || {})[fieldKey as LimitKey];
  if (!limit || !limit.length) return options;
  return options.filter(o => o.v === '' || limit.includes(o.v));
}
// Manufacturer list for a class under a profile ([] limit = unrestricted).
export function allowedMfg(profile: SpecProfile | null, cls: 'box' | 'wire' | 'conduit') {
  const base = MFG_BY_CLASS[cls];
  if (!profile) return { list: base, restricted: false };
  const limit = (profile.limits || {})[MFG_LIMIT_KEY[cls]];
  if (!limit || !limit.length) return { list: base, restricted: false };
  return { list: base.filter(m => limit.includes(m)), restricted: true };
}
// First violation of a configured line against a profile, or null if clean.
export function lineViolation(profile: SpecProfile | null, assemblyId: string, opts: Record<string, string | string[]>, mfgPref?: Partial<Record<'box' | 'wire' | 'conduit', string>>): string | null {
  if (!profile) return null;
  const limits = profile.limits || {};
  for (const f of schemaOf(assemblyId)) {
    const limit = limits[f.key as LimitKey];
    if (!limit || !limit.length || f.type === 'checks') continue;
    const v = String(opts[f.key] ?? f.def ?? '');
    if (v !== '' && !limit.includes(v)) {
      const o = f.options.find(x => x.v === v);
      return `${f.label}: "${o ? o.label : v}" is not permitted by ${profile.name}`;
    }
  }
  for (const cls of ['box', 'wire', 'conduit'] as const) {
    const limit = limits[MFG_LIMIT_KEY[cls]];
    const pref = (mfgPref || {})[cls];
    if (limit && limit.length && pref && !limit.includes(pref)) {
      return `${CLASS_LABEL[cls]} manufacturer "${pref}" is not permitted by ${profile.name}`;
    }
  }
  return null;
}

export interface SessionUser {
  username: string;
  name: string;
  role: Role;
}

const raw: [string, string, Category, System, AssemblyKind][] = [
  ['02', '1 Gang Outlet — 4"Sq 2-1/8" Deep, 5/8 Ring w/ GND Tail, 16" O.C. Metal Stud Wall', 'Boxes', 'Power', 'box'],
  ['24', '2 Gang Outlet — 4"Sq 2-1/8" Deep, 5/8 Ring w/ GND Tail, 16" O.C. Metal Stud Wall', 'Boxes', 'Power', 'box'],
  ['05', '1 Gang Duplex Receptacle — 3/4" Plaster Ring, 4"Sq 2-1/8" Deep, Telescoping Bracket', 'Boxes', 'Power', 'box'],
  ['04', '2 Gang Duplex Receptacle — 3/4" Plaster Ring, 4"Sq 2-1/8" Deep, Telescoping Bracket', 'Boxes', 'Power', 'box'],
  ['08', '2 Gang Duplex Receptacle — 3/4" Plaster Ring, 4"Sq 2-1/8" Deep, \u2018H\u2019 Bracket', 'Boxes', 'Power', 'box'],
  ['07', '1 Gang Switch — 3/4" Plaster Ring, 4"Sq 2-1/8" Deep, \u2018H\u2019 Bracket — Wall Mount Light / Exit etc.', 'Boxes', 'Power', 'box'],
  ['06', '4"Sq 1-1/2" Deep Box — T-Grid Box Hanger, 24" Span', 'Boxes', 'Power', 'box'],
  ['09', '1 Gang 4"Sq 2-1/8" Deep w/ 3/4 Mudring on Adj. Slider Bracket — Wall / Ceiling', 'Boxes', 'Power', 'box'],
  ['03', 'Masonry Assembly', 'Boxes', 'Power', 'box'],
  ['10', '1 Gang Data / Receptacle — 4"Sq 2-1/8" Deep, 3/4 Ring, 16" O.C. Metal Stud Wall', 'Boxes', 'Data', 'box'],
  ['11', '1G Data — 4-11/16 Deep Box w/ 5/8 Ring, Slider Bracket for Stud Walls', 'Boxes', 'Data', 'box'],
  ['15', '1 Gang Tel/Data — 3/4 Plaster Ring, 4-11/16 Box 2-1/8" Deep, Pipe to Finish Ceiling', 'Boxes', 'Data', 'box'],
  ['16', '1 Gang Tel/Data — Adj. Plaster Ring, 4-11/16 Box 2-1/8" Deep, Glides Box Attachment up to Finish Ceiling', 'Boxes', 'Data', 'box'],
  ['17', 'Fire Alarm Smoke Detector — Ceiling Mounted, 4"Sq 1-1/2" Deep Box, T-Grid Box Hanger 24" Span', 'Boxes', 'Fire Alarm', 'box'],
  ['18', 'Fire Alarm 4"Sq Deep on Caddy Slider Bracket — Ceiling or Wall', 'Boxes', 'Fire Alarm', 'box'],
  ['19', 'Fire Alarm Speaker Strobe — 4"Sq 3-1/2" Deep, FM Bracket', 'Boxes', 'Fire Alarm', 'box'],
  ['20', 'Fire Alarm 1G Pull Station — 4"Sq 2-1/8" Deep, 5/8 Ring, 16" O.C. Metal Stud Wall', 'Boxes', 'Fire Alarm', 'box'],
  ['21', 'F.A. Horn / Strobe — 4"Sq, 16" O.C. Metal Stud Wall', 'Boxes', 'Fire Alarm', 'box'],
  ['26', '(TSBW) Telescoping Slider Bracket Assembly — wire option', 'Brackets', 'Power', 'bracket'],
  ['28', '(MBB) Multiple Box Bracket Assembly — conduit & wire option', 'Brackets', 'Power', 'bracket'],
  ['29', '(MB) Multiple Box Bracket Assemblies', 'Brackets', 'Power', 'bracket'],
  ['12', 'Rigid Nipples', 'Conduit', 'Raceway', 'conduit'],
  ['13', '90° Conduit Bends', 'Conduit', 'Raceway', 'conduit'],
  ['14', 'Conduit Offsets', 'Conduit', 'Raceway', 'conduit'],
  ['22', 'Conduit Nipples with Plastic Bushings', 'Conduit', 'Raceway', 'conduit'],
  ['27', '(L2FS) Lighting Whip Assembly — 2 Fixture, Field Installed, Fee at Switch', 'Whips', 'Lighting', 'whip'],
  ['P1', 'Panelboard Assembly — back box, trough, wiring & internal components', 'Panelboards', 'Power', 'panel'],
  ['23', 'Trapeze Support System', 'Hardware', 'Support', 'hardware'],
  ['25', 'Threaded Rod 1/2"', 'Hardware', 'Support', 'hardware']
];

export const CATALOG: Assembly[] = raw.map(([id, title, category, system, kind]) => ({ id, title, category, system, kind }));

const RING_STYLE = [
  { v: '', label: 'Blank — Box only' }, { v: '1', label: '1 — One Device' }, { v: '2', label: '2 — Two Device' },
  { v: 'R', label: 'R — Round' }, { v: 'E', label: 'E — 1-1/2" Deep Extension Box' },
  { v: 'E1', label: 'E1 — Extension 1 Gang' }, { v: 'E2', label: 'E2 — Extension 2 Gang' }
];
const RING_SIZE = [
  { v: '', label: 'Blank — Box only' }, { v: '04', label: '04 — 1/4" Raise' }, { v: '08', label: '08 — 1/2" Raise' },
  { v: '10', label: '10 — 5/8" Raise' }, { v: '12', label: '12 — 3/4" Raise' }, { v: '16', label: '16 — 1" Raise' },
  { v: '20', label: '20 — 1-1/4" Raise' }, { v: '24', label: '24 — 1-1/2" Raise' }, { v: '32', label: '32 — 2" Raise' },
  { v: 'ADJ', label: 'ADJ — Adjustable' }
];
const BOX_STYLE = [
  { v: '4D', label: '4D — 4"Sq, 2-1/8" Deep' }, { v: '43B', label: '43B — 4"Sq, 2-1/8" Deep, 1" KO' },
  { v: '5D', label: '5D — 4-11/16"Sq, 2-1/8" Deep' }, { v: '560', label: '560 — 4-11/16"Sq, 2-1/8" Deep, 1" KO' },
  { v: '570', label: '570 — 4-11/16"Sq, 2-1/8" Deep, 1-1/2" KO' },
  { v: '690', label: '690 — Masonry 1-Gang 2-1/2" Deep' }, { v: '691', label: '691 — Masonry 2-Gang 2-1/2" Deep' },
  { v: '692', label: '692 — Masonry 3-Gang 2-1/2" Deep' }, { v: '695', label: '695 — Masonry 1-Gang 3-1/2" Deep' },
  { v: '696', label: '696 — Masonry 2-Gang 3-1/2" Deep' }, { v: '697', label: '697 — Masonry 3-Gang 3-1/2" Deep' }
];
const GROUND = [{ v: '', label: 'Blank — Solid ground wire' }, { v: 'A', label: 'A — Stranded ground wire' }, { v: 'N', label: 'N — No ground wire' }];
const COLOR = [
  { v: '', label: 'Blank — No color' }, { v: 'G', label: 'G — Green (Power)' }, { v: 'W', label: 'W — White (Lighting)' },
  { v: 'O', label: 'O — Orange (E-Lighting)' }, { v: 'R', label: 'R — Red (Fire Alarm)' },
  { v: 'Y', label: 'Y — Yellow (Voice / Data)' }, { v: 'P', label: 'P — Purple (A/V System)' }
];
const TRADE = [{ v: '1/2', label: '1/2"' }, { v: '3/4', label: '3/4"' }, { v: '1', label: '1"' }, { v: '1-1/4', label: '1-1/4"' }, { v: '1-1/2', label: '1-1/2"' }, { v: '2', label: '2"' }];
const CONN = [{ v: 'SS', label: 'SS — Set screw' }, { v: 'CP', label: 'CP — Compression' }];
const TERM = [{ v: 'N', label: 'N — None' }, { v: 'I', label: 'I — Push-on insulator' }];
const LENGTH = [{ v: '6', label: '6"' }, { v: '12', label: '12"' }, { v: '18', label: '18"' }, { v: '24', label: '24"' }, { v: '36', label: '36"' }, { v: '48', label: '48"' }, { v: '10FT', label: '10 ft stick' }];
const SPAN = [{ v: '16', label: '16" O.C.' }, { v: '24', label: '24" O.C.' }, { v: 'ADJ', label: 'Adjustable' }];
const BOXCOUNT = [{ v: '2', label: '2 boxes' }, { v: '3', label: '3 boxes' }, { v: '4', label: '4 boxes' }];
const ROD = [{ v: '12', label: '12"' }, { v: '24', label: '24"' }, { v: '36', label: '36"' }, { v: '48', label: '48"' }, { v: '72', label: '72"' }, { v: '120', label: '120"' }];
const WHIP = [{ v: '6', label: '6 ft' }, { v: '8', label: '8 ft' }, { v: '10', label: '10 ft' }, { v: '12', label: '12 ft' }];

export const SCHEMAS: Record<AssemblyKind, OptionField[]> = {
  box: [
    { key: 'ringStyle', num: '1', label: 'Plaster Ring Style', options: RING_STYLE, def: '1', code: true },
    { key: 'ringSize', num: '2', label: 'Plaster Ring Size', options: RING_SIZE, def: '12', code: true },
    { key: 'boxStyle', num: '3', label: 'Box Style', options: BOX_STYLE, def: '4D', code: true },
    { key: 'ground', num: '4', label: 'Ground Wire', options: GROUND, def: '', code: true },
    { key: 'color', num: '5', label: 'Color Selector', options: COLOR, def: '', code: true },
    { key: 'trade', num: '2', label: 'Conduit Size (all steel)', options: TRADE, def: '3/4' },
    { key: 'conn', num: '2', label: 'Connector / Coupling Type', options: CONN, def: 'SS' },
    { key: 'term', num: '3', label: 'End Termination', options: TERM, def: 'N' }
  ],
  conduit: [
    { key: 'trade', num: '1', label: 'Conduit Size (all steel)', options: TRADE, def: '3/4', code: true },
    { key: 'length', num: '2', label: 'Length', options: LENGTH, def: '12', code: true },
    { key: 'conn', num: '3', label: 'Connector / Coupling Type', options: CONN, def: 'SS' },
    { key: 'term', num: '4', label: 'End Termination', options: TERM, def: 'N' }
  ],
  bracket: [
    { key: 'span', num: '1', label: 'Stud Spacing / Span', options: SPAN, def: '16', code: true },
    { key: 'boxes', num: '2', label: 'Box Count', options: BOXCOUNT, def: '2', code: true },
    { key: 'boxStyle', num: '3', label: 'Box Style', options: BOX_STYLE, def: '4D', code: true },
    { key: 'trade', num: '4', label: 'Conduit Size (all steel)', options: TRADE, def: '3/4' },
    { key: 'color', num: '5', label: 'Color Selector', options: COLOR, def: '', code: true }
  ],
  whip: [
    { key: 'length', num: '1', label: 'Whip Length', options: WHIP, def: '8', code: true },
    { key: 'trade', num: '2', label: 'Flex Size', options: TRADE, def: '1/2', code: true },
    { key: 'color', num: '3', label: 'Color Selector', options: COLOR, def: 'W', code: true },
    { key: 'term', num: '4', label: 'End Termination', options: TERM, def: 'N' }
  ],
  hardware: [
    { key: 'length', num: '1', label: 'Length', options: ROD, def: '24', code: true },
    { key: 'span', num: '2', label: 'Span / Spacing', options: SPAN, def: '24', code: true }
  ],
  panel: [
    { key: 'backBox', num: '1', label: 'Back box', type: 'checks', def: ['Type 1 back box', 'Mounting hardware'], options: [{ v: 'Type 1 back box', label: 'Type 1 back box' }, { v: 'Type 3R back box', label: 'Type 3R back box' }, { v: '5-3/4" deep', label: '5-3/4" deep' }, { v: '7-1/4" deep', label: '7-1/4" deep' }, { v: 'Ground bar kit', label: 'Ground bar kit' }, { v: 'Mounting hardware', label: 'Mounting hardware' }] },
    { key: 'trough', num: '2', label: 'Trough', type: 'checks', def: [], options: [{ v: 'Auxiliary gutter 6" x 6"', label: 'Auxiliary gutter 6" x 6"' }, { v: 'Auxiliary gutter 8" x 8"', label: 'Auxiliary gutter 8" x 8"' }, { v: 'Side mounted', label: 'Side mounted' }, { v: 'Top mounted', label: 'Top mounted' }, { v: 'Removable cover', label: 'Removable cover' }, { v: 'Barrier / divider', label: 'Barrier / divider' }] },
    { key: 'wiring', num: '3', label: 'Wiring', type: 'checks', def: ['Phase taped and labeled'], options: [{ v: 'Feeder conductors pulled', label: 'Feeder conductors pulled' }, { v: 'Branch pigtails landed', label: 'Branch pigtails landed' }, { v: 'Neutral bar pigtails', label: 'Neutral bar pigtails' }, { v: 'Ground pigtails', label: 'Ground pigtails' }, { v: 'Phase taped and labeled', label: 'Phase taped and labeled' }, { v: 'Wire management straps', label: 'Wire management straps' }] },
    { key: 'internal', num: '4', label: 'Internal components', type: 'checks', def: [], options: [{ v: 'Main breaker installed', label: 'Main breaker installed' }, { v: 'Main lugs only', label: 'Main lugs only' }, { v: 'Branch breakers installed', label: 'Branch breakers installed' }, { v: 'Neutral bar', label: 'Neutral bar' }, { v: 'Isolated ground bar', label: 'Isolated ground bar' }, { v: 'Surge protective device', label: 'Surge protective device' }] },
    { key: 'nipples', num: '5', label: 'Nipples', type: 'checks', def: [], options: [{ v: 'Close nipple 2"', label: 'Close nipple 2"' }, { v: 'Close nipple 2-1/2"', label: 'Close nipple 2-1/2"' }, { v: 'Close nipple 3"', label: 'Close nipple 3"' }, { v: 'Chase nipple w/ bushing', label: 'Chase nipple w/ bushing' }, { v: 'Locknuts both ends', label: 'Locknuts both ends' }, { v: 'Sealing washers', label: 'Sealing washers' }] },
    { key: 'strut', num: '6', label: 'Strut options', type: 'checks', def: [], options: [{ v: 'Unistrut backing — vertical', label: 'Unistrut backing — vertical' }, { v: 'Unistrut backing — horizontal', label: 'Unistrut backing — horizontal' }, { v: 'Strut channel nuts', label: 'Strut channel nuts' }, { v: 'Threaded rod supports', label: 'Threaded rod supports' }, { v: 'Wall anchors', label: 'Wall anchors' }, { v: 'Seismic bracing', label: 'Seismic bracing' }] }
  ]
};

export const ROLE_VIEWS: Record<Role, string[]> = {
  foreman: ['catalog', 'review', 'mine'],
  prefab: ['queue', 'schedule', 'ticket'],
  admin: ['catalog', 'review', 'mine', 'queue', 'schedule', 'ticket', 'materials', 'profiles', 'users']
};

export const STATUSES: Status[] = ['Submitted', 'Scheduled', 'In Build', 'Ready', 'Closed'];

// System colors are the book's own wire color selector (page 3, item 6).
export const SYS_COLOR: Record<System, string> = {
  'Power': '#1c7a44',
  'Data': '#a8790a',
  'Fire Alarm': '#ec3013',
  'Lighting': '#c25313',
  'Raceway': '#37475a',
  'Support': '#5a3a9c'
};
export const sysColor = (s: System) => SYS_COLOR[s] || 'var(--color-text)';

export const MFGS = ['RACO', 'STEEL CITY', 'APPLETON', 'HUBBELL', 'CADDY', 'ERICO', 'GARVIN', 'MINERALLAC', 'BRIDGEPORT', 'ARLINGTON', 'THOMAS & BETTS', 'TOPAZ', 'ALLIED', 'WHEATLAND', 'REPUBLIC', 'SOUTHWIRE', 'ENCORE', 'CERROWIRE'];

export const CLASSES: { v: MaterialClass; label: string }[] = [
  { v: 'box', label: 'Box / fitting' },
  { v: 'wire', label: 'Wire' },
  { v: 'conduit', label: 'Conduit' },
  { v: 'other', label: 'Hardware / other' }
];
export const MFG_BY_CLASS: Record<'box' | 'wire' | 'conduit', string[]> = {
  box: ['RACO', 'STEEL CITY', 'APPLETON', 'HUBBELL'],
  wire: ['SOUTHWIRE', 'ENCORE', 'CERROWIRE'],
  conduit: ['ALLIED', 'WHEATLAND', 'REPUBLIC']
};
export const CLASS_LABEL: Record<'box' | 'wire' | 'conduit', string> = { box: 'Box / fitting', wire: 'Wire', conduit: 'Conduit' };

// The catalog fields a job spec profile can restrict, with their full option
// lists — drives both the admin Profiles editor and the drawer filtering.
// Defined after MFG_BY_CLASS because it reads from it at module load.
function MFG_BY_CLASS_OPTS(cls: 'box' | 'wire' | 'conduit') {
  return MFG_BY_CLASS[cls].map(m => ({ v: m, label: m }));
}
export const PROFILE_FIELDS: { limitKey: LimitKey; label: string; options: { v: string; label: string }[] }[] = [
  { limitKey: 'mfgBox', label: 'Box / fitting manufacturers', options: MFG_BY_CLASS_OPTS('box') },
  { limitKey: 'mfgWire', label: 'Wire manufacturers', options: MFG_BY_CLASS_OPTS('wire') },
  { limitKey: 'mfgConduit', label: 'Conduit manufacturers', options: MFG_BY_CLASS_OPTS('conduit') },
  { limitKey: 'boxStyle', label: 'Box styles', options: BOX_STYLE },
  { limitKey: 'ringStyle', label: 'Plaster ring styles', options: RING_STYLE.filter(o => o.v !== '') },
  { limitKey: 'ringSize', label: 'Plaster ring sizes', options: RING_SIZE.filter(o => o.v !== '') },
  { limitKey: 'trade', label: 'Conduit / flex sizes', options: TRADE },
  { limitKey: 'conn', label: 'Connector / coupling types', options: CONN }
];

export const PREF_CLASSES: Record<AssemblyKind, ('box' | 'wire' | 'conduit')[]> = {
  box: ['box', 'wire', 'conduit'],
  bracket: ['box', 'conduit', 'wire'],
  conduit: ['conduit'],
  whip: ['wire', 'conduit'],
  panel: ['wire', 'box', 'conduit'],
  hardware: []
};

const CLS_RULES: [MaterialClass, RegExp][] = [
  ['conduit', /\bemt\b|conduit|elbow|\b90\b|nipple|offset|rigid|imc|flex\b|greenfield|sealtite/i],
  ['wire', /\bwire\b|thhn|thwn|pigtail|\bawg\b|conductor|cable|\bmc\b|whip/i],
  ['box', /\bbox\b|\bring\b|mudring|plaster|cover|connector|coupling|\bko\b|extension|device/i]
];
export const inferCls = (desc?: string, cat?: string): MaterialClass => {
  const t = ((desc || '') + ' ' + (cat || ''));
  const hit = CLS_RULES.find(([, re]) => re.test(t));
  return hit ? hit[0] : 'other';
};

// ── shared helpers ──

export const itemOf = (id: string) => CATALOG.find(x => x.id === id);
export const imgOf = (id: string) => `assets/asm-${id}.png`;
export const schemaOf = (id: string): OptionField[] => {
  const it = itemOf(id);
  return SCHEMAS[it ? it.kind : 'box'] || SCHEMAS.box;
};

export function codeSegs(id: string, opts: Record<string, string | string[]>) {
  return schemaOf(id).filter(f => f.code && f.type !== 'checks').map(f => {
    const v = opts[f.key] === undefined ? f.def : opts[f.key];
    return { v: v === '' ? '' : String(v) };
  });
}
export function codeFor(id: string, opts: Record<string, string | string[]>) {
  return codeSegs(id, opts).map(s => s.v || '\u25a1').join(' ');
}
export function optSummary(id: string, opts: Record<string, string | string[]>) {
  return schemaOf(id).map(f => {
    const v = opts[f.key] === undefined ? f.def : opts[f.key];
    if (f.type === 'checks') {
      const list = Array.isArray(v) ? v : [];
      return f.label + ': ' + (list.length ? list.join(', ') : 'none');
    }
    const o = f.options.find(x => x.v === v);
    return f.label + ': ' + (o ? o.label.replace(/^[^—]*— /, '') : '—');
  }).join(' · ');
}
export function prefSummary(line: RequestLine) {
  const p = line.mfgPref || {};
  const keys = Object.keys(CLASS_LABEL) as ('box' | 'wire' | 'conduit')[];
  return keys.filter(k => p[k]).map(k => CLASS_LABEL[k] + ': ' + p[k]).join(' · ');
}
export const pieces = (r: PrefabRequest) => r.lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);

export function mondayOf(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
export const iso = (d: Date) => {
  // Local-date ISO — toISOString would shift across UTC midnight.
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
export function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function weekLabel(isoMon: string) {
  const a = new Date(isoMon + 'T00:00:00');
  const b = new Date(a); b.setDate(b.getDate() + 4);
  const m = a.toLocaleDateString('en-US', { month: 'short' });
  const m2 = b.toLocaleDateString('en-US', { month: 'short' });
  return m === m2 ? `${m} ${a.getDate()}–${b.getDate()}` : `${m} ${a.getDate()} – ${m2} ${b.getDate()}`;
}

// Manufacturer resolution order, per material row:
// shop override → foreman preference matching the row's class → template default.
export function resolveMfg(line: RequestLine, row: MaterialRow, rowIdx: number): { mfg: string; src: 'shop' | 'foreman' | 'template' } {
  if (line.mfgSel && line.mfgSel[rowIdx]) return { mfg: line.mfgSel[rowIdx], src: 'shop' };
  const pref = (line.mfgPref || {})[row.cls as 'box' | 'wire' | 'conduit'];
  if (pref) return { mfg: pref, src: 'foreman' };
  return { mfg: row.mfg || '', src: 'template' };
}

export function pullList(req: PrefabRequest, tplFor: (id: string) => MaterialRow[]) {
  const acc: { key: string; desc: string; mfg: string; cat: string; total: number }[] = [];
  req.lines.forEach((l) => {
    tplFor(l.assemblyId).forEach((r, ri) => {
      const per = Number(r.per) || 0;
      const mfg = resolveMfg(l, r, ri).mfg;
      const key = (mfg + '|' + (r.cat || r.desc)).toLowerCase();
      const hit = acc.find(a => a.key === key);
      if (hit) hit.total += per * l.qty;
      else acc.push({ key, desc: r.desc, mfg, cat: r.cat, total: per * l.qty });
    });
  });
  return acc;
}
