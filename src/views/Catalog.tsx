import { CATALOG, SYS_COLOR, sysColor, prefSummary, type RequestLine, type System, type Category } from '../data/model';
import { CodeStrip, Thumb } from '../lib/ui';

const CATS: ('All' | Category)[] = ['All', 'Boxes', 'Panelboards', 'Brackets', 'Conduit', 'Whips', 'Hardware'];

export function Catalog({ query, setQuery, cat, setCat, cart, onConfigure, onZoom, onRemoveLine, onReview }: {
  query: string; setQuery: (q: string) => void;
  cat: string; setCat: (c: string) => void;
  cart: RequestLine[];
  onConfigure: (id: string) => void;
  onZoom: (id: string, title: string) => void;
  onRemoveLine: (i: number) => void;
  onReview: () => void;
}) {
  const q = query.trim().toLowerCase();
  const visible = CATALOG.filter(it =>
    (cat === 'All' || it.category === cat) &&
    (!q || (it.title + ' ' + it.system + ' ' + it.category).toLowerCase().includes(q))
  );
  const totalPieces = cart.reduce((a, l) => a + l.qty, 0);

  return (
    <div className="canvas-inner">
      <div className="cat-main">
        <div className="filterbar">
          <input className="input" placeholder="Search assemblies — box, ring, bracket, fire alarm…"
            value={query} onChange={e => setQuery(e.target.value)} aria-label="Search assemblies" />
          {CATS.map(c => (
            <button key={c} className={'chip' + (cat === c ? ' sel' : '')} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <div className="legendbar">
          <span className="cap">Color code</span>
          {(Object.keys(SYS_COLOR) as System[]).map(s => (
            <span key={s} className="legend-item">
              <span className="sq" style={{ background: SYS_COLOR[s] }} />{s}
            </span>
          ))}
        </div>
        <div className="cat-grid">
          {visible.length === 0 ? (
            <div className="empty-card" style={{ gridColumn: '1 / -1' }}>
              <div className="t">No assemblies match</div>
              <div className="s">Clear the search or pick another group.</div>
            </div>
          ) : (
            <div className="cat-grid-frame" style={{ gridColumn: '1 / -1' }}>
              {visible.map(it => {
                const inCart = cart.filter(l => l.assemblyId === it.id).reduce((a, l) => a + l.qty, 0);
                return (
                  <div key={it.id} className="asm-card">
                    <div className="asm-bar" style={{ background: sysColor(it.system) }} />
                    <div className="asm-body">
                      <Thumb id={it.id} title={it.title} onZoom={() => onZoom(it.id, it.title)} />
                      <div className="asm-text">
                        <div className="tagrow">
                          <span className="tag-cat">{it.category}</span>
                          <span className="tag-sys" style={{ background: sysColor(it.system) }}>{it.system}</span>
                        </div>
                        <div className="asm-title">{it.title}</div>
                      </div>
                    </div>
                    <div className="asm-foot">
                      <span className="asm-pg">
                        Book pg. {it.id}
                        {inCart > 0 && <span className="onorder"> · {inCart} on order</span>}
                      </span>
                      <button className="btn btn-primary btn-add" onClick={() => onConfigure(it.id)}>Add to request</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside className="rail">
        <div className="rail-hdr">
          <h3>Current request</h3>
          <div className="rail-sum">
            {cart.length ? `${cart.length} assemblies · ${totalPieces} pieces` : 'Empty'}
          </div>
        </div>
        <div className="rail-body">
          {cart.length === 0 && (
            <div className="rail-empty">Add assemblies from the catalog. They collect here until you submit.</div>
          )}
          {cart.map((l, i) => {
            const it = CATALOG.find(x => x.id === l.assemblyId);
            if (!it) return null;
            const pref = prefSummary(l);
            return (
              <div key={i} className="rail-line" style={{ borderLeft: `5px solid ${sysColor(it.system)}` }}>
                <div className="info">
                  <div className="t">{it.title}</div>
                  <CodeStrip id={l.assemblyId} opts={l.opts} size="cart" />
                  {pref && <div className="pref">{pref}</div>}
                </div>
                <div className="right">
                  <span className="qty">{l.qty}</span>
                  <button className="btn btn-ghost btn-remove" onClick={() => onRemoveLine(i)}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="rail-foot">
          <button className="btn btn-primary" onClick={onReview}>Review &amp; submit</button>
        </div>
      </aside>
    </div>
  );
}
