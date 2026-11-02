import { getStore } from '@netlify/blobs';
import { configStore, currentUser, json, unauthorized, forbidden } from '../lib/store.mts';
import { cleanSheetInput, WP_STATUSES } from '../../src/data/wirepulls.ts';

// One blob per submitted wire pull sheet, keyed by its WP- number.
const sheetsStore = () => getStore('wirepulls');

// Own counter so wire pull numbers never collide with PR- request numbers.
async function nextSheetId(): Promise<string> {
  const cfg = configStore();
  const raw = await cfg.get('seq-wp');
  const n = Number(raw) || 1001;
  await cfg.set('seq-wp', String(n + 1));
  return 'WP-' + n;
}

const idNum = (id: unknown) => Number(String(id).replace(/\D/g, ''));

async function loadAll() {
  const store = sheetsStore();
  const { blobs } = await store.list();
  const all: any[] = [];
  for (const b of blobs) {
    const s = await store.get(b.key, { type: 'json' });
    if (s) all.push(s);
  }
  all.sort((a, b) => idNum(b.id) - idNum(a.id)); // newest first
  return all;
}

export default async function handler(req: Request, context: any) {
  const user = await currentUser(req);
  if (!user) return unauthorized();
  const store = sheetsStore();
  const id = context?.params?.id as string | undefined;

  // GET /api/wirepulls — foremen see only their own sheets.
  if (req.method === 'GET' && !id) {
    let all = await loadAll();
    if (user.role === 'foreman') all = all.filter(s => s.by === user.name);
    return json({ sheets: all });
  }

  // POST /api/wirepulls — submit a sheet (foreman or admin).
  if (req.method === 'POST' && !id) {
    if (user.role === 'prefab') return forbidden();
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    const clean = cleanSheetInput(body);
    if (!clean.ok) return json({ error: clean.error }, 400);

    const sheetId = await nextSheetId();
    const record = {
      id: sheetId,
      ...clean.value,
      by: user.name, // the signed-in account, never client-supplied
      status: 'Submitted',
      createdAt: new Date().toISOString()
    };
    await store.setJSON(sheetId, record);
    return json({ sheet: record }, 201);
  }

  if (id) {
    const rec: any = await store.get(id, { type: 'json' });
    if (!rec) return json({ error: 'Wire pull sheet not found' }, 404);

    // PATCH /api/wirepulls/:id — status only, prefab & admin.
    if (req.method === 'PATCH') {
      if (user.role === 'foreman') return forbidden();
      let body: any;
      try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
      if (!('status' in body)) return json({ error: 'Nothing to update' }, 400);
      if (!WP_STATUSES.includes(body.status)) return json({ error: 'Unknown status' }, 400);
      rec.status = body.status;
      await store.setJSON(id, rec);
      return json({ sheet: rec });
    }

    // DELETE /api/wirepulls/:id — admin only.
    if (req.method === 'DELETE') {
      if (user.role !== 'admin') return forbidden();
      await store.delete(id);
      return json({ ok: true });
    }

    // GET one — role-scoped like the list.
    if (req.method === 'GET') {
      if (user.role === 'foreman' && rec.by !== user.name) return forbidden();
      return json({ sheet: rec });
    }
  }

  return json({ error: 'Not found' }, 404);
}

export const config = { path: ['/api/wirepulls', '/api/wirepulls/:id'] };
