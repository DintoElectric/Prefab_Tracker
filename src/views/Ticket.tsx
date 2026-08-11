import {
  itemOf, sysColor, optSummary, fmtDate, weekLabel, pieces, resolveMfg, pullList, rowPer,
  MFGS, CLASS_LABEL, type PrefabRequest, type MaterialRow
} from '../data/model';
import { Thumb, CodeStrip } from '../lib/ui';

export function Ticket({ req, tplFor, onBack, onSetMfg }: {
  req: PrefabRequest;
  tplFor: (assemblyId: string) => MaterialRow[];
  onBack: () => void;
  onSetMfg: (lineIdx: number, rowIdx: number, mfg: string) => void;
}) {
  const pull = pullList(req, tplFor);

  return (
    <div className="ticket-col">
      <div className="ticket-toolbar noprint">
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back to queue</button>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Print</button>
      </div>

      <div className="ticket-doc">
        <div className="tk-brand">
          <div className="logo"><img src="assets/dinto-mark.png" alt="Dinto Electrical Contractors" /></div>
          <div className="cell">
            <div className="tk-cap">Request</div>
            <div className="tk-val mono" style={{ fontSize: 15 }}>{req.id}</div>
          </div>
          <div className="cell">
            <div className="tk-cap">Build week</div>
            <div className="tk-val">{req.week ? weekLabel(req.week) : 'Unscheduled'}</div>
          </div>
        </div>

        <div className="tk-meta">
          <div><div className="tk-cap">Job name</div><div className="tk-val">{req.job}</div></div>
          <div><div className="tk-cap">Requested by</div><div className="tk-val">{req.by}</div></div>
          <div><div className="tk-cap">Date needed</div><div className="tk-val">{fmtDate(req.needBy)}</div></div>
          <div><div className="tk-cap">Priority</div><div className="tk-val">{req.priority}</div></div>
          <div><div className="tk-cap">Spec basis</div><div className="tk-val">{req.profileName || 'Shop standard'}</div></div>
        </div>

        {req.notes && (
          <div className="tk-notes">
            <div className="tk-cap">Notes from the field</div>
            <div className="tk-val">{req.notes}</div>
          </div>
        )}

        {req.lines.map((l, li) => {
          const it = itemOf(l.assemblyId);
          if (!it) return null;
          const tpl = tplFor(l.assemblyId);
          const prefBits = (Object.keys(CLASS_LABEL) as ('box' | 'wire' | 'conduit')[])
            .filter(k => (l.mfgPref || {})[k])
            .map(k => `${CLASS_LABEL[k]}: ${l.mfgPref![k]}`);
          return (
            <div key={li} className="tk-line" style={{ borderLeft: `6px solid ${sysColor(it.system)}` }}>
              <div className="tk-line-head">
                <span className="tk-qty">{l.qty}</span>
                <Thumb id={l.assemblyId} title={it.title} size={76} />
                <div className="tk-line-info">
                  <div className="tk-line-title">{it.title}</div>
                  <CodeStrip id={l.assemblyId} opts={l.opts} size="ticket" />
                  <div className="tk-sum">{optSummary(l.assemblyId, l.opts)}</div>
                  {prefBits.length > 0 && (
                    <div className="tk-pref">Foreman manufacturer request — {prefBits.join(' · ')}</div>
                  )}
                </div>
              </div>

              {tpl.length === 0 ? (
                <div className="tk-nomat">Materials not loaded — pending Conest import (Admin › Materials).</div>
              ) : (
                <div className="tk-mat-wrap">
                  <div className="tk-mat-cap">Materials — {l.qty} × per-unit template</div>
                  <div className="tk-mat-scroll">
                    <table className="tk-mat">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 230 }}>Component</th>
                          <th style={{ width: 190 }}>Manufacturer</th>
                          <th style={{ width: 130 }}>Cat#</th>
                          <th style={{ width: 64 }}>Per</th>
                          <th style={{ width: 80 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tpl.map((row, ri) => {
                          const res = resolveMfg(l, row, ri);
                          const per = rowPer(row, l.opts);
                          return (
                            <tr key={ri}>
                              <td>{row.desc}</td>
                              <td>
                                <select value={res.mfg} onChange={e => onSetMfg(li, ri, e.target.value)}>
                                  {!MFGS.includes(res.mfg) && <option value={res.mfg}>{res.mfg || '—'}</option>}
                                  {MFGS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                {res.src === 'foreman' && <span className="mfg-flag foreman">Foreman request</span>}
                                {res.src === 'shop' && <span className="mfg-flag shop">Substituted</span>}
                              </td>
                              <td className="mono">{row.cat}</td>
                              <td>{row.perField ? `${per} (per cart)` : row.per}</td>
                              <td>{per * l.qty}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {pull.length > 0 && (
          <div className="tk-pull">
            <h3>Consolidated pull list</h3>
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th style={{ width: 180 }}>Manufacturer</th>
                  <th style={{ width: 150 }}>Cat#</th>
                  <th style={{ width: 100 }}>Pull qty</th>
                </tr>
              </thead>
              <tbody>
                {pull.map(p => (
                  <tr key={p.key}>
                    <td>{p.desc}</td>
                    <td>{p.mfg}</td>
                    <td className="mono">{p.cat}</td>
                    <td className="pq">{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="tk-sign">
          <div>
            <div className="tk-cap">Total pieces</div>
            <div className="tk-total">{pieces(req)}</div>
          </div>
          <div className="tk-blank by">
            <span className="line" />
            <span className="tk-cap">Built by</span>
          </div>
          <div className="tk-blank date">
            <span className="line" />
            <span className="tk-cap">Date complete</span>
          </div>
        </div>
      </div>
    </div>
  );
}
