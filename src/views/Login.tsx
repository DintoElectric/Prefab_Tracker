import { useState } from 'react';
import { api } from '../lib/api';
import type { SessionUser } from '../data/model';

export function Login({ onSignedIn }: { onSignedIn: (u: SessionUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      const { user } = await api.login(username, password);
      onSignedIn(user);
    } catch (e: any) {
      setErr(e.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <img className="login-logo" src="assets/dinto-mark.png" alt="Dinto Electrical Contractors" />
      <div className="brand-big">Prefabrication Book</div>
      <p className="login-lede">
        Browse the assembly catalog, configure builds with the book's ordering codes, and submit
        requests straight to the prefab department. Sign in with the account the office set up for you.
      </p>
      <div className="login-card">
        <h3>Sign in</h3>
        <p>Your view is set by your role — foreman, prefab department, or admin.</p>
        <div className="field">
          <label htmlFor="li-user">Username</label>
          <input id="li-user" className="input" autoComplete="username" autoCapitalize="none"
            value={username} onChange={e => setUsername(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        </div>
        <div className="field">
          <label htmlFor="li-pass">Password</label>
          <input id="li-pass" className="input" type="password" autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {err && <div className="login-err">{err}</div>}
      </div>
    </div>
  );
}
