import {
  usersStore, currentUser, ensureSeed, hashPassword, json, unauthorized, forbidden,
  type UserRecord, type Role
} from '../lib/store.mts';

const ROLES: Role[] = ['foreman', 'prefab', 'admin'];
const pub = (u: UserRecord) => ({
  username: u.username, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt
});

export default async function handler(req: Request, context: any) {
  const user = await currentUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();
  await ensureSeed();
  const store = usersStore();
  const username = (context?.params?.username as string | undefined)?.toLowerCase();

  // GET /api/users — list accounts (never returns hashes).
  if (req.method === 'GET' && !username) {
    const { blobs } = await store.list();
    const out: ReturnType<typeof pub>[] = [];
    for (const b of blobs) {
      const rec = (await store.get(b.key, { type: 'json' })) as UserRecord | null;
      if (rec) out.push(pub(rec));
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return json({ users: out });
  }

  // POST /api/users — create an account.
  if (req.method === 'POST' && !username) {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    const uname = String(body.username || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const role = body.role as Role;
    const password = String(body.password || '');
    if (!/^[a-z0-9._-]{3,32}$/.test(uname)) return json({ error: 'Username: 3–32 characters, letters/numbers/._-' }, 400);
    if (!name) return json({ error: 'Display name is required' }, 400);
    if (!ROLES.includes(role)) return json({ error: 'Role must be foreman, prefab, or admin' }, 400);
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
    if (await store.get(uname)) return json({ error: 'That username is taken' }, 409);
    const { salt, hash } = hashPassword(password);
    const rec: UserRecord = { username: uname, name, role, salt, hash, active: true, createdAt: new Date().toISOString() };
    await store.setJSON(uname, rec);
    return json({ user: pub(rec) }, 201);
  }

  if (username) {
    const rec = (await store.get(username, { type: 'json' })) as UserRecord | null;
    if (!rec) return json({ error: 'User not found' }, 404);

    // PATCH /api/users/:username — reset password, change role/name, activate/deactivate.
    if (req.method === 'PATCH') {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
      if ('password' in body) {
        if (String(body.password).length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
        const { salt, hash } = hashPassword(String(body.password));
        rec.salt = salt; rec.hash = hash;
      }
      if ('name' in body && String(body.name).trim()) rec.name = String(body.name).trim();
      if ('role' in body) {
        if (!ROLES.includes(body.role)) return json({ error: 'Unknown role' }, 400);
        if (rec.username === user.username && body.role !== 'admin') {
          return json({ error: 'You cannot remove your own admin role' }, 400);
        }
        rec.role = body.role;
      }
      if ('active' in body) {
        if (rec.username === user.username && body.active === false) {
          return json({ error: 'You cannot deactivate your own account' }, 400);
        }
        rec.active = Boolean(body.active);
      }
      await store.setJSON(username, rec);
      return json({ user: pub(rec) });
    }
  }

  return json({ error: 'Not found' }, 404);
}

export const config = { path: ['/api/users', '/api/users/:username'] };
