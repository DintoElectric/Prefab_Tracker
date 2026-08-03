import { itemOf, optSummary, prefSummary, type RequestLine } from '../data/model';
import { CodeStrip, Thumb } from '../lib/ui';

export interface Hdr { job: string; needBy: string; priority: 'Standard' | 'Hot'; notes: string; }

export function Review({ cart, hdr, setHdr, byName, onQty, onRemove, onSubmit, onBrowse, submitting }: {
  cart: RequestLine[];
  hdr: Hdr;
  setHdr: (h: Hdr) => void;
  byName: string;
  onQty: (i: number, qty: number) => void;
  onRemove: (i: number) => void;
  onSubmit: () => void;
  onBrowse: () => void;
  submitting: boolean;
}) {
  const total = cart.reduce((a, l) => a + l.qty, 0);
  return (
    <div className="page-col">
      <div className="page-title-row">
        <h1 className="page-title">Prefab request</h1>
        <span className="page-cap">Complete the following</span>
      </div>

      <div className="hdr-grid">
        <div className="hdr-cell">
          <label htmlFor="rv-job">Job name</label>
          <input id="rv-job" className="input" placeholder="e.g. Mercy Tower — Level 4"
            value={hdr.job} onChange={e => setHdr({ ...hdr, job: e.target.value })} />
        </div>
        <div className="hdr-cell">
          <label>Requested by</label>
          <input className="input" value={byName} readOnly aria-readonly="true" />
        </div>
        <div className="hdr-cell">
          <label htmlFor="rv-need">Date needed</label>
          <input id="rv-need" className="input" type="date"
            value={hdr.needBy} onChange={e => setHdr({ ...hdr, needBy: e.target.value })} />
        </div>
        <div className="hdr-cell">
          <label>Priority</label>
          <div className="prio-seg">
            <button type="button" className={hdr.priority === 'Standard' ? 'sel-std' : ''}
              onClick={() => setHdr({ ...hdr, priority: 'Standard' })}>Standard</button>
            <button type="button" className={hdr.priority === 'Hot' ? 'sel-hot' : ''}
              onClick={() => setHdr({ ...hdr, priority: 'Hot' })}>Hot</button>
          </div>
        </div>
        <div className="hdr-cell full">
          <label htmlFor="rv-notes">Notes for prefab</label>
          <textarea id="rv-notes" className="input" rows={2} placeholder="Gate 3 delivery. Stage on 4th floor east."
            value={hdr.notes} onChange={e => setHdr({ ...hdr, notes: e.target.value })} />
        </div>
      </div>

      {cart.length === 0 ? (
        <div className="empty-card">
          <div className="t">Nothing on this request yet</div>
          <div className="s">Head back to the catalog and add at least one assembly.</div>
        </div>
      ) : (
        <table className="review-table">
          <thead>
            <tr>
              <th style={{ width: 70 }} />
              <th>Assembly</th>
              <th style={{ width: 190 }}>Build code</th>
              <th style={{ width: 140 }}>Count</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {cart.map((l, i) => {
              const it = itemOf(l.assemblyId);
              if (!it) return null;
              const pref = prefSummary(l);
              return (
                <tr key={i}>
                  <td><Thumb id={l.assemblyId} title={it.title} size={70} /></td>
                  <td>
                    <div className="rt-title">{it.title}</div>
                    <div className="rt-sum">{optSummary(l.assemblyId, l.opts)}</div>
                    {pref && <div className="rt-pref">{pref}</div>}
                  </td>
                  <td><CodeStrip id={l.assemblyId} opts={l.opts} size="review" /></td>
                  <td>
                    <div className="stepper sm">
                      <button type="button" aria-label="Decrease" onClick={() => onQty(i, Math.max(1, l.qty - 1))}>−</button>
                      <input inputMode="numeric" value={l.qty} aria-label="Count"
                        onChange={e => onQty(i, Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1))} />
                      <button type="button" aria-label="Increase" onClick={() => onQty(i, l.qty + 1)}>+</button>
                    </div>
                  </td>
                  <td><button className="btn btn-ghost btn-remove" onClick={() => onRemove(i)}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="review-foot">
        <button className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit to prefab'}
        </button>
        <button className="btn btn-secondary" onClick={onBrowse}>Keep browsing</button>
        <span className="hint">{total} pieces total</span>
      </div>
    </div>
  );
}
