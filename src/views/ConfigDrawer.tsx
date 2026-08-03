import { useEffect, useRef, useState } from 'react';
import {
  itemOf, schemaOf, codeSegs, PREF_CLASSES, MFG_BY_CLASS, CLASS_LABEL, type RequestLine
} from '../data/model';
import { CodeStrip, Thumb } from '../lib/ui';

export interface DrawerResult {
  line: Omit<RequestLine, 'code'>;
  qty: number;
}

export function ConfigDrawer({ assemblyId, onAdd, onClose }: {
  assemblyId: string;
  onAdd: (opts: Record<string, string | string[]>, qty: number, mfgPref: Record<string, string>) => void;
  onClose: () => void;
}) {
  const it = itemOf(assemblyId)!;
  const schema = schemaOf(assemblyId);
  const [opts, setOpts] = useState<Record<string, string | string[]>>(() => {
    const o: Record<string, string | string[]> = {};
    schema.forEach(f => { o[f.key] = Array.isArray(f.def) ? [...f.def] : f.def; });
    return o;
  });
  const [qty, setQty] = useState('1');
  const [mfgPref, setMfgPref] = useState<Record<string, string>>({});
  const firstFocus = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const prefClasses = PREF_CLASSES[it.kind] || [];
  const hasCode = codeSegs(assemblyId, opts).length > 0;

  // Functional updates — reading a captured snapshot loses selections when a
  // foreman taps down the list quickly (a real bug in the prototype).
  const toggleCheck = (key: string, v: string) => {
    setOpts(prev => {
      const cur = Array.isArray(prev[key]) ? (prev[key] as string[]) : [];
      const next = cur.includes(v) ? cur.filter(x => x !== v) : cur.concat([v]);
      return { ...prev, [key]: next };
    });
  };

  const add = () => {
    const n = Math.max(1, Number(qty) || 1);
    const pref: Record<string, string> = {};
    Object.entries(mfgPref).forEach(([k, v]) => { if (v) pref[k] = v; });
    onAdd(opts, n, pref);
  };

  return (
    <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={`Configure ${it.title}`}>
        <div className="drawer-hdr">
          <Thumb id={assemblyId} title={it.title} size={76} />
          <div style={{ minWidth: 0 }}>
            <div className="cap">Ordering information — complete the following</div>
            <div className="t">{it.title}</div>
          </div>
          <button ref={firstFocus} className="btn btn-ghost x" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="drawer-body">
          {schema.map(f => (
            <div key={f.key + f.label} className="fieldblock">
              <div className="lblrow">
                <span className={'marker ' + (f.code ? 'coded' : 'circ')}>{f.num}</span>
                <span className="lbl">{f.label}</span>
              </div>
              {f.type === 'checks' ? (
                <div className="checkgrid">
                  {f.options.map(o => {
                    const cur = Array.isArray(opts[f.key]) ? (opts[f.key] as string[]) : [];
                    const on = cur.includes(o.v);
                    return (
                      <button key={o.v} type="button" className={'checkopt' + (on ? ' on' : '')}
                        aria-pressed={on} onClick={() => toggleCheck(f.key, o.v)}>
                        <span className="box">{on ? '✓' : ''}</span>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <select className="input" value={String(opts[f.key] ?? '')}
                  onChange={e => setOpts(prev => ({ ...prev, [f.key]: e.target.value }))}>
                  {f.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              )}
            </div>
          ))}

          {prefClasses.length > 0 && (
            <div className="prefs">
              <div>
                <div className="h">Manufacturer preference</div>
                <div className="note">Optional. Leave on shop standard unless the job specifies a manufacturer.</div>
              </div>
              {prefClasses.map(cls => (
                <div key={cls} className="fieldblock">
                  <div className="lblrow"><span className="lbl">{CLASS_LABEL[cls]}</span></div>
                  <select className="input" value={mfgPref[cls] || ''}
                    onChange={e => setMfgPref(prev => ({ ...prev, [cls]: e.target.value }))}>
                    <option value="">No preference — shop standard</option>
                    {MFG_BY_CLASS[cls].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="drawer-foot">
          {hasCode && (
            <div className="codeline">
              <span className="cap">Build code</span>
              <CodeStrip id={assemblyId} opts={opts} size="drawer" />
            </div>
          )}
          <div className="qtyrow">
            <div className="stepper">
              <button type="button" aria-label="Decrease quantity"
                onClick={() => setQty(q => String(Math.max(1, (Number(q) || 1) - 1)))}>−</button>
              <input inputMode="numeric" value={qty} aria-label="Quantity"
                onChange={e => setQty(e.target.value.replace(/[^0-9]/g, ''))} />
              <button type="button" aria-label="Increase quantity"
                onClick={() => setQty(q => String((Number(q) || 0) + 1))}>+</button>
            </div>
            <button className="btn btn-primary" onClick={add}>Add to request</button>
          </div>
        </div>
      </div>
    </div>
  );
}
