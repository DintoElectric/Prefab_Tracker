import { getStore } from '@netlify/blobs';
import { configStore, currentUser, json, unauthorized, forbidden } from '../lib/store.mts';
import { cleanTicketInput, WM_STATUSES } from '../../src/data/wiremold.ts';

// One blob per wiremold ticket, keyed by its WM- number. A ticket holds many
// builds, the same way a wire pull sheet holds many boxes.
const ticketsStore = () => getStore('wiremold');

// Own counter so wiremold numbers never collide with PR- or WP- numbers.
async function nextTicketId(): Promise<string> {
  const cfg = configStore();
  const raw = await cfg.get('seq-wm');
  const n = Number(raw) || 1001;
  await cfg.set('seq-wm', String(n + 1));
  return 'WM-' + n;
}

const idNum = (id: unknown) => Number(String(id).replace(/\D/g, ''));

async function loadAll() {
  const store = ticketsStore();
  const { blobs } = await store.list();
  const all: any[] = [];
  for (const b of blobs) {
    const t: any = await store.get(b.key, { type: 'json' });
    if (t && Array.isArray(t.builds)) all.push(t);
  }
  all.sort((a, b) => idNum(b.id) - idNum(a.id)); // newest first
  return all;
}

// Foremen only ever touch their own tickets; prefab and admin see them all.
const canSee = (user: any, rec: any) => user.role !== 'foreman' || rec.by === user.name;

export default async function handler(req: Request, _context: any) {
  const user = await currentUser(req);
  if (!user) return unauthorized();
  const store = ticketsStore();

  // /api/wiremold[/:id]
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = parts[2] as string | undefined;

  // GET /api/wiremold — foremen see only their own tickets.
  if (req.method === 'GET' && !id) {
    let all = await loadAll();
    if (user.role === 'foreman') all = all.filter(t => t.by === user.name);
    return json({ tickets: all });
  }

  // POST /api/wiremold — submit a ticket (foreman or admin).
  if (req.method === 'POST' && !id) {
    if (user.role === 'prefab') return forbidden();
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    const clean = cleanTicketInput(body);
    if (!clean.ok) return json({ error: clean.error }, 400);

    const ticketId = await nextTicketId();
    const record = {
      id: ticketId,
      ...clean.value,
      by: user.name, // the signed-in account, never client-supplied
      status: 'Submitted',
      createdAt: new Date().toISOString()
    };
    await store.setJSON(ticketId, record);
    return json({ ticket: record }, 201);
  }

  if (id) {
    const rec: any = await store.get(id, { type: 'json' });
    if (!rec) return json({ error: 'Wiremold ticket not found' }, 404);

    // PATCH /api/wiremold/:id — status only, prefab & admin.
    if (req.method === 'PATCH') {
      if (user.role === 'foreman') return forbidden();
      let body: any;
      try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
      if (!('status' in body)) return json({ error: 'Nothing to update' }, 400);
      if (!WM_STATUSES.includes(body.status)) return json({ error: 'Unknown status' }, 400);
      rec.status = body.status;
      await store.setJSON(id, rec);
      return json({ ticket: rec });
    }

    // DELETE /api/wiremold/:id — admin only.
    if (req.method === 'DELETE') {
      if (user.role !== 'admin') return forbidden();
      await store.delete(id);
      return json({ ok: true });
    }

    // GET one — role-scoped like the list.
    if (req.method === 'GET') {
      if (!canSee(user, rec)) return forbidden();
      return json({ ticket: rec });
    }
  }

  return json({ error: 'Not found' }, 404);
}

export const config = { path: ['/api/wiremold', '/api/wiremold/:id'] };
