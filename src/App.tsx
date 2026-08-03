import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ROLE_VIEWS, STATUSES, itemOf, codeFor, inferCls, lineViolation,
  type PrefabRequest, type RequestLine, type MaterialRow, type SessionUser, type SpecProfile
} from './data/model';
import { api } from './lib/api';
import { Login } from './views/Login';
import { Catalog } from './views/Catalog';
import { ConfigDrawer } from './views/ConfigDrawer';
import { Review, type Hdr } from './views/Review';
import { Mine } from './views/Mine';
import { Queue } from './views/Queue';
import { Schedule } from './views/Schedule';
import { Ticket } from './views/Ticket';
import { Materials } from './views/Materials';
import { Users } from './views/Users';
import { Profiles } from './views/Profiles';

const CART_KEY = 'dinto-prefab-cart-v1';
const ROLE_TAG: Record<string, { cls: string; label: string }> = {
  admin: { cls: 'role-admin', label: 'Admin' },
  prefab: { cls: 'role-prefab', label: 'Prefab dept.' },
  foreman: { cls: 'role-foreman', label: 'Foreman' }
};
const TAB_LABEL: Record<string, string> = {
  catalog: 'Catalog', review: 'Request', mine: 'Mine', queue: 'Queue',
  schedule: 'Schedule', ticket: 'Ticket', materials: 'Materials', profiles: 'Profiles', users: 'Users'
};

interface CartDraft { hdr: Hdr; lines: RequestLine[]; }
const emptyHdr = (): Hdr => ({ job: '', needBy: '', priority: 'Standard', notes: '', profileId: null });

function loadCart(username: string): CartDraft {
  try {
    const all = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    const mine = all[username];
    if (mine && Array.isArray(mine.lines)) return { hdr: { ...emptyHdr(), ...mine.hdr }, lines: mine.lines };
  } catch { /* fresh */ }
  return { hdr: emptyHdr(), lines: [] };
}
function saveCart(username: string, draft: CartDraft) {
  try {
    const all = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    all[username] = draft;
    localStorage.setItem(CART_KEY, JSON.stringify(all));
  } catch { /* per-device draft only */ }
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [view, setView] = useState('catalog');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [cart, setCart] = useState<RequestLine[]>([]);
  const [hdr, setHdrState] = useState<Hdr>(emptyHdr());
  const [requests, setRequests] = useState<PrefabRequest[]>([]);
  const [materials, setMaterials] = useState<Record<string, MaterialRow[]>>({});
  const [profiles, setProfiles] = useState<SpecProfile[]>([]);
  const [cfgId, setCfgId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ img: string; title: string } | null>(null);
  const [toast, setToast] = useState('');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);

  // ── bootstrap: session, then data ──
  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.me();
        setUser(user);
      } catch { /* not signed in */ }
      setBooted(true);
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [{ requests }, { materials }, { profiles }] = await Promise.all([
        api.listRequests(), api.getMaterials(), api.listProfiles()
      ]);
      setRequests(requests);
      setMaterials(materials);
      setProfiles(profiles);
    } catch (e: any) {
      if (e.status === 401) setUser(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const draft = loadCart(user.username);
    setCart(draft.lines);
    setHdrState(draft.hdr);
    setView(ROLE_VIEWS[user.role][0]);
    refresh();
  }, [user?.username]);

  // Keep queue/schedule/mine fresh while someone leaves the tab open.
  useEffect(() => {
    if (!user) return;
    const t = window.setInterval(() => {
      if (['queue', 'schedule', 'mine'].includes(view)) refresh();
    }, 30000);
    return () => window.clearInterval(t);
  }, [user, view, refresh]);

  const persistCart = (lines: RequestLine[], h: Hdr) => {
    if (user) saveCart(user.username, { hdr: h, lines });
  };
  const setCartAnd = (lines: RequestLine[]) => { setCart(lines); persistCart(lines, hdr); };
  const setHdr = (h: Hdr) => { setHdrState(h); persistCart(cart, h); };

  // ── view gating: role must allow it AND its subject must resolve ──
  const allowed = user ? ROLE_VIEWS[user.role] : [];
  const effectiveView = useMemo(() => {
    if (!user) return 'catalog';
    let v = allowed.includes(view) ? view : allowed[0];
    if (v === 'ticket' && !requests.some(r => r.id === ticketId)) {
      v = allowed.includes('queue') ? 'queue' : allowed[0];
    }
    return v;
  }, [user, view, allowed, requests, ticketId]);

  // ── cart mutations ──
  const addToCart = (assemblyId: string, opts: Record<string, string | string[]>, qty: number, mfgPref: Record<string, string>) => {
    const code = codeFor(assemblyId, opts);
    const same = (a: unknown, b: unknown) => JSON.stringify(a || {}) === JSON.stringify(b || {});
    const next = cart.slice();
    const hit = next.findIndex(l => l.assemblyId === assemblyId && l.code === code && same(l.mfgPref, mfgPref) && same(l.opts, opts));
    if (hit >= 0) next[hit] = { ...next[hit], qty: next[hit].qty + qty };
    else next.push({ assemblyId, opts, code, qty, mfgPref: Object.keys(mfgPref).length ? mfgPref : undefined });
    setCartAnd(next);
    setCfgId(null);
    flash(`${qty} × added to the request`);
  };
  const removeLine = (i: number) => { const c = cart.slice(); c.splice(i, 1); setCartAnd(c); };
  const setLineQty = (i: number, qty: number) => {
    const c = cart.slice(); c[i] = { ...c[i], qty }; setCartAnd(c);
  };

  const submit = async () => {
    if (!cart.length) { flash('Add at least one assembly first'); return; }
    if (!hdr.job.trim()) { flash('Job name is required'); return; }
    const profile = profiles.find(p => p.id === hdr.profileId) || null;
    if (profile) {
      // Catch lines configured before the profile was chosen (or under a
      // different one). The server re-checks this regardless.
      const bad = cart.map(l => lineViolation(profile, l.assemblyId, l.opts, l.mfgPref)).find(Boolean);
      if (bad) { flash(bad); return; }
    }
    setSubmitting(true);
    try {
      const { request } = await api.createRequest({
        job: hdr.job, needBy: hdr.needBy, priority: hdr.priority, notes: hdr.notes,
        profileId: profile ? profile.id : null,
        lines: cart.map(l => ({ assemblyId: l.assemblyId, opts: l.opts, code: l.code, qty: l.qty, mfgPref: l.mfgPref as Record<string, string> | undefined }))
      });
      const clearedHdr = { ...hdr, job: '', notes: '' };
      setCart([]); setHdrState(clearedHdr); persistCart([], clearedHdr);
      setRequests(prev => [request, ...prev]);
      setView('mine');
      flash(`${request.id} submitted to prefab`);
    } catch (e: any) {
      flash(e.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── prefab / admin mutations ──
  const advance = async (id: string) => {
    const r = requests.find(x => x.id === id);
    if (!r) return;
    const next = STATUSES[Math.min(STATUSES.indexOf(r.status) + 1, STATUSES.length - 1)];
    try {
      const { request } = await api.patchRequest(id, { status: next });
      setRequests(prev => prev.map(x => x.id === id ? request : x));
    } catch (e: any) { flash(e.message || 'Update failed'); }
  };
  const schedule = async (id: string, week: string | null) => {
    try {
      const { request } = await api.patchRequest(id, { week });
      setRequests(prev => prev.map(x => x.id === id ? request : x));
    } catch (e: any) { flash(e.message || 'Update failed'); }
  };
  const removeRequest = async (id: string) => {
    try {
      await api.deleteRequest(id);
      setRequests(prev => prev.filter(x => x.id !== id));
      if (ticketId === id) { setTicketId(null); setView('queue'); }
      flash(`${id} deleted`);
    } catch (e: any) { flash(e.message || 'Delete failed'); }
  };
  const setLineMfg = async (reqId: string, lineIdx: number, rowIdx: number, mfg: string) => {
    try {
      const { request } = await api.patchRequest(reqId, { lineIdx, rowIdx, mfg });
      setRequests(prev => prev.map(x => x.id === reqId ? request : x));
    } catch (e: any) { flash(e.message || 'Update failed'); }
  };
  const saveMaterials = async (assemblyId: string, rows: MaterialRow[]) => {
    const { rows: clean } = await api.putMaterials(assemblyId, rows);
    setMaterials(prev => ({ ...prev, [assemblyId]: clean }));
  };

  // Per-unit template resolver used by tickets — normalizes legacy rows.
  const tplFor = useCallback((assemblyId: string): MaterialRow[] => {
    return (materials[assemblyId] || []).map(r =>
      r.cls ? r : { ...r, cls: inferCls(r.desc, r.cat) }
    );
  }, [materials]);

  const openTicket = (id: string) => {
    if (!allowed.includes('ticket')) return;
    setTicketId(id);
    setView('ticket');
  };

  const signOut = async () => {
    try { await api.logout(); } catch { /* cookie is cleared regardless */ }
    setUser(null);
    setMenuOpen(false);
    setRequests([]); setMaterials({});
  };

  // ── render ──
  if (!booted) return null;
  if (!user) {
    return (
      <div className="app noanim">
        <div className="canvas"><Login onSignedIn={setUser} /></div>
      </div>
    );
  }

  const roleTag = ROLE_TAG[user.role];
  const ticketReq = requests.find(r => r.id === ticketId) || null;
  const openQueue = requests.filter(r => r.status !== 'Closed').length;
  const badge = (id: string) =>
    id === 'review' && cart.length ? String(cart.length)
      : id === 'queue' && openQueue ? String(openQueue)
        : '';

  return (
    <div className="app noanim">
      <header className="hdr noprint">
        <div className="hdr-row1">
          <div className="brand-block">
            <div className="brand-inner">
              <img src="assets/dinto-mark.png" alt="Dinto Electrical Contractors" />
              <span className="brand-sub">Prefabrication Book</span>
            </div>
          </div>
          <div className="hdr-spacer" />
          <div className="hdr-user">
            <span className={`tagchip ${roleTag.cls}`}>{roleTag.label}</span>
            <div className="acct">
              <button className="acct-btn" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}>
                <span>{user.name}</span>
                <span aria-hidden="true">▾</span>
              </button>
              {menuOpen && (
                <div className="acct-menu" onMouseLeave={() => setMenuOpen(false)}>
                  <div className="acct-who">Signed in as <strong>{user.username}</strong></div>
                  <button onClick={() => { setPwOpen(true); setMenuOpen(false); }}>Change password</button>
                  <button onClick={signOut}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="tabs">
          {allowed.map(id => (
            <button key={id} className={'tab' + (effectiveView === id ? ' active' : '')}
              onClick={() => setView(id)}>
              <span className="lbl">{TAB_LABEL[id]}</span>
              {badge(id) && <span className="badge">{badge(id)}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="canvas">
        {effectiveView === 'catalog' && (
          <Catalog query={query} setQuery={setQuery} cat={cat} setCat={setCat} cart={cart}
            profiles={profiles} profileId={hdr.profileId || null}
            setProfileId={(id) => setHdr({ ...hdr, profileId: id })}
            onConfigure={setCfgId}
            onZoom={(id, title) => setZoom({ img: `assets/asm-${id}.png`, title })}
            onRemoveLine={removeLine}
            onReview={() => setView('review')} />
        )}
        {effectiveView === 'review' && (
          <Review cart={cart} hdr={hdr} setHdr={setHdr} byName={user.name} profiles={profiles}
            onQty={setLineQty} onRemove={removeLine}
            onSubmit={submit} onBrowse={() => setView('catalog')} submitting={submitting} />
        )}
        {effectiveView === 'mine' && <Mine requests={requests} isAdmin={user.role === 'admin'} />}
        {effectiveView === 'queue' && (
          <Queue requests={requests} isAdmin={user.role === 'admin'}
            onAdvance={advance} onDelete={removeRequest} onTicket={openTicket} />
        )}
        {effectiveView === 'schedule' && (
          <Schedule requests={requests} onSchedule={schedule} onAdvance={advance} onTicket={openTicket} />
        )}
        {effectiveView === 'ticket' && ticketReq && (
          <Ticket req={ticketReq} tplFor={tplFor}
            onBack={() => setView('queue')}
            onSetMfg={(li, ri, mfg) => setLineMfg(ticketReq.id, li, ri, mfg)} />
        )}
        {effectiveView === 'materials' && (
          <Materials materials={materials} onSave={saveMaterials} flash={flash} />
        )}
        {effectiveView === 'profiles' && (
          <Profiles profiles={profiles} onChanged={refresh} flash={flash} />
        )}
        {effectiveView === 'users' && <Users me={user.username} flash={flash} />}
      </main>

      {cfgId && (
        <ConfigDrawer assemblyId={cfgId}
          profile={profiles.find(p => p.id === hdr.profileId && p.active) || null}
          onAdd={(opts, qty, pref) => addToCart(cfgId, opts, qty, pref)}
          onClose={() => setCfgId(null)} />
      )}

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <div className="lightbox-panel">
            <div className="lightbox-img" style={{ backgroundImage: `url(${zoom.img})` }} role="img" aria-label={zoom.title} />
            <div className="lightbox-cap">{zoom.title}</div>
          </div>
        </div>
      )}

      {pwOpen && <PasswordDialog onClose={() => setPwOpen(false)} flash={flash} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function PasswordDialog({ onClose, flash }: { onClose: () => void; flash: (m: string) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await api.changePassword(current, next);
      flash('Password changed');
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Change failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pw-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pw-dialog" role="dialog" aria-modal="true" aria-label="Change password">
        <h3>Change password</h3>
        <div className="field">
          <label htmlFor="pw-cur">Current password</label>
          <input id="pw-cur" className="input" type="password" value={current} onChange={e => setCurrent(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw-new">New password (at least 8 characters)</label>
          <input id="pw-new" className="input" type="password" value={next} onChange={e => setNext(e.target.value)} />
        </div>
        {err && <div className="login-err" style={{ marginBottom: 10 }}>{err}</div>}
        <div className="pw-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
