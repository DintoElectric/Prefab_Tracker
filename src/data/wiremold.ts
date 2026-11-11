// Wiremold (surface raceway) engine — turns what a foreman types for a build
// into exact device positions, a to-scale drawing, and the wire to cut.
//
// A TICKET holds many BUILDS, the same way a pull sheet holds many boxes. Each
// build is one run of raceway:
//   • the wiremold series, and whether it is single or double (two-channel);
//     on a double, each device box sits in the top channel or the bottom one
//   • length of the run
//   • the device boxes: duplex or double duplex, standing up or turned to run
//     along the raceway — which sets how much of the run each box takes up
//   • how many devices, and the spacing between them (feet/inches)
//   • the color of each device
//   • which end it is fed from, and the whip there (none = the wire is end capped)
//   • the wire: type, size, and the color of every conductor
//
// Wire is cut longer than the run: every device adds a foot to each conductor,
// and a whip adds its own length at each fed end. The two channels of a double
// are separate wiring spaces, so each channel that has devices gets its own set
// of conductors.
//
// Spacing is ONE value used between every pair of devices; any single gap can
// be given its own spacing, which replaces the main one for that gap only (the
// same way one device can be given its own color). It is measured either
// BETWEEN BOXES (edge to edge — so a longer box pushes the next one along) or
// CENTER TO CENTER. Whichever way it was typed, a build is stored one way:
// center-to-center gaps plus each box's length, so the two can never disagree.
// Devices are centered on the run unless the foreman gives the distance from
// the left end to the first device.
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
export const DEVICE_WIRE_IN = 12;        // every device adds this much wire to each conductor
export const MAX_WHIP_IN = 50 * 12;      // longest whip
export const SIXTEENTH = 1 / 16;

// ── choices ──
export const FEED_ENDS: { v: FeedEnd; label: string }[] = [
  { v: 'left', label: 'Left end' },
  { v: 'right', label: 'Right end' },
  { v: 'both', label: 'Both ends' }
];

export type DeviceType = 'duplex' | 'double';
export const DEVICE_TYPES: { v: DeviceType; label: string }[] = [
  { v: 'duplex', label: 'Duplex' },
  { v: 'double', label: 'Double duplex' }
];
export type Measure = 'clear' | 'center';
export const MEASURES: { v: Measure; label: string }[] = [
  { v: 'clear', label: 'Between boxes' },
  { v: 'center', label: 'Center to center' }
];
// Which channel of a double raceway a device box sits in. (On a single there is
// only one, and it is called the top.)
export type Place = 'top' | 'bottom';
export const PLACES: { v: Place; label: string }[] = [
  { v: 'top', label: 'Top channel' },
  { v: 'bottom', label: 'Bottom channel' }
];
export const isPlace = (p: unknown): p is Place => p === 'top' || p === 'bottom';
export const CHANNELS: { v: 1 | 2; label: string }[] = [
  { v: 1, label: 'Single' },
  { v: 2, label: 'Double' }
];

// How much of the run one device box takes up, in inches. These are the
// standard device-plate sizes — a single-gang plate is 2-3/4" × 4-1/2" and a
// two-gang plate is 4-9/16" wide — so a box standing up takes its width and a
// box turned along the raceway takes its height. A double duplex turned along
// the raceway is two devices end to end. The foreman can type the real size on
// any build; these are only what the form starts with.
export const MAX_BOX_IN = 48;
export const BOX_DEFAULT: Record<'vertical' | 'horizontal', Record<DeviceType, number>> = {
  vertical:   { duplex: 2.75, double: 4.5625 },
  horizontal: { duplex: 4.5,  double: 9 }
};

// Raceway series. A series can carry what is known about it; only the Hubbell
// aluminum series does so far (from the Yale OML submittal 260533-002: a
// two-channel base, and device cover plates that are 12" long and run along
// the channel).
export interface SeriesDef {
  v: string;
  label: string;
  channels?: 1 | 2;
  horizontal?: boolean;
  box?: Record<DeviceType, number>;
}
export const SERIES: SeriesDef[] = [
  { v: '500', label: '500' },
  { v: '700', label: '700' },
  { v: '2000', label: '2000' },
  { v: '2100', label: '2100' },
  { v: '2400', label: '2400' },
  { v: '3000', label: '3000' },
  { v: '4000', label: '4000' },
  { v: '6000', label: '6000' },
  { v: 'HBLALU5000', label: 'Hubbell ALU5000 (aluminum)', channels: 2, horizontal: true, box: { duplex: 12, double: 24 } },
  { v: 'other', label: 'Other — see notes' }
];
export const seriesDef = (v: string): SeriesDef | undefined => SERIES.find(x => x.v === v);
export const seriesLabel = (v: string): string => seriesDef(v)?.label || v || 'Not specified';
export const boxDefaults = (series: string, horizontal: boolean): Record<DeviceType, number> =>
  seriesDef(series)?.box || BOX_DEFAULT[horizontal ? 'horizontal' : 'vertical'];
export const isDeviceType = (t: unknown): t is DeviceType => t === 'duplex' || t === 'double';

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
  series: string;              // wiremold series; '' = not given (tickets sent before this field)
  channels: 1 | 2;             // single, or double (two-channel) raceway
  lengthIn: number;            // overall run, inches
  devices: number;
  horizontal: boolean;         // device boxes turned to run along the raceway
  deviceTypes: DeviceType[];   // one per device
  places: Place[];             // one per device: top or bottom channel (always top on a single)
  widthsIn: number[];          // one per device: how much of the run its box takes up
  measure: Measure;            // how the spacing was typed — the drawing dimensions it the same way
  gapsIn: number[];            // devices - 1 gaps, CENTER TO CENTER, inches
  startIn: number | null;      // center of the first device from the LEFT end; null = centered
  deviceColors: string[];      // one per device
  feed: FeedEnd;
  whipIn: number | null;       // whip at each fed end, inches; null = no whip, the wire is end capped
  wire: WireSpec;
}

// Which channels have devices in them — top first. A single raceway, and any
// ticket from before channels existed, is just the top.
export interface WiredChannel { place: Place; devices: number; }
export function wiredChannels(b: { devices: number; channels?: number; places?: Place[] }): WiredChannel[] {
  if (b.channels !== 2 || !Array.isArray(b.places)) return [{ place: 'top', devices: b.devices }];
  const bottom = b.places.filter(p => p === 'bottom').length;
  const out: WiredChannel[] = [];
  if (b.devices - bottom) out.push({ place: 'top', devices: b.devices - bottom });
  if (bottom) out.push({ place: 'bottom', devices: bottom });
  return out;
}

// How long each conductor is cut for one run of a build. Each channel that has
// devices gets its own set of conductors: the run + a foot for every device in
// that channel + the whip. With one channel in use that is simply
// run + a foot per device + whip.
export const feedCount = (feed: FeedEnd) => (feed === 'both' ? 2 : 1);
export interface WireSet { place: Place; devices: number; totalIn: number; }
export interface WireLength {
  runIn: number;       // the run itself (once for each set)
  devicesIn: number;   // a foot for every device
  whipIn: number;      // the whip(s) — both ends fed means two, and each set has its own
  whips: number;       // how many whips (0 when end capped)
  totalIn: number;     // every set added together: what one conductor color needs for one run of the build
  sets: WireSet[];     // one per channel that has devices
}
type WireInput = Pick<WiremoldBuild, 'lengthIn' | 'devices' | 'feed'> & { whipIn?: number | null; channels?: number; places?: Place[] };
export function conductorLength(b: WireInput): WireLength {
  const perSetWhips = b.whipIn ? feedCount(b.feed) : 0;
  const perSetWhipIn = (b.whipIn || 0) * perSetWhips;
  const sets: WireSet[] = wiredChannels(b).map(c => ({
    place: c.place, devices: c.devices, totalIn: b.lengthIn + c.devices * DEVICE_WIRE_IN + perSetWhipIn
  }));
  return {
    runIn: b.lengthIn * sets.length,
    devicesIn: b.devices * DEVICE_WIRE_IN,
    whipIn: perSetWhipIn * sets.length,
    whips: perSetWhips * sets.length,
    totalIn: sets.reduce((n, x) => n + x.totalIn, 0),
    sets
  };
}
// One channel:  "23'-0" each — 12'-0" run + 5'-0" for 5 devices + 6'-0" for the whip"
// Both channels: "top channel 16'-0" each (4 devices) · bottom channel 13'-0" each (1 device) — …"
export function wireLengthText(b: WireInput): string {
  const w = conductorLength(b);
  const plural = (n: number) => `${n} device${n === 1 ? '' : 's'}`;
  const perSetWhips = w.sets.length ? w.whips / w.sets.length : 0;
  const whip = perSetWhips ? ` + ${formatLength(w.whipIn / w.sets.length)} for ${perSetWhips === 1 ? 'the whip' : '2 whips'}` : '';
  if (w.sets.length === 1) {
    return `${formatLength(w.totalIn)} each — ${formatLength(b.lengthIn)} run + ${formatLength(w.devicesIn)} for ${plural(b.devices)}${whip}`;
  }
  const each = w.sets.map(x => `${x.place} channel ${formatLength(x.totalIn)} each (${plural(x.devices)})`).join(' · ');
  return `${each} — every channel with devices gets its own set: ${formatLength(b.lengthIn)} run + ${formatLength(DEVICE_WIRE_IN)} per device${whip}`;
}

// A ticket stored before a field existed simply doesn't have it. This fills in
// what those tickets meant, so everything downstream can rely on a full build.
export function fillBuild(raw: any): WiremoldBuild {
  const devices: number = raw.devices;
  const series = typeof raw.series === 'string' ? raw.series : '';
  const horizontal = raw.horizontal === true;
  const defs = boxDefaults(series, horizontal);
  const deviceTypes: DeviceType[] = Array.from({ length: devices }, (_, i) => (raw.deviceTypes?.[i] === 'double' ? 'double' : 'duplex'));
  const channels: 1 | 2 = raw.channels === 2 ? 2 : 1;
  const places: Place[] = Array.from({ length: devices }, (_, i) => (channels === 2 && raw.places?.[i] === 'bottom' ? 'bottom' : 'top'));
  const widthsIn: number[] = Array.from({ length: devices }, (_, i) => {
    const w = raw.widthsIn?.[i];
    return typeof w === 'number' && w > 0 ? w : defs[deviceTypes[i]];
  });
  return {
    ...raw,
    series, horizontal, deviceTypes, widthsIn, channels, places,
    measure: raw.measure === 'clear' ? 'clear' : 'center',   // older tickets were typed center to center
    whipIn: raw.whipIn ?? null
  };
}

export interface Layout {
  positions: number[];         // center of each device, inches from the left end
  lefts: number[];             // near edge of each box
  rights: number[];            // far edge of each box
  clear: number[];             // open raceway between one box and the next (devices - 1)
  startIn: number;             // left end -> center of the first device
  endIn: number;               // center of the last device -> right end
  leadIn: number;              // left end -> near edge of the first box
  tailIn: number;              // far edge of the last box -> right end
  spanIn: number;              // center of the first device -> center of the last
}

// Where everything sits. With no first-device distance the boxes are centered:
// the same open raceway before the first box as after the last.
export function layoutBuild(b: Pick<WiremoldBuild, 'lengthIn' | 'gapsIn' | 'startIn'> & { widthsIn?: number[] }): Layout {
  const n = b.gapsIn.length + 1;
  const w = Array.from({ length: n }, (_, i) => b.widthsIn?.[i] ?? BOX_DEFAULT.vertical.duplex);
  const span = b.gapsIn.reduce((x, g) => x + g, 0);
  const start = b.startIn ?? (b.lengthIn - span - w[n - 1] / 2 + w[0] / 2) / 2;
  const positions = [start];
  for (const g of b.gapsIn) positions.push(positions[positions.length - 1] + g);
  const lefts = positions.map((p, i) => p - w[i] / 2);
  const rights = positions.map((p, i) => p + w[i] / 2);
  return {
    positions, lefts, rights,
    clear: b.gapsIn.map((_, i) => lefts[i + 1] - rights[i]),
    startIn: start,
    endIn: b.lengthIn - positions[n - 1],
    leadIn: lefts[0],
    tailIn: b.lengthIn - rights[n - 1],
    spanIn: span
  };
}

// What is physically wrong with a layout, or null. Boxes can't overlap and
// can't hang off either end of the run.
const EPS = 1e-6;
export function layoutProblem(lay: Layout, centered: boolean): string | null {
  const hit = lay.clear.findIndex(c => c < -EPS);
  if (hit >= 0) return `devices ${hit + 1} and ${hit + 2} overlap by ${formatLength(-lay.clear[hit])} — their boxes are longer than that spacing`;
  if (centered) return lay.leadIn < -EPS ? `devices run ${formatLength(-(lay.leadIn + lay.tailIn))} past the end of the run` : null;
  if (lay.leadIn < -EPS) return `the first box hangs ${formatLength(-lay.leadIn)} past the left end`;
  if (lay.tailIn < -EPS) return `devices run ${formatLength(-lay.tailIn)} past the end of the run`;
  return null;
}

// Authoritative check of a finished build (the server runs this too, so the
// API can't be handed nonsense). Returns the cleaned build or the first problem.
export type BuildCheck = { ok: true; build: WiremoldBuild } | { ok: false; error: string };

export function checkBuild(raw: any): BuildCheck {
  const bad = (error: string): BuildCheck => ({ ok: false, error });
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const r16 = (n: number) => Math.round(n / SIXTEENTH) * SIXTEENTH;
  // Centers sit half a box from an edge, and a box can be an odd number of
  // sixteenths long — so center-to-center values keep 1/32" to land box edges exactly.
  const r32 = (n: number) => Math.round(n * 32) / 32;

  const label = String(raw?.label ?? '').trim().slice(0, 60);
  const qty = num(raw?.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return bad(`quantity must be a whole number, 1–${MAX_QTY}`);
  const lengthIn = r16(num(raw?.lengthIn));
  if (!(lengthIn > 0)) return bad('length is required');
  if (lengthIn > MAX_LENGTH_IN) return bad(`length is over ${formatLength(MAX_LENGTH_IN)}`);
  const devices = num(raw?.devices);
  if (!Number.isInteger(devices) || devices < 1 || devices > MAX_DEVICES) return bad(`devices must be 1–${MAX_DEVICES}`);

  // Raceway and device boxes. Every one of these may be missing on a ticket
  // sent by an older copy of the form; each has the meaning it had then.
  const series = String(raw?.series ?? '').trim().slice(0, 40);
  if (raw?.channels !== undefined && raw.channels !== 1 && raw.channels !== 2) return bad('raceway must be single or double');
  const channels: 1 | 2 = raw?.channels === 2 ? 2 : 1;
  if (raw?.horizontal !== undefined && typeof raw.horizontal !== 'boolean') return bad('box direction must be yes or no');
  const horizontal = raw?.horizontal === true;
  if (raw?.measure !== undefined && raw.measure !== 'clear' && raw.measure !== 'center') return bad('unknown spacing measure');
  const measure: Measure = raw?.measure === 'clear' ? 'clear' : 'center';
  let deviceTypes: DeviceType[] = Array(devices).fill('duplex');
  if (raw?.deviceTypes !== undefined) {
    if (!Array.isArray(raw.deviceTypes) || raw.deviceTypes.length !== devices || !raw.deviceTypes.every(isDeviceType)) return bad('every device must be duplex or double duplex');
    deviceTypes = raw.deviceTypes;
  }
  // Top or bottom channel. Only a double has a bottom, so on a single everything is top.
  let places: Place[] = Array(devices).fill('top');
  if (raw?.places !== undefined) {
    if (!Array.isArray(raw.places) || raw.places.length !== devices || !raw.places.every(isPlace)) return bad('every device must be in the top or bottom channel');
    if (channels === 2) places = raw.places;
    else if (raw.places.includes('bottom')) return bad('only a double raceway has a bottom channel');
  }
  const defs = boxDefaults(series, horizontal);
  let widthsIn: number[] = deviceTypes.map(t => defs[t]);
  if (raw?.widthsIn !== undefined) {
    if (!Array.isArray(raw.widthsIn) || raw.widthsIn.length !== devices) return bad('every device needs a box length');
    widthsIn = raw.widthsIn.map((x: unknown) => r16(num(x)));
    if (widthsIn.some(x => !(x > 0) || x > MAX_BOX_IN)) return bad(`box length must be more than zero and no more than ${formatLength(MAX_BOX_IN)}`);
  }

  const gapsRaw: unknown[] = Array.isArray(raw?.gapsIn) ? raw.gapsIn : [];
  if (gapsRaw.length !== devices - 1) return bad(`${devices} devices need ${devices - 1} spacing${devices - 1 === 1 ? '' : 's'}`);
  const gapsIn = gapsRaw.map(g => r32(num(g)));
  if (gapsIn.some(g => !(g > 0))) return bad('every spacing must be longer than zero');

  let startIn: number | null = null;
  if (raw?.startIn !== null && raw?.startIn !== undefined) {
    startIn = r32(num(raw.startIn));
    if (!(startIn >= 0)) return bad('first-device distance must be zero or more');
  }
  const wrong = layoutProblem(layoutBuild({ lengthIn, gapsIn, startIn, widthsIn }), startIn === null);
  if (wrong) return bad(wrong);

  const colorsRaw: unknown[] = Array.isArray(raw?.deviceColors) ? raw.deviceColors : [];
  if (colorsRaw.length !== devices || !colorsRaw.every(isDeviceColor)) return bad('every device needs a color');

  if (raw?.feed !== 'left' && raw?.feed !== 'right' && raw?.feed !== 'both') return bad('choose a feed end');

  // A missing whip is fine — that is an end cap (and what tickets sent before this field existed mean).
  let whipIn: number | null = null;
  if (raw?.whipIn !== null && raw?.whipIn !== undefined) {
    whipIn = r16(num(raw.whipIn));
    if (!(whipIn > 0)) return bad('whip length must be more than zero — leave it out for an end cap');
    if (whipIn > MAX_WHIP_IN) return bad(`whip is over ${formatLength(MAX_WHIP_IN)}`);
  }

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
      label, qty, series, channels, lengthIn, devices, horizontal, deviceTypes, places, widthsIn, measure,
      gapsIn, startIn, deviceColors: colorsRaw as string[],
      feed: raw.feed, whipIn, wire: { type, size: w.size, conductors }
    }
  };
}

// ── what the foreman has typed ──
export interface BuildDraft {
  label: string;
  qty: string;
  series: string;          // '' until one is chosen
  channels: 1 | 2;         // single or double raceway
  length: string;          // "12'" — a bare number means feet
  devices: string;
  deviceType: DeviceType;  // type of every device…
  types: string[];         // …unless this has an entry for that device
  place: Place;            // on a double: the channel every device sits in…
  places: string[];        // …unless this has an entry for that device
  horizontal: boolean;     // boxes turned to run along the raceway
  boxDuplex: string;       // how much of the run a duplex box takes; blank = the standard size
  boxDouble: string;       // same, for a double duplex
  measure: Measure;        // spacing typed between boxes, or center to center
  spacing: string;         // "2'-6"" for every gap — a bare number means inches
  gaps: string[];          // a gap's own spacing; '' = use the main spacing for that gap
  eachGap: boolean;        // the "spacing of each gap" panel is open
  start: string;           // blank = centered; a bare number means inches
  feed: FeedEnd;
  whip: string;            // whip length at the fed end(s); blank = end capped; a bare number means feet
  deviceColor: string;     // color for every device…
  colors: string[];        // …unless this has an entry for that device
  each: boolean;           // the "each device" panel is open
  wireType: string;
  wireSize: WireSize;
  conductors: Conductor[];
}

export const emptyBuildDraft = (): BuildDraft => ({
  label: '', qty: '1', series: '', channels: 1, length: '', devices: '',
  deviceType: 'duplex', types: [], place: 'top', places: [], horizontal: false, boxDuplex: '', boxDouble: '',
  measure: 'clear', spacing: '', gaps: [], eachGap: false, start: '', feed: 'left', whip: '',
  deviceColor: DEFAULT_DEVICE_COLOR, colors: [], each: false,
  wireType: DEFAULT_WIRE_TYPE, wireSize: DEFAULT_WIRE_SIZE,
  conductors: WIRE_PRESETS[0].conductors.map(c => ({ ...c }))
});

export type DraftField = 'qty' | 'length' | 'devices' | 'box' | 'spacing' | 'gaps' | 'start' | 'whip' | 'wire' | 'fit';
export interface DraftResult {
  build: WiremoldBuild | null;                 // set only when nothing is wrong
  errors: Partial<Record<DraftField, string>>;
  // how each field was understood
  echo: { length?: string; spacing?: string; alt?: string; start?: string; end?: string; whip?: string };
  box: Record<DeviceType, string>;             // the box length in force for each type, e.g. 2 3/4"
  gapEcho: string[];                           // the spacing in force for each gap ('' where none is known yet)
  badGaps: number[];                           // gaps whose own spacing can't be read
  complete: boolean;                           // false while the essentials are still blank
}

// Turns typed text into a build, with a friendly message for each field that
// can't be read yet. Fields left blank aren't errors until the foreman submits
// (`complete` says whether the essentials are filled in).
export function resolveDraft(d: BuildDraft): DraftResult {
  const errors: DraftResult['errors'] = {};
  const echo: DraftResult['echo'] = {};
  let complete = true;

  // A draft saved before a choice existed doesn't have it; it means what it meant then.
  const measure: Measure = d.measure === 'clear' ? 'clear' : 'center';
  const series = typeof d.series === 'string' ? d.series : '';
  const horizontal = d.horizontal === true;
  const channels: 1 | 2 = d.channels === 2 ? 2 : 1;

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

  // box sizes: the standard size for this series and direction, unless one is typed
  const size: Record<DeviceType, number> = { ...boxDefaults(series, horizontal) };
  for (const t of ['duplex', 'double'] as DeviceType[]) {
    const txt = ((t === 'duplex' ? d.boxDuplex : d.boxDouble) || '').trim();
    if (!txt) continue;
    const v = parseLength(txt, 'in');
    if (v === null || !(v > 0) || v > MAX_BOX_IN) errors.box = errors.box || `"${txt}" isn't a box length — try 2 3/4" or 12"`;
    else size[t] = v;
  }
  const box: Record<DeviceType, string> = { duplex: formatLength(size.duplex), double: formatLength(size.double) };

  // each device's type, and so how much of the run its box takes
  let deviceTypes: DeviceType[] = [];
  let widthsIn: number[] = [];
  if (Number.isFinite(devices)) {
    const all: DeviceType = d.deviceType === 'double' ? 'double' : 'duplex';
    const own = d.types || [];
    deviceTypes = Array.from({ length: devices }, (_, i) => (isDeviceType(own[i]) ? own[i] as DeviceType : all));
    widthsIn = deviceTypes.map(t => size[t]);
  }

  // on a double, the channel each device sits in (a single has only the top)
  let places: Place[] = [];
  if (Number.isFinite(devices)) {
    const all: Place = d.place === 'bottom' ? 'bottom' : 'top';
    const own = d.places || [];
    places = Array.from({ length: devices }, (_, i) => (channels === 2 ? (isPlace(own[i]) ? own[i] as Place : all) : 'top'));
  }

  // spacing: the main value covers every gap; a gap with its own value replaces it there.
  // Between boxes, a gap may be zero (boxes touching); center to center it can't be.
  let gaps: number[] | null = null;              // always center to center
  const gapEcho: string[] = [];
  const badGaps: number[] = [];
  const tooSmall = (g: number) => (measure === 'clear' ? g < 0 : !(g > 0));
  if (Number.isFinite(devices)) {
    const n = devices - 1;
    let base: (number | null)[] = Array(n).fill(null);
    if (n > 0 && d.spacing.trim()) {
      const p = parseSpacings(d.spacing);
      if (p.bad.length) errors.spacing = `"${p.bad[0]}" isn't a length — try 2'-6" or 30"`;
      else if (p.gaps.some(tooSmall)) errors.spacing = 'Spacing must be more than zero';
      else if (p.gaps.length === 1) base = Array(n).fill(p.gaps[0]);
      else if (p.gaps.length === n) base = p.gaps;
      else errors.spacing = `${devices} devices have ${n} gaps — type one spacing for all, or ${n} separated by commas`;
    }
    const typed = base.slice();                  // as measured on the form
    const each = d.gaps || [];
    let own = 0;
    for (let i = 0; i < n; i++) {
      const t = (each[i] || '').trim();
      if (!t) continue;
      const v = parseLength(t, 'in');
      if (v === null || tooSmall(v)) { badGaps.push(i); continue; }
      typed[i] = v;
      own++;
    }
    if (badGaps.length) {
      const i = badGaps[0];
      errors.gaps = `Gap ${i + 1} → ${i + 2}: "${(each[i] || '').trim()}" isn't a length — try 2'-6" or 30"`;
    }
    for (let i = 0; i < n; i++) gapEcho.push(typed[i] === null ? '' : formatLength(typed[i] as number));
    if (!errors.spacing && !errors.gaps) {
      if (typed.every(g => g !== null)) {
        const t = typed as number[];
        const half = (i: number) => (widthsIn[i] + widthsIn[i + 1]) / 2;   // from one box's center to its edge, and the next's
        gaps = measure === 'clear' ? t.map((g, i) => g + half(i)) : t;
        if (n > 0) {
          const same = (xs: number[]) => xs.every(x => Math.abs(x - xs[0]) < 1e-9);
          const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
          echo.spacing = measure === 'clear'
            ? (same(t) ? `${formatLength(t[0])} between each box` : `${formatLength(sum(t))} of open raceway between boxes`)
            : (same(t) ? `${formatLength(t[0])} center to center` : `${formatLength(sum(t))} from first to last`);
          if (own) echo.spacing += ` · ${own} gap${own === 1 ? '' : 's'} set individually`;
          // the same spacing, measured the other way
          const other = measure === 'clear' ? gaps : gaps.map((g, i) => g - half(i));
          if (same(other) && other[0] >= 0) {
            echo.alt = measure === 'clear'
              ? `${formatLength(other[0])} center to center`
              : `${formatLength(other[0])} between boxes`;
          }
        }
      } else complete = false;   // at least one gap has no spacing yet
    }
  }

  // first device: between boxes it is the open raceway before the first box;
  // center to center it is the distance to the device's center
  let startIn: number | null = null;             // always to the center
  if (d.start.trim()) {
    const v = parseLength(d.start, 'in');
    if (v === null || v < 0) errors.start = `Type the distance like 1'-6" or 18"`;
    else if (widthsIn.length) startIn = measure === 'clear' ? v + widthsIn[0] / 2 : v;
  }

  // does it fit?
  if (Number.isFinite(lengthIn) && gaps && !errors.start && !errors.box) {
    const lay = layoutBuild({ lengthIn, gapsIn: gaps, startIn, widthsIn });
    const wrong = layoutProblem(lay, startIn === null);
    if (wrong) {
      errors.fit = wrong.includes('overlap')
        ? wrong[0].toUpperCase() + wrong.slice(1)
        : `${wrong.startsWith('devices') ? 'The ' + wrong : wrong[0].toUpperCase() + wrong.slice(1)} — shorten the spacing or the offset, or lengthen the run`;
    } else {
      echo.start = formatLength(measure === 'clear' ? lay.leadIn : lay.startIn) + (startIn === null ? ' (centered)' : '');
      echo.end = formatLength(measure === 'clear' ? lay.tailIn : lay.endIn);
    }
  }

  // whip at the fed end(s) — blank means the wire is end capped there
  let whipIn: number | null = null;
  if ((d.whip || '').trim()) {
    const v = parseLength(d.whip, 'ft');
    if (v === null || !(v > 0)) errors.whip = `Type the whip length like 6' or 6'-6" — or leave it blank for an end cap`;
    else if (v > MAX_WHIP_IN) errors.whip = `Longest whip is ${formatLength(MAX_WHIP_IN)}`;
    else whipIn = v;
  }
  if (!errors.whip) {
    echo.whip = whipIn === null
      ? 'No whip — the wire is end capped'
      : `${formatLength(whipIn)} whip at ${d.feed === 'both' ? 'each end' : `the ${d.feed} end`}`;
  }

  // wire
  if (!d.conductors.length) errors.wire = 'Add at least one conductor';
  else if (d.conductors.length > MAX_CONDUCTORS) errors.wire = `Up to ${MAX_CONDUCTORS} conductors`;

  let build: WiremoldBuild | null = null;
  if (complete && !Object.keys(errors).length && Number.isFinite(lengthIn) && Number.isFinite(devices) && gaps) {
    const colors = Array.from({ length: devices }, (_, i) =>
      isDeviceColor(d.colors[i]) ? d.colors[i] : isDeviceColor(d.deviceColor) ? d.deviceColor : DEFAULT_DEVICE_COLOR);
    const chk = checkBuild({
      label: d.label, qty, series, channels, lengthIn, devices, horizontal, deviceTypes, places, widthsIn, measure,
      gapsIn: gaps, startIn, deviceColors: colors, feed: d.feed, whipIn,
      wire: { type: d.wireType, size: d.wireSize, conductors: d.conductors }
    });
    if (chk.ok) build = chk.build; else errors.wire = chk.error;
  }
  return { build, errors, echo, box, gapEcho, badGaps, complete };
}

// ── the to-scale drawing ──
// Long runs wrap into equal rows (up to 20 ft each) so the drawing stays
// readable and prints. Everything is in inches from the LEFT end of the run.
export const ROW_TARGET_IN = 240;

export interface GeoRow { index: number; from: number; to: number; }
export interface GeoDevice {
  index: number;
  at: number;                // center
  left: number;              // near edge of the box
  right: number;             // far edge of the box
  widthIn: number;
  row: number;
  color: DeviceColor;
  type: DeviceType;
  place: Place;              // top or bottom channel
}
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
  measure: Measure;          // dimensions run box edge to box edge, or center to center
  channels: 1 | 2;
  horizontal: boolean;
  wired: Place[];            // the channels that carry wire — the ones with devices in them
}

export function wiremoldGeometry(raw: WiremoldBuild): Geometry {
  const b = fillBuild(raw);
  const nRows = Math.max(1, Math.ceil(b.lengthIn / ROW_TARGET_IN - 1e-9));
  const rowIn = b.lengthIn / nRows;
  const rows: GeoRow[] = Array.from({ length: nRows }, (_, i) => ({ index: i, from: i * rowIn, to: (i + 1) * rowIn }));
  const rowOf = (at: number) => Math.min(nRows - 1, Math.max(0, Math.floor(at / rowIn + 1e-9)));

  const layout = layoutBuild(b);
  const devices: GeoDevice[] = layout.positions.map((at, i) => ({
    index: i, at, left: layout.lefts[i], right: layout.rights[i], widthIn: b.widthsIn[i],
    row: rowOf(at), color: deviceColor(b.deviceColors[i]), type: b.deviceTypes[i], place: b.places[i]
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
  // Dimension it the way it was typed: the open raceway between boxes, or center to center.
  const edge = b.measure === 'clear';
  const last = devices.length - 1;
  addDim('lead', 0, edge ? layout.lefts[0] : layout.positions[0]);
  for (let i = 0; i < last; i++) {
    addDim('gap', edge ? layout.rights[i] : layout.positions[i], edge ? layout.lefts[i + 1] : layout.positions[i + 1]);
  }
  addDim('tail', edge ? layout.rights[last] : layout.positions[last], b.lengthIn);

  return {
    lengthIn: b.lengthIn, rows, devices, segments: segs, layout, measure: b.measure, channels: b.channels,
    horizontal: b.horizontal, wired: wiredChannels(b).map(c => c.place)
  };
}

// ── wire to cut ──
export interface CutLine { type: string; size: WireSize; color: WireColor; pieces: number; inches: number; }
export interface TicketTotals { builds: number; runs: number; devices: number; wireInches: number; lines: CutLine[]; }

// Every conductor is cut to conductorLength() — run + a foot per device + any
// whip — once for each run in the quantity.
export function ticketTotals(builds: WiremoldBuild[]): TicketTotals {
  const acc = new Map<string, CutLine>();
  let runs = 0, devices = 0, wireInches = 0;
  for (const b of builds) {
    runs += b.qty;
    devices += b.devices * b.qty;
    const wl = conductorLength(b);
    const each = wl.totalIn;               // every set of this color, for one run
    const sets = wl.sets.length;           // one piece per channel that has devices
    for (const c of b.wire.conductors) {
      const key = `${b.wire.type}|${b.wire.size}|${c.color}`;
      const line = acc.get(key) || { type: b.wire.type, size: b.wire.size, color: wireColor(c.color), pieces: 0, inches: 0 };
      line.pieces += b.qty * sets;
      line.inches += each * b.qty;
      acc.set(key, line);
      wireInches += each * b.qty;
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
