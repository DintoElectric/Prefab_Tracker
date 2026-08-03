import { materialsStore, currentUser, ensureSeed, json, unauthorized, forbidden } from '../lib/store.mts';

const CLASSES = ['box', 'wire', 'conduit', 'other'];

export default async function handler(req: Request, context: any) {
  const user = await currentUser(req);
  if (!user) return unauthorized();
  await ensureSeed();
  const store = materialsStore();
  const id = context?.params?.id as string | undefined;

  // GET /api/materials — all per-unit templates, keyed by assembly id.
  if (req.method === 'GET' && !id) {
    const { blobs } = await store.list();
    const out: Record<string, unknown> = {};
    for (const b of blobs) {
      const rows = await store.get(b.key, { type: 'json' });
      if (rows) out[b.key] = rows;
    }
    return json({ materials: out });
  }

  // PUT /api/materials/:assemblyId — replace one assembly's template. Admin only.
  if (req.method === 'PUT' && id) {
    if (user.role !== 'admin') return forbidden();
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!rows) return json({ error: 'rows array required' }, 400);
    const clean = rows.map((r: any) => ({
      desc: String(r?.desc || ''),
      mfg: String(r?.mfg || '').toUpperCase(),
      cat: String(r?.cat || ''),
      per: String(r?.per || ''),
      cls: CLASSES.includes(r?.cls) ? r.cls : 'other'
    }));
    await store.setJSON(id, clean);
    return json({ id, rows: clean });
  }

  return json({ error: 'Not found' }, 404);
}

export const config = { path: ['/api/materials', '/api/materials/:id'] };
