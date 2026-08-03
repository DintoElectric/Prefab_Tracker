import { useEffect, useState } from 'react';
import {
  CATALOG, sysColor, inferCls, MFGS, CLASSES, type MaterialRow
} from '../data/model';
import { Thumb } from '../lib/ui';

export function Materials({ materials, onSave, flash }: {
  materials: Record<string, MaterialRow[]>;
  onSave: (assemblyId: string, rows: MaterialRow[]) => Promise<void>;
  flash: (msg: string) => void;
}) {
  const [sel, setSel] = useState('02');
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importText, setImportText] = useState('');

  useEffect(() => {
    setRows((materials[sel] || []).map(r => ({ ...r })));
    setDirty(false);
    setImportText('');
  }, [sel, materials]);

  const it = CATALOG.find(x => x.id === sel)!;

  const edit = (i: number, field: keyof MaterialRow, value: string) => {
    setRows(prev => prev.map((r, ri) => {
      if (ri !== i) return r;
      const next = { ...r, [field]: value } as MaterialRow;
      if (field === 'desc' && (!r.cls || r.cls === 'other')) next.cls = inferCls(value, next.cat);
      return next;
    }));
    setDirty(true);
  };
  const addRow = () => { setRows(prev => [...prev, { desc: '', mfg: '', cat: '', per: '', cls: 'other' }]); setDirty(true); };
  const removeRow = (i: number) => { setRows(prev => prev.filter((_, ri) => ri !== i)); setDirty(true); };

  // Accepted import shapes: 5 cols (explicit class) · 4 cols (class inferred)
  // · 3 cols where column 2 is "MFG; Cat#" (legacy).
  const doImport = async () => {
    const parsed = importText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const c = l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(x => x.trim().replace(/^"|"$/g, ''));
      const clsOf = (v: string, d: string, k: string) => {
        const given = (v || '').trim().toLowerCase();
        return (['box', 'wire', 'conduit', 'other'].includes(given) ? given : inferCls(d, k)) as MaterialRow['cls'];
      };
      if (c.length >= 5) return { desc: c[0] || '', mfg: (c[1] || '').toUpperCase(), cat: c[2] || '', per: c[3] || '', cls: clsOf(c[4], c[0], c[2]) };
      if (c.length === 4) return { desc: c[0] || '', mfg: (c[1] || '').toUpperCase(), cat: c[2] || '', per: c[3] || '', cls: inferCls(c[0], c[2]) };
      const j = (c[1] || '').indexOf(';');
      return j > 0
        ? { desc: c[0] || '', mfg: c[1].slice(0, j).trim().toUpperCase(), cat: c[1].slice(j + 1).trim(), per: c[2] || '', cls: inferCls(c[0], c[1]) }
        : { desc: c[0] || '', mfg: '', cat: c[1] || '', per: c[2] || '', cls: inferCls(c[0], c[1]) };
    });
    if (!parsed.length) { flash('Nothing to import'); return; }
    setSaving(true);
    try {
      await onSave(sel, parsed);
      setImportText('');
      flash(parsed.length + ' material lines imported');
    } catch (e: any) {
      flash(e.message || 'Import failed');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(sel, rows);
      setDirty(false);
      flash('Template saved');
    } catch (e: any) {
      flash(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mat-wrap">
      <aside className="mat-rail">
        <div className="mat-rail-hdr">
          <h3>Assemblies</h3>
          <div className="hint">Red count = no materials loaded</div>
        </div>
        <div className="mat-rail-list">
          {CATALOG.map(a => {
            const n = (materials[a.id] || []).length;
            return (
              <button key={a.id} className={'mat-row-btn' + (sel === a.id ? ' sel' : '')}
                style={{ borderLeft: `5px solid ${sysColor(a.system)}` }}
                onClick={() => setSel(a.id)}>
                <span>{a.title}</span>
                <span className={'cnt' + (n === 0 ? ' zero' : '')}>{n}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="mat-pane">
        <div className="mat-pane-inner">
          <div className="mat-head">
            <Thumb id={sel} title={it.title} size={92} />
            <div>
              <div className="tk-cap">Book pg. {sel} · Material template — per one assembly</div>
              <div className="t">{it.title}</div>
              <p className="mat-explain">
                Enter the count of each component consumed by <strong>one</strong> build. The class decides
                which foreman manufacturer preference applies to it. The shop ticket multiplies these against
                the requested quantity and consolidates them into a single pull list.
              </p>
            </div>
          </div>

          <div className="mat-tbl-scroll">
            <table className="mat-tbl">
              <thead>
                <tr>
                  <th style={{ minWidth: 280 }}>Component</th>
                  <th style={{ width: 160 }}>Class</th>
                  <th style={{ width: 190 }}>Manufacturer</th>
                  <th style={{ width: 140 }}>Cat#</th>
                  <th style={{ width: 96 }}>Per unit</th>
                  <th style={{ width: 52 }} className="noprint" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><input value={r.desc} aria-label="Component" onChange={e => edit(i, 'desc', e.target.value)} /></td>
                    <td>
                      <select value={r.cls} onChange={e => edit(i, 'cls', e.target.value)}>
                        {CLASSES.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={r.mfg} onChange={e => edit(i, 'mfg', e.target.value)}>
                        <option value="">— Select —</option>
                        {!MFGS.includes(r.mfg) && r.mfg && <option value={r.mfg}>{r.mfg}</option>}
                        {MFGS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td><input className="mono" value={r.cat} aria-label="Catalog number" onChange={e => edit(i, 'cat', e.target.value)} /></td>
                    <td><input inputMode="numeric" value={r.per} aria-label="Per unit" onChange={e => edit(i, 'per', e.target.value)} /></td>
                    <td className="noprint">
                      <button className="btn btn-ghost btn-remove" onClick={() => removeRow(i)} aria-label="Remove line">×</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '14px 12px', color: 'var(--color-neutral-600)' }}>
                    No components loaded for this assembly yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mat-actions">
            <button className="btn btn-secondary" style={{ height: 42, padding: '0 16px', fontSize: 12.5 }} onClick={addRow}>
              + Add component line
            </button>
            <button className="btn btn-primary" style={{ height: 42, minWidth: 160, fontSize: 13 }}
              onClick={save} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save template'}
            </button>
            {dirty && <span className="mat-dirty">Unsaved changes</span>}
          </div>

          <div className="mat-import">
            <h3>Import from Conest</h3>
            <p className="mat-explain">
              Paste the exported rows — one component per line, tab or comma separated:{' '}
              <strong>description, manufacturer, Cat#, per-unit count</strong> — plus an optional 5th column
              for class (box / wire / conduit / other). Class is inferred from the description when omitted.
              Importing replaces the template above.
            </p>
            <textarea className="input" rows={5} value={importText} onChange={e => setImportText(e.target.value)}
              placeholder={'4" Sq. box, 2-1/8" deep\tRACO\t232\t1\tbox'} />
            <button className="btn btn-primary" onClick={doImport} disabled={saving}>Import rows</button>
          </div>
        </div>
      </div>
    </div>
  );
}
