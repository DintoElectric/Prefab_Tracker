import {
  requestsStore, profilesStore, currentUser, nextRequestId, json, unauthorized, forbidden,
  type SpecProfileRecord
} from '../lib/store.mts';

const STATUSES = ['Submitted', 'Scheduled', 'In Build', 'Ready', 'Closed'];
const isoMonday = () => {
  const x = new Date();
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  const y = x.getFullYear(), m = String(x.getMonth() + 1).padStart(2, '0'), d = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

async function loadAll() {
  const store = requestsStore();
  const { blobs } = await store.list();
  const all: any[] = [];
  for (const b of blobs) {
    const r = await store.get(b.key, { type: 'json' });
    if (r) all.push(r);
  }
  // Newest first by numeric id.
  all.sort((a, b) => Number(String(b.id).replace(/\D/g, '')) - Number(String(a.id).replace(/\D/g, '')));
  return all;
}

// Server-side validation of a submitted line — shape only; option values are
// checked loosely since schemas live in the client bundle by design.
function cleanLines(lines: any): any[] | null {
  if (!Array.isArray(lines) || !lines.length) return null;
  const out = [];
  for (const l of lines) {
    if (!l || typeof l.assemblyId !== 'string') return null;
    const qty = Math.max(1, Math.floor(Number(l.qty) || 0));
    if (!qty) return null;
    out.push({
      assemblyId: l.assemblyId,
      opts: l.opts && typeof l.opts === 'object' ? l.opts : {},
      code: typeof l.code === 'string' ? l.code : '',
      qty,
      mfgPref: l.mfgPref && typeof l.mfgPref === 'object' ? l.mfgPref : undefined,
      mfgSel: undefined
    });
  }
  return out;
}

// Re-check every submitted line against a profile's allow-lists so the
// limits can't be bypassed by calling the API directly (mirrors how `by`
// and role checks work). Blank option values always pass — selecting
// nothing can't violate a spec.
const LIMITED_OPT_KEYS = ['boxStyle', 'ringStyle', 'ringSize', 'trade', 'conn'];
const MFG_LIMIT_KEY: Record<string, string> = { box: 'mfgBox', wire: 'mfgWire', conduit: 'mfgConduit' };
function profileViolation(profile: SpecProfileRecord, lines: any[]): string | null {
  const limits = profile.limits || {};
  for (const l of lines) {
    for (const key of LIMITED_OPT_KEYS) {
      const limit = limits[key];
      if (!limit || !limit.length) continue;
      const v = l.opts?.[key];
      if (typeof v === 'string' && v !== '' && !limit.includes(v)) {
        return `Line ${l.assemblyId}: ${key} "${v}" is not permitted by ${profile.name}`;
      }
    }
    for (const [cls, key] of Object.entries(MFG_LIMIT_KEY)) {
      const limit = limits[key];
      const pref = l.mfgPref?.[cls];
      if (limit && limit.length && typeof pref === 'string' && pref && !limit.includes(pref)) {
        return `Line ${l.assemblyId}: ${cls} manufacturer "${pref}" is not permitted by ${profile.name}`;
      }
    }
  }
  return null;
}

export default async function handler(req: Request, context: any) {
  const user = await currentUser(req);
  if (!user) return unauthorized();
  const store = requestsStore();
  const id = context?.params?.id as string | undefined;

  // GET /api/requests — foremen see only their own.
  if (req.method === 'GET' && !id) {
    let all = await loadAll();
    if (user.role === 'foreman') all = all.filter(r => r.by === user.name);
    return json({ requests: all });
  }

  // POST /api/requests — submit (foreman or admin).
  if (req.method === 'POST' && !id) {
    if (user.role === 'prefab') return forbidden();
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    const job = String(body.job || '').trim();
    if (!job) return json({ error: 'Job name is required' }, 400);
    const lines = cleanLines(body.lines);
    if (!lines) return json({ error: 'At least one assembly line is required' }, 400);

    // Job spec profile — optional; when present it must exist, be active,
    // and every line must be inside its allow-lists.
    let profileId: string | null = null;
    let profileName: string | null = null;
    if (typeof body.profileId === 'string' && body.profileId) {
      const profile = (await profilesStore().get(body.profileId, { type: 'json' })) as SpecProfileRecord | null;
      if (!profile) return json({ error: 'Unknown job spec profile' }, 400);
      if (!profile.active) return json({ error: `${profile.name} is not active` }, 400);
      const bad = profileViolation(profile, lines);
      if (bad) return json({ error: bad }, 400);
      profileId = profile.id;
      profileName = profile.name;
    }

    const reqId = await nextRequestId();
    const record = {
      id: reqId,
      job,
      by: user.name, // the signed-in account, never client-supplied
      needBy: typeof body.needBy === 'string' ? body.needBy : '',
      priority: body.priority === 'Hot' ? 'Hot' : 'Standard',
      notes: String(body.notes || ''),
      status: 'Submitted',
      week: null,
      lines,
      profileId,
      profileName,
      createdAt: new Date().toISOString()
    };
    await store.setJSON(reqId, record);
    return json({ request: record }, 201);
  }

  if (id) {
    const rec: any = await store.get(id, { type: 'json' });
    if (!rec) return json({ error: 'Request not found' }, 404);

    // PATCH /api/requests/:id
    if (req.method === 'PATCH') {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

      // Status advance / set — prefab & admin only.
      if ('status' in body) {
        if (user.role === 'foreman') return forbidden();
        if (!STATUSES.includes(body.status)) return json({ error: 'Unknown status' }, 400);
        rec.status = body.status;
        if (rec.status === 'Scheduled' && !rec.week) rec.week = isoMonday();
        await store.setJSON(id, rec);
        return json({ request: rec });
      }

      // Build-week assignment / clearing — prefab & admin only.
      if ('week' in body) {
        if (user.role === 'foreman') return forbidden();
        if (body.week === null) {
          rec.week = null;
          rec.status = 'Submitted';
        } else {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.week))) return json({ error: 'Bad week' }, 400);
          rec.week = body.week;
          if (rec.status === 'Submitted') rec.status = 'Scheduled';
        }
        await store.setJSON(id, rec);
        return json({ request: rec });
      }

      // Shop manufacturer override on a ticket row — prefab & admin only.
      if ('mfg' in body) {
        if (user.role === 'foreman') return forbidden();
        const li = Number(body.lineIdx), ri = Number(body.rowIdx);
        if (!Number.isInteger(li) || !rec.lines[li]) return json({ error: 'Bad line index' }, 400);
        const line = rec.lines[li];
        line.mfgSel = { ...(line.mfgSel || {}), [ri]: String(body.mfg) };
        await store.setJSON(id, rec);
        return json({ request: rec });
      }

      return json({ error: 'Nothing to update' }, 400);
    }

    // DELETE /api/requests/:id — admin only.
    if (req.method === 'DELETE') {
      if (user.role !== 'admin') return forbidden();
      await store.delete(id);
      return json({ ok: true });
    }

    // GET one — role-scoped like the list.
    if (req.method === 'GET') {
      if (user.role === 'foreman' && rec.by !== user.name) return forbidden();
      return json({ request: rec });
    }
  }

  return json({ error: 'Not found' }, 404);
}

export const config = { path: ['/api/requests', '/api/requests/:id'] };
