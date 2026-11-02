import { getStore } from '@netlify/blobs';
import { configStore, currentUser, json, unauthorized, forbidden } from '../lib/store.mts';
import {
  cleanSheetInput, WP_STATUSES, sniffFileType, cleanFileName, MAX_FILE_BYTES, MAX_FILES
} from '../../src/data/wirepulls.ts';

// One blob per submitted wire pull sheet, keyed by its WP- number. Attached
// panel schedules live in their own store, keyed "<sheet id>/<file id>".
const sheetsStore = () => getStore('wirepulls');
const filesStore = () => getStore('wirepull-files');

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
    const s: any = await store.get(b.key, { type: 'json' });
    // Sheets saved by the earlier circuit-by-circuit layout have no `boxes`
    // list; skip them rather than break the screen. They are not deleted.
    if (s && Array.isArray(s.boxes)) all.push(s);
  }
  all.sort((a, b) => idNum(b.id) - idNum(a.id)); // newest first
  return all;
}

// Foremen only ever touch their own sheets; prefab and admin see them all.
const canSee = (user: any, rec: any) => user.role !== 'foreman' || rec.by === user.name;
// Attaching or removing a schedule: the foreman who sent the sheet, or admin.
const canAttach = (user: any, rec: any) => user.role === 'admin' || (user.role === 'foreman' && rec.by === user.name);

export default async function handler(req: Request, _context: any) {
  const user = await currentUser(req);
  if (!user) return unauthorized();
  const store = sheetsStore();

  // /api/wirepulls[/:id[/files[/:fileId]]]
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = parts[2] as string | undefined;
  const sub = parts[3] as string | undefined;
  const fileId = parts[4] as string | undefined;

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
      files: [],
      createdAt: new Date().toISOString()
    };
    await store.setJSON(sheetId, record);
    return json({ sheet: record }, 201);
  }

  if (id) {
    const rec: any = await store.get(id, { type: 'json' });
    if (!rec) return json({ error: 'Wire pull sheet not found' }, 404);

    // ── attached panel schedules ──
    if (sub === 'files') {
      // POST /api/wirepulls/:id/files — raw file bytes in the body.
      if (req.method === 'POST' && !fileId) {
        if (!canAttach(user, rec)) return forbidden();
        const files: any[] = Array.isArray(rec.files) ? rec.files : [];
        if (files.length >= MAX_FILES) return json({ error: `Up to ${MAX_FILES} panel schedules per sheet` }, 400);
        const declared = Number(req.headers.get('content-length') || 0);
        if (declared > MAX_FILE_BYTES) return json({ error: 'File is too large (4 MB max)' }, 413);
        const buf = new Uint8Array(await req.arrayBuffer());
        if (!buf.length) return json({ error: 'That file is empty' }, 400);
        if (buf.length > MAX_FILE_BYTES) return json({ error: 'File is too large (4 MB max)' }, 413);
        const type = sniffFileType(buf);
        if (!type) return json({ error: 'Only PDF, PNG or JPEG files can be attached' }, 415);

        let name = '';
        try { name = decodeURIComponent(req.headers.get('x-filename') || ''); } catch { /* fall back to default name */ }
        const meta = { id: crypto.randomUUID().slice(0, 8), name: cleanFileName(name), type, size: buf.length };
        // Blobs wants a plain ArrayBuffer.
        await filesStore().set(`${id}/${meta.id}`, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
        rec.files = [...files, meta];
        await store.setJSON(id, rec);
        return json({ file: meta, sheet: rec }, 201);
      }

      // GET /api/wirepulls/:id/files/:fileId — view or download one.
      if (req.method === 'GET' && fileId) {
        if (!canSee(user, rec)) return forbidden();
        const meta = (rec.files || []).find((f: any) => f.id === fileId);
        if (!meta) return json({ error: 'File not found' }, 404);
        const bytes = await filesStore().get(`${id}/${fileId}`, { type: 'arrayBuffer' });
        if (!bytes) return json({ error: 'File not found' }, 404);
        return new Response(bytes, {
          status: 200,
          headers: {
            'content-type': meta.type,
            'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
            'cache-control': 'private, max-age=300',
            'x-content-type-options': 'nosniff'
          }
        });
      }

      // DELETE /api/wirepulls/:id/files/:fileId — remove one.
      if (req.method === 'DELETE' && fileId) {
        if (!canAttach(user, rec)) return forbidden();
        const meta = (rec.files || []).find((f: any) => f.id === fileId);
        if (!meta) return json({ error: 'File not found' }, 404);
        await filesStore().delete(`${id}/${fileId}`);
        rec.files = rec.files.filter((f: any) => f.id !== fileId);
        await store.setJSON(id, rec);
        return json({ sheet: rec });
      }
      return json({ error: 'Not found' }, 404);
    }

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

    // DELETE /api/wirepulls/:id — admin only; takes its attachments with it.
    if (req.method === 'DELETE') {
      if (user.role !== 'admin') return forbidden();
      for (const f of rec.files || []) await filesStore().delete(`${id}/${f.id}`);
      await store.delete(id);
      return json({ ok: true });
    }

    // GET one — role-scoped like the list.
    if (req.method === 'GET') {
      if (!canSee(user, rec)) return forbidden();
      return json({ sheet: rec });
    }
  }

  return json({ error: 'Not found' }, 404);
}

export const config = {
  path: ['/api/wirepulls', '/api/wirepulls/:id', '/api/wirepulls/:id/files', '/api/wirepulls/:id/files/:fileId']
};
