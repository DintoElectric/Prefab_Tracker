import {
  usersStore, ensureSeed, verifyPassword, hashPassword, makeToken,
  sessionCookie, clearCookie, currentUser, publicUser, json, unauthorized,
  type UserRecord
} from '../lib/store.mts';

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /api/me — who am I
  if (path === '/api/me' && req.method === 'GET') {
    const user = await currentUser(req);
    if (!user) return unauthorized();
    return json({ user: publicUser(user) });
  }

  // POST /api/auth — sign in
  if (path === '/api/auth' && req.method === 'POST') {
    await ensureSeed();
    let body: { username?: string; password?: string };
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password || '';
    if (!username || !password) return json({ error: 'Username and password are required' }, 400);

    const rec = (await usersStore().get(username, { type: 'json' })) as UserRecord | null;
    if (!rec || !rec.active || !verifyPassword(password, rec.salt, rec.hash)) {
      return json({ error: 'Username or password is incorrect' }, 401);
    }
    const token = await makeToken(rec.username);
    return json({ user: publicUser(rec) }, 200, { 'set-cookie': sessionCookie(token) });
  }

  // DELETE /api/auth — sign out
  if (path === '/api/auth' && req.method === 'DELETE') {
    return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
  }

  // POST /api/auth/password — change own password
  if (path === '/api/auth/password' && req.method === 'POST') {
    const user = await currentUser(req);
    if (!user) return unauthorized();
    let body: { current?: string; next?: string };
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    if (!body.current || !verifyPassword(body.current, user.salt, user.hash)) {
      return json({ error: 'Current password is incorrect' }, 400);
    }
    if (!body.next || body.next.length < 8) {
      return json({ error: 'New password must be at least 8 characters' }, 400);
    }
    const { salt, hash } = hashPassword(body.next);
    await usersStore().setJSON(user.username, { ...user, salt, hash });
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}

export const config = { path: ['/api/auth', '/api/auth/password', '/api/me'] };
