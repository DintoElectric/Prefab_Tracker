import { useEffect, useState } from 'react';
import { api, type AccountRow } from '../lib/api';
import type { Role } from '../data/model';

const ROLE_LABEL: Record<Role, string> = { foreman: 'Foreman', prefab: 'Prefab dept.', admin: 'Admin' };

export function Users({ me, flash }: { me: string; flash: (m: string) => void }) {
  const [users, setUsers] = useState<AccountRow[]>([]);
  const [nu, setNu] = useState({ username: '', name: '', role: 'foreman' as Role, password: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { users } = await api.listUsers();
      setUsers(users);
    } catch (e: any) {
      flash(e.message || 'Could not load accounts');
    }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setBusy(true);
    try {
      await api.createUser(nu);
      setNu({ username: '', name: '', role: 'foreman', password: '' });
      flash('Account created');
      load();
    } catch (e: any) {
      flash(e.message || 'Could not create the account');
    } finally {
      setBusy(false);
    }
  };

  const resetPw = async (username: string) => {
    const pw = window.prompt(`New password for ${username} (at least 8 characters):`);
    if (!pw) return;
    try {
      await api.patchUser(username, { password: pw });
      flash(`Password reset for ${username}`);
    } catch (e: any) {
      flash(e.message || 'Reset failed');
    }
  };

  const toggleActive = async (u: AccountRow) => {
    try {
      await api.patchUser(u.username, { active: !u.active });
      flash(u.active ? `${u.username} deactivated` : `${u.username} reactivated`);
      load();
    } catch (e: any) {
      flash(e.message || 'Update failed');
    }
  };

  const setRole = async (u: AccountRow, role: Role) => {
    try {
      await api.patchUser(u.username, { role });
      flash(`${u.username} is now ${ROLE_LABEL[role]}`);
      load();
    } catch (e: any) {
      flash(e.message || 'Update failed');
      load();
    }
  };

  return (
    <div className="users-col">
      <div className="page-title-row">
        <h1 className="page-title">Accounts</h1>
        <span className="page-cap">Sign-ins, roles &amp; permissions</span>
      </div>

      <table className="users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th style={{ width: 140 }}>Username</th>
            <th style={{ width: 160 }}>Role</th>
            <th style={{ width: 110 }}>Status</th>
            <th style={{ width: 250 }} />
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.username} className={u.active ? '' : 'inactive'}>
              <td>{u.name}{u.username === me && ' (you)'}</td>
              <td className="mono">{u.username}</td>
              <td>
                <select className="input" style={{ height: 38, fontSize: 12.5 }} value={u.role}
                  disabled={u.username === me}
                  onChange={e => setRole(u, e.target.value as Role)}>
                  <option value="foreman">Foreman</option>
                  <option value="prefab">Prefab dept.</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td>{u.active ? 'Active' : 'Deactivated'}</td>
              <td>
                <div className="q-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => resetPw(u.username)}>Reset password</button>
                  {u.username !== me && (
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(u)}>
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="user-new">
        <h3>Add an account</h3>
        <div className="grid">
          <div>
            <label htmlFor="nu-name">Display name</label>
            <input id="nu-name" className="input" placeholder="R. Alvarez — Foreman"
              value={nu.name} onChange={e => setNu({ ...nu, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="nu-user">Username</label>
            <input id="nu-user" className="input" autoCapitalize="none" placeholder="ralvarez"
              value={nu.username} onChange={e => setNu({ ...nu, username: e.target.value })} />
          </div>
          <div>
            <label htmlFor="nu-role">Role</label>
            <select id="nu-role" className="input" value={nu.role}
              onChange={e => setNu({ ...nu, role: e.target.value as Role })}>
              <option value="foreman">Foreman</option>
              <option value="prefab">Prefab dept.</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label htmlFor="nu-pass">Temporary password</label>
            <input id="nu-pass" className="input" placeholder="At least 8 characters"
              value={nu.password} onChange={e => setNu({ ...nu, password: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </div>
  );
}
