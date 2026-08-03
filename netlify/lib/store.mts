// Shared server-side helpers: Netlify Blobs stores, password hashing,
// signed session cookies, and first-run seeding.
import { getStore } from '@netlify/blobs';
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export type Role = 'foreman' | 'prefab' | 'admin';
export interface UserRecord {
  username: string;
  name: string;      // display name, e.g. 'R. Alvarez — Foreman'
  role: Role;
  salt: string;
  hash: string;
  active: boolean;
  createdAt: string;
}

export const usersStore = () => getStore('users');
export const requestsStore = () => getStore('requests');
export const configStore = () => getStore('config');
export const materialsStore = () => getStore('materials');
export const profilesStore = () => getStore('profiles');

export interface SpecProfileRecord {
  id: string;
  name: string;
  active: boolean;
  notes?: string;
  limits: Record<string, string[]>;
  createdAt: string;
}

// ── passwords ──

export function hashPassword(password: string, salt?: string) {
  const s = salt || randomBytes(16).toString('hex');
  const h = scryptSync(password, s, 64).toString('hex');
  return { salt: s, hash: h };
}
export function verifyPassword(password: string, salt: string, hash: string) {
  const test = scryptSync(password, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return test.length === real.length && timingSafeEqual(test, real);
}

// ── session tokens (HMAC-signed, stored in an HttpOnly cookie) ──

const COOKIE = 'dinto_session';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

async function sessionSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Zero-config fallback: generate once and persist in Blobs.
  const cfg = configStore();
  let secret = await cfg.get('session-secret');
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    await cfg.set('session-secret', secret);
  }
  return secret as string;
}

const b64u = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

export async function makeToken(username: string) {
  const secret = await sessionSecret();
  const payload = b64u(JSON.stringify({ u: username, exp: Date.now() + THIRTY_DAYS * 1000 }));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export async function readToken(token: string): Promise<string | null> {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const secret = await sessionSecret();
    const expect = createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(unb64u(payload));
    if (!data.u || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data.u as string;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=${THIRTY_DAYS}`;
}
export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=0`;
}

function cookieValue(req: Request): string | null {
  const raw = req.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

// Returns the authenticated, active user or null.
export async function currentUser(req: Request): Promise<UserRecord | null> {
  const token = cookieValue(req);
  if (!token) return null;
  const username = await readToken(token);
  if (!username) return null;
  await ensureSeed();
  const rec = (await usersStore().get(username, { type: 'json' })) as UserRecord | null;
  if (!rec || !rec.active) return null;
  return rec;
}

export const publicUser = (u: UserRecord) => ({ username: u.username, name: u.name, role: u.role });

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const unauthorized = () => json({ error: 'Sign in required' }, 401);
export const forbidden = () => json({ error: 'Your role does not permit this action' }, 403);

// ── first-run seeding ──

// Default accounts. CHANGE THESE PASSWORDS after the first sign-in —
// the admin can reset any account from the Users tab.
const SEED_USERS: { username: string; name: string; role: Role; password: string }[] = [
  { username: 'ralvarez', name: 'R. Alvarez — Foreman', role: 'foreman', password: 'Dinto2026!' },
  { username: 'tdoyle', name: 'T. Doyle — Foreman', role: 'foreman', password: 'Dinto2026!' },
  { username: 'mkaur', name: 'M. Kaur — Foreman', role: 'foreman', password: 'Dinto2026!' },
  { username: 'sruiz', name: 'S. Ruiz — Prefab Lead', role: 'prefab', password: 'Dinto2026!' },
  { username: 'jnowak', name: 'J. Nowak — Admin', role: 'admin', password: 'Dinto2026!' }
];

// Per-unit material templates seeded from the book handoff (assemblies 02 and 13).
// The remaining 27 assemblies await the Conest export via Admin › Materials.
const SEED_BOM: Record<string, unknown[]> = {
  '02': [
    { desc: '4" Sq. box, 2-1/8" deep, 1/2 & 3/4 KO', mfg: 'RACO', cat: '232', per: '1', cls: 'box' },
    { desc: '5/8" raised device ring, 1-gang', mfg: 'RACO', cat: '767', per: '1', cls: 'box' },
    { desc: 'Adj. bar hanger, 16" O.C.', mfg: 'CADDY', cat: 'TSGB16', per: '1', cls: 'other' },
    { desc: '#10-32 x 1/2" grounding screw, green', mfg: 'GARVIN', cat: 'GS-1032', per: '1', cls: 'other' },
    { desc: '#8 x 1/2" pan head self-drill screw', mfg: 'GARVIN', cat: 'PHSD812', per: '4', cls: 'other' },
    { desc: '#8 flat washer, zinc', mfg: 'GARVIN', cat: 'FW-8', per: '4', cls: 'other' },
    { desc: '12 AWG solid green pigtail, 8"', mfg: 'SOUTHWIRE', cat: '11591701', per: '1', cls: 'wire' }
  ],
  '13': [
    { desc: '3/4" EMT elbow, factory 90°', mfg: 'ALLIED', cat: '863040', per: '1', cls: 'conduit' },
    { desc: '3/4" EMT set screw connector, steel', mfg: 'BRIDGEPORT', cat: '251-DC2', per: '2', cls: 'box' },
    { desc: '3/4" plastic bushing', mfg: 'TOPAZ', cat: 'BP34', per: '2', cls: 'other' }
  ]
};

let seeded = false;
export async function ensureSeed() {
  if (seeded) return;
  const cfg = configStore();
  const us = usersStore();

  // Self-healing: the flag alone isn't trusted — the admin record must
  // actually exist. If the flag was set but users are missing (partial or
  // mismatched earlier seed), re-run the idempotent seeding below.
  const done = await cfg.get('seeded-v1');
  if (done) {
    const admin = await us.get('jnowak');
    if (admin) { seeded = true; return; }
  }
  for (const s of SEED_USERS) {
    const exists = await us.get(s.username);
    if (exists) continue;
    const { salt, hash } = hashPassword(s.password);
    const rec: UserRecord = { username: s.username, name: s.name, role: s.role, salt, hash, active: true, createdAt: new Date().toISOString() };
    await us.setJSON(s.username, rec);
  }

  const ms = materialsStore();
  for (const [id, rows] of Object.entries(SEED_BOM)) {
    const exists = await ms.get(id);
    if (!exists) await ms.setJSON(id, rows);
  }

  const seq = await cfg.get('seq');
  if (!seq) await cfg.set('seq', '1044'); // never reset an advanced counter on a self-heal
  await cfg.set('seeded-v1', new Date().toISOString());
  seeded = true;
}

export async function nextRequestId(): Promise<string> {
  const cfg = configStore();
  const raw = await cfg.get('seq');
  const n = Number(raw) || 1044;
  await cfg.set('seq', String(n + 1));
  return 'PR-' + n;
}

// ── job spec profile seeding ──
// Separate from the user/materials seed so it also lands on sites that were
// deployed (and flagged seeded-v1) before profiles existed. Allow-lists were
// extracted from the Yale Design Standard, Division 26 (26 05 33 rev. 8/1/17
// and 26 05 00 rev. 8/1/17) and mapped onto the catalog's option codes.
const YALE_PROFILE: SpecProfileRecord = {
  id: 'yale-university-spec',
  name: 'Yale University Spec',
  active: true,
  notes:
    'Yale Design Standard, Div 26. Connectors: compression only — set screw fittings are not ' +
    'acceptable on EMT (26 05 33 E.6); die-cast zinc fittings and Greenfield connectors are ' +
    'prohibited (E.4, E.2). Conduit mfg per 26 05 33 D.3 (Allied, Republic; Western not stocked). ' +
    'Wire mfg per 26 05 00 E.1 (Cerro is the only approved brand the shop stocks); wire must be ' +
    'stranded copper XHHW-2 (26 05 00 F.1). Conduit min 3/4" above grade — 1/2" only to a single ' +
    'device under 20% fill (26 05 33 B.10). Note 26 05 33 F.12 sets a 2-1/2" min device box ' +
    'depth; box styles are left open here — confirm box selection with the Yale PM.',
  limits: {
    mfgWire: ['CERROWIRE'],
    mfgConduit: ['ALLIED', 'REPUBLIC'],
    conn: ['CP']
  },
  createdAt: new Date().toISOString()
};

let profilesSeeded = false;
export async function ensureProfileSeed() {
  if (profilesSeeded) return;
  const cfg = configStore();
  const ps = profilesStore();
  const done = await cfg.get('seeded-profiles-v1');
  if (done) {
    // Self-healing, same policy as the account seed.
    const yale = await ps.get(YALE_PROFILE.id);
    if (yale) { profilesSeeded = true; return; }
  }
  const exists = await ps.get(YALE_PROFILE.id);
  if (!exists) await ps.setJSON(YALE_PROFILE.id, YALE_PROFILE);
  await cfg.set('seeded-profiles-v1', new Date().toISOString());
  profilesSeeded = true;
}
