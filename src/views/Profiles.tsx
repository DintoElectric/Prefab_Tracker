import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getProfileFields, type SpecProfile, type SpecProfileLimits, type LimitKey } from '../data/model';
// getProfileFields() is called at render time, never at module load.

// Admin editor for job spec profiles. Each profile is a set of allow-lists
// that narrow the catalog dropdowns per field. Leaving every box in a field
// unchecked means that field is unrestricted.
export function Profiles({ profiles, onChanged, flash }: {
  profiles: SpecProfile[];
  onChanged: () => void;
  flash: (m: string) => void;
}) {
  const [editing, setEditing] = useState<SpecProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const toggleActive = async (p: SpecProfile) => {
    try {
      await api.putProfile(p.id, { active: !p.active });
      flash(p.active ? `${p.name} deactivated` : `${p.name} activated`);
      onChanged();
    } catch (e: any) { flash(e.message || 'Update failed'); }
  };

  const remove = async (p: SpecProfile) => {
    try {
      await api.deleteProfile(p.id);
      flash(`${p.name} deleted — submitted requests keep their spec record`);
      setConfirmDel(null);
      onChanged();
    } catch (e: any) { flash(e.message || 'Delete failed'); }
  };

  const limitSummary = (p: SpecProfile) => {
    const bits = getProfileFields()
      .filter(f => (p.limits?.[f.limitKey] || []).length)
      .map(f => `${f.label}: ${(p.limits[f.limitKey] as string[]).join(', ')}`);
    return bits.length ? bits.join(' · ') : 'No restrictions — full catalog';
  };

  return (
    <div className="users-col">
      <div className="page-title-row">
        <h1 className="page-title">Job spec profiles</h1>
        <span className="page-cap">Per-job allow-lists that narrow the catalog</span>
      </div>

      {profiles.length === 0 ? (
        <div className="empty-card">
          <div className="t">No profiles yet</div>
          <div className="s">Create one below. Foremen pick a profile on each request.</div>
        </div>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th style={{ width: 220 }}>Profile</th>
              <th>Restrictions</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: 250 }} />
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id} className={p.active ? '' : 'inactive'}>
                <td>
                  <div className="rt-title">{p.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>{p.id}</div>
                </td>
                <td style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  {limitSummary(p)}
                  {p.notes && <div className="rt-pref" style={{ marginTop: 6 }}>{p.notes}</div>}
                </td>
                <td>{p.active ? 'Active' : 'Inactive'}</td>
                <td>
                  <div className="q-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(p); setCreating(false); }}>Edit</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(p)}>
                      {p.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className={'btn btn-secondary btn-sm btn-del' + (confirmDel === p.id ? ' confirm' : '')}
                      onClick={() => { if (confirmDel === p.id) remove(p); else setConfirmDel(p.id); }}
                      onBlur={() => { if (confirmDel === p.id) setConfirmDel(null); }}>
                      {confirmDel === p.id ? 'Confirm' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!editing && !creating && (
        <div style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={() => { setCreating(true); setEditing(null); }}>New profile</button>
        </div>
      )}

      {(editing || creating) && (
        <ProfileEditor
          key={editing ? editing.id : '__new__'}
          profile={editing}
          onDone={(changed) => {
            setEditing(null); setCreating(false);
            if (changed) onChanged();
          }}
          flash={flash}
        />
      )}
    </div>
  );
}

function ProfileEditor({ profile, onDone, flash }: {
  profile: SpecProfile | null; // null = creating
  onDone: (changed: boolean) => void;
  flash: (m: string) => void;
}) {
  const [name, setName] = useState(profile?.name || '');
  const [notes, setNotes] = useState(profile?.notes || '');
  const [limits, setLimits] = useState<SpecProfileLimits>(() => {
    const l: SpecProfileLimits = {};
    getProfileFields().forEach(f => { l[f.limitKey] = [...(profile?.limits?.[f.limitKey] || [])]; });
    return l;
  });
  const [busy, setBusy] = useState(false);

  // Guard against a profile prop swap without remount (belt & braces — the
  // parent also keys this component by profile id).
  useEffect(() => {
    setName(profile?.name || '');
    setNotes(profile?.notes || '');
  }, [profile?.id]);

  const toggle = (key: LimitKey, v: string) => {
    setLimits(prev => {
      const cur = prev[key] || [];
      return { ...prev, [key]: cur.includes(v) ? cur.filter(x => x !== v) : cur.concat([v]) };
    });
  };

  const save = async () => {
    if (!name.trim()) { flash('Profile name is required'); return; }
    // Absent key = unrestricted; strip empty lists before sending.
    const clean: SpecProfileLimits = {};
    getProfileFields().forEach(f => { const l = limits[f.limitKey]; if (l && l.length) clean[f.limitKey] = l; });
    setBusy(true);
    try {
      if (profile) await api.putProfile(profile.id, { name, notes, limits: clean });
      else await api.createProfile({ name, notes, limits: clean });
      flash(profile ? 'Profile saved' : 'Profile created');
      onDone(true);
    } catch (e: any) {
      flash(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="user-new">
      <h3>{profile ? `Edit — ${profile.name}` : 'New profile'}</h3>
      <div className="grid" style={{ marginBottom: 14 }}>
        <div>
          <label htmlFor="pf-name">Profile name</label>
          <input id="pf-name" className="input" placeholder="Yale University Spec"
            value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ gridColumn: '2 / -1' }}>
          <label htmlFor="pf-notes">Spec notes (shown to admins and on this tab)</label>
          <input id="pf-notes" className="input" placeholder="Section references, prohibited items, PM contacts…"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="prefs" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div>
          <div className="h">Allowed choices per field</div>
          <div className="note">
            Check the options the spec permits. A field with nothing checked stays fully open.
            If exactly one option is checked, that field locks for foremen.
          </div>
        </div>
        {getProfileFields().map(f => {
          const cur = limits[f.limitKey] || [];
          return (
            <div key={f.limitKey} className="fieldblock">
              <div className="lblrow">
                <span className="lbl">{f.label}</span>
                <span className="spec-count">{cur.length ? `${cur.length} allowed` : 'Unrestricted'}</span>
              </div>
              <div className="checkgrid">
                {f.options.map(o => {
                  const on = cur.includes(o.v);
                  return (
                    <button key={o.v} type="button" className={'checkopt' + (on ? ' on' : '')}
                      aria-pressed={on} onClick={() => toggle(f.limitKey, o.v)}>
                      <span className="box">{on ? '✓' : ''}</span>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="q-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : (profile ? 'Save profile' : 'Create profile')}
        </button>
        <button className="btn btn-secondary" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </div>
  );
}
