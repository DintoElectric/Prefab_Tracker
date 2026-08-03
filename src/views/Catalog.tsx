import { CATALOG, SYS_COLOR, sysColor, prefSummary, type RequestLine, type System, type Category, type SpecProfile } from '../data/model';
import { CodeStrip, Thumb } from '../lib/ui';

const CATS: ('All' | Category)[] = ['All', 'Boxes', 'Panelboards', 'Brackets', 'Conduit', 'Whips', 'Hardware'];

export function Catalog({ query, setQuery, cat, setCat, cart, profiles, profileId, setProfileId, onConfigure, onZoom, onRemoveLine, onReview }: {
  query: string; setQuery: (q: string) => void;
  cat: string; setCat: (c: string) => void;
  cart: RequestLine[];
  profiles: SpecProfile[];
  profileId: string | null;
  setProfileId: (id: string | null) => void;
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
        {profiles.some(p => p.active) && (
          <div className="specbar">
            <span className="cap">Job spec</span>
            <select className="input" value={profileId || ''} aria-label="Job spec profile"
              onChange={e => setProfileId(e.target.value || null)}>
              <option value="">None — full catalog</option>
              {profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {profileId && <span className="spec-note">Options in the configurator are limited to this spec</span>}
          </div>
        )}
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
                        <div className="asm-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => onConfigure(it.id)}>Configure</button>
                          {inCart > 0 && <span className="incart">{inCart} on request</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside className="cart-rail">
        <div className="cart-head">
          <span className="t">This request</span>
          <span className="c">{totalPieces}</span>
        </div>
        {cart.length === 0 ? (
          <div className="cart-empty">No assemblies yet. Configure one to start a request.</div>
        ) : (
          <>
            <div className="cart-lines">
              {cart.map((l, i) => {
                const it = CATALOG.find(x => x.id === l.assemblyId);
                if (!it) return null;
                const pref = prefSummary(l);
                return (
                  <div key={i} className="cart-line">
                    <Thumb id={l.assemblyId} title={it.title} size={44} />
                    <div className="cl-info">
                      <div className="cl-title">{it.title}</div>
                      <CodeStrip id={l.assemblyId} opts={l.opts} size="cart" />
                      {pref && <div className="cl-pref">{pref}</div>}
                    </div>
                    <div className="cl-qty">{l.qty}</div>
                    <button className="cl-x" aria-label="Remove" onClick={() => onRemoveLine(i)}>×</button>
                  </div>
                );
              })}
            </div>
            <button className="btn btn-primary cart-review" onClick={onReview}>Review request →</button>
          </>
        )}
      </aside>
    </div>
  );
}
