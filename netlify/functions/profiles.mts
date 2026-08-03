import {
  profilesStore, ensureProfileSeed, currentUser, json, unauthorized, forbidden,
  type SpecProfileRecord
} from '../lib/store.mts';

// Keys a profile may restrict — anything else in `limits` is dropped.
const LIMIT_KEYS = ['mfgBox', 'mfgWire', 'mfgConduit', 'boxStyle', 'ringStyle', 'ringSize', 'trade', 'conn'];

const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Normalize a client-supplied limits object: keep known keys, string arrays
// only, drop empties (an absent key means "no restriction").
function cleanLimits(raw: any): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of LIMIT_KEYS) {
    const v = raw[k];
    if (!Array.isArray(v)) continue;
    const list = v.filter(x => typeof x === 'string' && x.trim()).map(x => String(x));
    if (list.length) out[k] = list;
  }
  return out;
}

export default async function handler(req: Request, context: any) {
  const user = await currentUser(req);
  if (!user) return unauthorized();
  await ensureProfileSeed();
  const store = profilesStore();
  const id = context?.params?.id as string | undefined;

  // GET /api/profiles — any signed-in user, so foremen can load them.
  if (req.method === 'GET' && !id) {
    const { blobs } = await store.list();
    const out: SpecProfileRecord[] = [];
    for (const b of blobs) {
      const p = (await store.get(b.key, { type: 'json' })) as SpecProfileRecord | null;
      if (p) out.push(p);
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return json({ profiles: out });
  }

  // Everything below is admin only.
  if (user.role !== 'admin') return forbidden();

  // POST /api/profiles — create.
  if (req.method === 'POST' && !id) {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    const name = String(body.name || '').trim();
    if (!name) return json({ error: 'Profile name is required' }, 400);
    let pid = slugify(name);
    if (!pid) return json({ error: 'Profile name must contain letters or numbers' }, 400);
    if (await store.get(pid)) return json({ error: 'A profile with a similar name already exists' }, 409);
    const rec: SpecProfileRecord = {
      id: pid,
      name,
      active: body.active !== false,
      notes: typeof body.notes === 'string' ? body.notes : '',
      limits: cleanLimits(body.limits),
      createdAt: new Date().toISOString()
    };
    await store.setJSON(pid, rec);
    return json({ profile: rec }, 201);
  }

  if (id) {
    const rec = (await store.get(id, { type: 'json' })) as SpecProfileRecord | null;
    if (!rec) return json({ error: 'Profile not found' }, 404);

    // PUT /api/profiles/:id — replace editable fields (id is immutable).
    if (req.method === 'PUT') {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
      if (typeof body.name === 'string' && body.name.trim()) rec.name = body.name.trim();
      if (typeof body.active === 'boolean') rec.active = body.active;
      if (typeof body.notes === 'string') rec.notes = body.notes;
      if ('limits' in body) rec.limits = cleanLimits(body.limits);
      await store.setJSON(id, rec);
      return json({ profile: rec });
    }

    // DELETE /api/profiles/:id — submitted requests keep their snapshot
    // (profileId + profileName are stored on the request record).
    if (req.method === 'DELETE') {
      await store.delete(id);
      return json({ ok: true });
    }
  }

  return json({ error: 'Not found' }, 404);
}

export const config = { path: ['/api/profiles', '/api/profiles/:id'] };
