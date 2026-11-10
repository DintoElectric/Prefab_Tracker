import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDate, type SessionUser } from '../data/model';
import { StatusTag, PrioTag } from '../lib/ui';
import { api } from '../lib/api';
import { WiremoldFigure } from './WiremoldDiagram';
import {
  FEED_ENDS, DEVICE_COLORS, WIRE_COLORS, WIRE_TYPES, WIRE_SIZES, ROLES, WIRE_PRESETS, WM_STATUSES,
  MAX_DEVICES, MAX_CONDUCTORS, MAX_BUILDS,
  deviceColor, wireColor, resolveDraft, emptyBuildDraft, ticketTotals, layoutBuild, formatLength,
  fmtFeetDecimal, sizeLabel, isDeviceColor, isRole, isWireColor,
  type BuildDraft, type DraftResult, type WiremoldBuild, type WiremoldTicket, type TicketTotals, type WireRole
} from '../data/wiremold';
import '../styles/wiremold.css';

// ───────────────────────── shared bits ─────────────────────────

const colorText = (c: { label: string; note?: string }) => (c.note ? `${c.label} (${c.note})` : c.label);

function WireSwatch({ colorKey }: { colorKey: string }) {
  const c = wireColor(colorKey);
  return <i className="wm-sw wire" style={{ background: c.tracer ? `repeating-linear-gradient(90deg, ${c.hex} 0 5px, ${c.tracer} 5px 9px)` : c.hex }} />;
}

// The wire to cut for the whole ticket, grouped by size, type and color.
function TotalsTable({ totals }: { totals: TicketTotals }) {
  if (!totals.lines.length) {
    return <div className="wm-empty-note">Finish a build and the wire to cut shows up here, totaled for the whole ticket.</div>;
  }
  const pieces = totals.lines.reduce((n, l) => n + l.pieces, 0);
  return (
    <table className="wm-cut">
      <thead>
        <tr>
          <th>Wire</th><th>Color</th>
          <th className="num" style={{ width: 90 }}>Pieces</th>
          <th className="num" style={{ width: 150 }}>Total length</th>
        </tr>
      </thead>
      <tbody>
        {totals.lines.map((l, i) => (
          <tr key={i}>
            <td style={{ fontWeight: 700 }}>{sizeLabel(l.size)} {l.type}</td>
            <td><WireSwatch colorKey={l.color.key} />{l.color.label}</td>
            <td className="num">{l.pieces}</td>
            <td className="num">{fmtFeetDecimal(l.inches)}</td>
          </tr>
        ))}
        <tr className="total">
          <td colSpan={2}>Total</td>
          <td className="num">{pieces}</td>
          <td className="num">{fmtFeetDecimal(totals.wireInches)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ───────────────────────── foreman ticket ─────────────────────────

interface Draft {
  job: string; needBy: string; priority: 'Standard' | 'Hot'; notes: string; builds: BuildDraft[];
}
const emptyDraft = (): Draft => ({ job: '', needBy: '', priority: 'Standard', notes: '', builds: [emptyBuildDraft()] });

const isBlankBuild = (d: BuildDraft) =>
  !d.label.trim() && !d.length.trim() && !d.devices.trim() && !d.spacing.trim() && !d.start.trim();

// A long ticket shouldn't be lost to a dropped tab or a locked phone. Same
// per-user, per-device draft idea the catalog cart uses.
const DRAFT_KEY = 'dinto-wiremold-draft-v1';
function cleanBuildDraft(raw: any): BuildDraft {
  const base = emptyBuildDraft();
  if (!raw || typeof raw !== 'object') return base;
  const d: BuildDraft = { ...base, ...raw };
  d.colors = Array.isArray(raw.colors) ? raw.colors.map((c: unknown) => (isDeviceColor(c) ? c : '')) : [];
  const cs = Array.isArray(raw.conductors)
    ? raw.conductors.filter((c: any) => isRole(c?.role) && isWireColor(c?.color)).map((c: any) => ({ role: c.role as WireRole, color: c.color as string }))
    : [];
  d.conductors = cs.length ? cs : base.conductors;
  return d;
}
function loadDraft(username: string): Draft {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    const mine = all[username];
    if (mine && typeof mine === 'object' && Array.isArray(mine.builds) && mine.builds.length) {
      return { ...emptyDraft(), ...mine, builds: mine.builds.map(cleanBuildDraft) };
    }
  } catch { /* fresh */ }
  return emptyDraft();
}
function saveDraft(username: string, d: Draft) {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    all[username] = d;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch { /* per-device draft only */ }
}

function BuildCard({ n, d, res, canRemove, canDuplicate, onPatch, onDuplicate, onRemove }: {
  n: number; d: BuildDraft; res: DraftResult; canRemove: boolean; canDuplicate: boolean;
  onPatch: (p: Partial<BuildDraft>) => void; onDuplicate: () => void; onRemove: () => void;
}) {
  const p = `Build ${n}`;
  const deviceCount = /^\d+$/.test(d.devices.trim()) ? Math.min(parseInt(d.devices, 10), MAX_DEVICES) : 0;
  const setConductor = (j: number, patch: Partial<{ role: WireRole; color: string }>) =>
    onPatch({ conductors: d.conductors.map((c, k) => (k === j ? { ...c, ...patch } : c)) });
  const allColor = deviceColor(d.deviceColor);
  const e = res.errors;

  return (
    <section className="wm-build" aria-label={p}>
      <div className="wm-build-hd">
        <span className="wm-num">{n}</span>
        <input className="input wm-label" aria-label={`${p} name`} placeholder="Name this build — e.g. Rm 204 north wall"
          value={d.label} onChange={ev => onPatch({ label: ev.target.value.slice(0, 60) })} />
        <label className="wm-qty">Qty
          <input className="input" aria-label={`${p} quantity`} inputMode="numeric" value={d.qty}
            onChange={ev => onPatch({ qty: ev.target.value.replace(/\D/g, '').slice(0, 2) })} />
        </label>
        {canDuplicate && <button type="button" className="btn btn-secondary btn-sm" onClick={onDuplicate}>Duplicate</button>}
        <button type="button" className="btn btn-secondary btn-sm" aria-label={`Remove ${p}`} onClick={onRemove}>
          {canRemove ? 'Remove' : 'Clear'}
        </button>
      </div>
      {e.qty && <div className="wm-why" style={{ padding: '6px 16px 0' }}>Quantity: {e.qty}</div>}

      <div className="wm-build-body">
        <div className="wm-fields">
          {/* 1 + 2: length and device count */}
          <div className="wm-pair">
            <div className="wm-f">
              <label htmlFor={`wm-len-${n}`}>Length of the wiremold</label>
              <input id={`wm-len-${n}`} className="input" aria-label={`${p} length`} placeholder="12'" autoComplete="off"
                value={d.length} onChange={ev => onPatch({ length: ev.target.value.slice(0, 20) })} />
              {e.length ? <div className="wm-why">{e.length}</div> : <div className="wm-echo">{res.echo.length ? `= ${res.echo.length}` : ''}</div>}
            </div>
            <div className="wm-f">
              <label htmlFor={`wm-dev-${n}`}>Device count</label>
              <input id={`wm-dev-${n}`} className="input" aria-label={`${p} devices`} inputMode="numeric" placeholder="5" autoComplete="off"
                value={d.devices} onChange={ev => onPatch({ devices: ev.target.value.replace(/\D/g, '').slice(0, 2) })} />
              {e.devices ? <div className="wm-why">{e.devices}</div> : <div className="wm-echo" />}
            </div>
          </div>

          {/* 3: spacing */}
          <div className="wm-f">
            <label htmlFor={`wm-sp-${n}`}>Spacing between devices (feet / inches)</label>
            <input id={`wm-sp-${n}`} className="input" aria-label={`${p} spacing`} placeholder={`2'-6"`} autoComplete="off"
              value={d.spacing} onChange={ev => onPatch({ spacing: ev.target.value.slice(0, 120) })} />
            {e.spacing ? <div className="wm-why">{e.spacing}</div>
              : <div className="wm-echo">{deviceCount === 1 ? 'One device — no spacing needed' : res.echo.spacing || ''}</div>}
            <div className="wm-help">One spacing is used between every pair of devices. For uneven gaps, type one per gap separated by commas (2', 3'-6", 2').</div>
          </div>

          {/* where the first device sits */}
          <div className="wm-f">
            <label htmlFor={`wm-st-${n}`}>First device from the left end (optional)</label>
            <input id={`wm-st-${n}`} className="input" aria-label={`${p} first device`} placeholder="blank = centered on the run" autoComplete="off"
              value={d.start} onChange={ev => onPatch({ start: ev.target.value.slice(0, 20) })} />
            {e.start ? <div className="wm-why">{e.start}</div>
              : <div className="wm-echo">{res.echo.start ? `${res.echo.start} from the left${res.echo.end ? ` · ${res.echo.end} from the right` : ''}` : ''}</div>}
          </div>
          {e.fit && <div className="wm-why" role="alert">{e.fit}</div>}

          {/* 4: color of each device */}
          <div className="wm-f">
            <span className="wm-lbl">Device color</span>
            <div className="wm-colorrow">
              <i className="wm-sw" style={{ background: allColor.hex }} aria-hidden="true" />
              <select className="input" aria-label={`${p} device color`} value={d.deviceColor}
                onChange={ev => onPatch({ deviceColor: ev.target.value, colors: [] })}>
                {DEVICE_COLORS.map(c => <option key={c.key} value={c.key}>{colorText(c)}</option>)}
              </select>
            </div>
            <div className="wm-help">Applies to every device. Ivory is the standard face color.</div>
            {deviceCount > 0 && (
              <button type="button" className="wm-linkbtn" onClick={() => onPatch({ each: !d.each })}>
                {d.each ? 'Hide the color of each device' : 'Set the color of each device'}
              </button>
            )}
            {d.each && deviceCount > 0 && (
              <div className="wm-each">
                {Array.from({ length: deviceCount }, (_, k) => {
                  const key = isDeviceColor(d.colors[k]) ? d.colors[k] : d.deviceColor;
                  return (
                    <div className="wm-each-item" key={k}>
                      <b>{k + 1}</b>
                      <i className="wm-sw" style={{ background: deviceColor(key).hex }} aria-hidden="true" />
                      <select aria-label={`${p} device ${k + 1} color`} value={key}
                        onChange={ev => {
                          const colors = d.colors.slice();
                          while (colors.length < deviceCount) colors.push('');
                          colors[k] = ev.target.value;
                          onPatch({ colors });
                        }}>
                        {DEVICE_COLORS.map(c => <option key={c.key} value={c.key}>{colorText(c)}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 5: feed end */}
          <div className="wm-f">
            <span className="wm-lbl">Feed end</span>
            <div className="wm-seg" role="group" aria-label={`${p} feed end`}>
              {FEED_ENDS.map(f => (
                <button key={f.v} type="button" aria-pressed={d.feed === f.v} className={'chip' + (d.feed === f.v ? ' sel' : '')}
                  onClick={() => onPatch({ feed: f.v })}>{f.label}</button>
              ))}
            </div>
            <div className="wm-help">Left and right as you face the run.</div>
          </div>

          {/* 6: wire type and colors */}
          <div className="wm-wire">
            <span className="wm-sub" style={{ marginBottom: 0 }}>Wire type and colors</span>
            <div className="wm-f">
              <select aria-label={`${p} wire preset`} value="" onChange={ev => {
                const pre = WIRE_PRESETS.find(x => x.id === ev.target.value);
                if (pre) onPatch({ conductors: pre.conductors.map(c => ({ ...c })) });
              }}>
                <option value="">Start from a common setup…</option>
                {WIRE_PRESETS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </div>
            <div className="wm-pair">
              <div className="wm-f">
                <label htmlFor={`wm-wt-${n}`}>Type</label>
                <select id={`wm-wt-${n}`} aria-label={`${p} wire type`} value={d.wireType} onChange={ev => onPatch({ wireType: ev.target.value })}>
                  {WIRE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="wm-f">
                <label htmlFor={`wm-ws-${n}`}>Size</label>
                <select id={`wm-ws-${n}`} aria-label={`${p} wire size`} value={d.wireSize} onChange={ev => onPatch({ wireSize: ev.target.value as BuildDraft['wireSize'] })}>
                  {WIRE_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)} AWG</option>)}
                </select>
              </div>
            </div>
            {d.conductors.map((c, j) => (
              <div className="wm-cond" key={j}>
                <select aria-label={`${p} conductor ${j + 1} role`} value={c.role} onChange={ev => setConductor(j, { role: ev.target.value as WireRole })}>
                  {ROLES.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
                </select>
                <div className="wm-colorrow">
                  <WireSwatch colorKey={c.color} />
                  <select aria-label={`${p} conductor ${j + 1} color`} value={c.color} onChange={ev => setConductor(j, { color: ev.target.value })}>
                    {WIRE_COLORS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
                  </select>
                </div>
                <button type="button" className="btn btn-secondary btn-xs" aria-label={`Remove conductor ${j + 1}`}
                  onClick={() => onPatch({ conductors: d.conductors.filter((_, k) => k !== j) })}>✕</button>
              </div>
            ))}
            {e.wire && <div className="wm-why">{e.wire}</div>}
            {d.conductors.length < MAX_CONDUCTORS && (
              <button type="button" className="wm-linkbtn" style={{ marginTop: 0 }}
                onClick={() => onPatch({ conductors: [...d.conductors, { role: 'hot', color: 'black' }] })}>+ Add a conductor</button>
            )}
          </div>
        </div>

        <div className="wm-preview">
          {/* stays in view while the fields beside it are edited */}
          <div className="wm-preview-in">
            {res.build
              ? <WiremoldFigure build={res.build} />
              : (
                <div className="wm-empty">
                  {res.errors.fit
                    ? 'The devices don’t fit on the run yet — see the note on the left.'
                    : 'Enter the length, device count and spacing and the drawing of this build appears here.'}
                </div>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TicketForm({ user, flash, onSubmitted }: {
  user: SessionUser; flash: (m: string) => void; onSubmitted: () => void;
}) {
  const [draft, setDraftState] = useState<Draft>(() => loadDraft(user.username));
  const [busy, setBusy] = useState(false);
  const setDraft = (d: Draft) => { setDraftState(d); saveDraft(user.username, d); };
  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const patchBuild = (i: number, p: Partial<BuildDraft>) =>
    patch({ builds: draft.builds.map((b, j) => (j === i ? { ...b, ...p } : b)) });

  const results = useMemo(() => draft.builds.map(resolveDraft), [draft.builds]);
  const ready: WiremoldBuild[] = [];
  results.forEach((r, i) => { if (r.build && !isBlankBuild(draft.builds[i])) ready.push({ ...r.build, label: r.build.label || `Build ${i + 1}` }); });
  const totals = useMemo(() => ticketTotals(ready), [results]);   // eslint-disable-line react-hooks/exhaustive-deps

  const duplicate = (i: number) => {
    const copy: BuildDraft = JSON.parse(JSON.stringify(draft.builds[i]));
    const next = draft.builds.slice();
    next.splice(i + 1, 0, copy);
    patch({ builds: next });
  };
  const remove = (i: number) => {
    const next = draft.builds.filter((_, j) => j !== i);
    patch({ builds: next.length ? next : [emptyBuildDraft()] });
  };

  const submit = async () => {
    if (!draft.job.trim()) { flash('Job name is required'); return; }
    const filled = draft.builds.map((b, i) => ({ b, i })).filter(x => !isBlankBuild(x.b));
    if (!filled.length) { flash('Add at least one build'); return; }
    for (const { i } of filled) {
      const r = results[i];
      if (!r.build) {
        const why = !r.complete && !Object.keys(r.errors).length
          ? 'fill in the length, device count and spacing'
          : (r.errors.fit || r.errors.length || r.errors.devices || r.errors.spacing || r.errors.start || r.errors.qty || r.errors.wire || 'fill in the length, device count and spacing');
        flash(`Build ${i + 1}: ${why}`);
        return;
      }
    }
    setBusy(true);
    try {
      const { ticket } = await api.createWiremold({
        job: draft.job, needBy: draft.needBy, priority: draft.priority, notes: draft.notes, builds: ready
      });
      // Keep the job-level fields — several tickets for one job is common.
      setDraft({ ...draft, notes: '', builds: [emptyBuildDraft()] });
      flash(`${ticket.id} submitted to prefab`);
      onSubmitted();
    } catch (e: any) {
      flash(e.message || 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  const incomplete = draft.builds.filter((b, i) => !isBlankBuild(b) && !results[i].build).length;
  const hint = incomplete
    ? { err: true, text: `${incomplete} build${incomplete === 1 ? '' : 's'} not finished yet` }
    : ready.length
      ? { err: false, text: `${ready.length} build${ready.length === 1 ? '' : 's'} · ${totals.runs} run${totals.runs === 1 ? '' : 's'} · ${totals.devices} devices · ${fmtFeetDecimal(totals.wireInches)} of wire` }
      : { err: false, text: 'Fill in a build to submit it.' };

  return (
    <>
      <div className="wm-hdr">
        <div className="wm-cell">
          <label htmlFor="wm-job">Job name</label>
          <input id="wm-job" className="input" placeholder="e.g. Yale OML" value={draft.job} onChange={e => patch({ job: e.target.value })} />
        </div>
        <div className="wm-cell">
          <label htmlFor="wm-need">Date needed</label>
          <input id="wm-need" className="input" type="date" value={draft.needBy} onChange={e => patch({ needBy: e.target.value })} />
        </div>
        <div className="wm-cell">
          <span className="wm-lbl">Priority</span>
          <div className="prio-seg">
            <button type="button" className={draft.priority === 'Standard' ? 'sel-std' : ''} onClick={() => patch({ priority: 'Standard' })}>Standard</button>
            <button type="button" className={draft.priority === 'Hot' ? 'sel-hot' : ''} onClick={() => patch({ priority: 'Hot' })}>Hot</button>
          </div>
        </div>
        <div className="wm-cell">
          <label htmlFor="wm-notes">Notes for prefab</label>
          <input id="wm-notes" className="input" placeholder="Anything the drawing doesn’t say" value={draft.notes} onChange={e => patch({ notes: e.target.value })} />
        </div>
      </div>

      {draft.builds.map((b, i) => (
        <BuildCard key={i} n={i + 1} d={b} res={results[i]}
          canRemove={draft.builds.length > 1} canDuplicate={draft.builds.length < MAX_BUILDS}
          onPatch={p => patchBuild(i, p)} onDuplicate={() => duplicate(i)} onRemove={() => remove(i)} />
      ))}

      <div className="wm-add">
        <button type="button" className="btn btn-secondary" disabled={draft.builds.length >= MAX_BUILDS}
          onClick={() => patch({ builds: [...draft.builds, emptyBuildDraft()] })}>+ Add another build</button>
      </div>

      <div className="wm-card">
        <div className="wm-card-hd">
          <span className="t">Wire to cut</span>
          <span className="s">{totals.runs} run{totals.runs === 1 ? '' : 's'} · {totals.devices} devices · {fmtFeetDecimal(totals.wireInches)}</span>
        </div>
        <TotalsTable totals={totals} />
      </div>

      <div className="wm-foot">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit to prefab'}</button>
        <span className={'hint' + (hint.err ? ' err' : '')}>{hint.text}</span>
      </div>
    </>
  );
}

// ───────────────────────── prefab list ─────────────────────────

function BuildDetail({ b, n }: { b: WiremoldBuild; n: number }) {
  const lay = layoutBuild(b);
  const equal = b.gapsIn.every(g => g === b.gapsIn[0]);
  const spacing = b.devices === 1 ? '—' : equal ? `${formatLength(b.gapsIn[0])} between each` : b.gapsIn.map(formatLength).join(' · ');
  const feed = FEED_ENDS.find(f => f.v === b.feed)!.label;
  return (
    <div className="wm-detail-build">
      <div className="wm-detail-hd">
        <span className="wm-num">{n}</span>
        <span className="t">{b.label}</span>
        {b.qty > 1 && <span className="q">× {b.qty}</span>}
      </div>
      <div className="wm-detail-grid">
        <dl className="wm-spec">
          <dt>Length</dt><dd>{formatLength(b.lengthIn)}</dd>
          <dt>Devices</dt><dd>{b.devices}</dd>
          <dt>Spacing</dt><dd>{spacing}</dd>
          <dt>First device</dt><dd>{formatLength(lay.startIn)} from the left end{b.startIn === null ? ' (centered)' : ''}</dd>
          <dt>Last device</dt><dd>{formatLength(lay.endIn)} from the right end</dd>
          <dt>Fed from</dt><dd>{feed}</dd>
          <dt>Wire</dt><dd>{sizeLabel(b.wire.size)} {b.wire.type}</dd>
          <dt>Conductors</dt>
          <dd>
            {b.wire.conductors.map((c, i) => (
              <div key={i}><WireSwatch colorKey={c.color} />{c.role[0].toUpperCase() + c.role.slice(1)} · {wireColor(c.color).label}</div>
            ))}
            <div style={{ color: 'var(--color-neutral-600)', fontWeight: 400 }}>
              {b.wire.conductors.length} × {formatLength(b.lengthIn)} per run{b.qty > 1 ? `, ${b.qty} runs` : ''}
            </div>
          </dd>
        </dl>
        <WiremoldFigure build={b} />
      </div>
      <div className="wm-devs">
        {lay.positions.map((at, i) => {
          const c = deviceColor(b.deviceColors[i]);
          return (
            <div className="wm-dev" key={i}>
              <b>#{i + 1}</b>
              <span className="p">{formatLength(at)} <small>from left · {formatLength(b.lengthIn - at)} from right</small></span>
              <i className="wm-sw" style={{ background: c.hex }} aria-hidden="true" />{colorText(c)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TicketCard({ ticket, canWork, isAdmin, startOpen, onAdvance, onDelete, onPrint }: {
  ticket: WiremoldTicket; canWork: boolean; isAdmin: boolean; startOpen: boolean;
  onAdvance: (id: string) => void; onDelete: (id: string) => void; onPrint: (id: string) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [confirmDel, setConfirmDel] = useState(false);
  const totals = useMemo(() => ticketTotals(ticket.builds), [ticket]);
  const next = WM_STATUSES[Math.min(WM_STATUSES.indexOf(ticket.status) + 1, WM_STATUSES.length - 1)];
  const closed = ticket.status === 'Closed';

  return (
    <div className="req-card">
      <div className="req-hdr">
        <span className="req-id">{ticket.id}</span>
        <span className="req-job">{ticket.job}</span>
        <StatusTag s={ticket.status} />
        <PrioTag p={ticket.priority} />
        <span className="req-right">Needed {fmtDate(ticket.needBy)} · {ticket.by.replace(/ — .*$/, '')}</span>
      </div>
      <div className="wm-meta">
        <div><div className="k">Builds</div><div className="v">{totals.builds}</div></div>
        <div><div className="k">Runs</div><div className="v">{totals.runs}</div></div>
        <div><div className="k">Devices</div><div className="v">{totals.devices}</div></div>
        <div><div className="k">Total wire</div><div className="v">{fmtFeetDecimal(totals.wireInches)}</div></div>
      </div>

      {open && (
        <>
          {ticket.builds.map((b, i) => <BuildDetail key={i} b={b} n={i + 1} />)}
          <div className="wm-card" style={{ margin: 0, border: 'none', borderTop: '2px solid var(--color-neutral-400)' }}>
            <div className="wm-card-hd">
              <span className="t">Wire to cut</span>
              <span className="s">whole ticket</span>
            </div>
            <TotalsTable totals={totals} />
          </div>
          {ticket.notes.trim() && <div className="wm-notes"><strong>Notes: </strong>{ticket.notes}</div>}
        </>
      )}

      <div className="wm-acts noprint">
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(o => !o)}>{open ? 'Hide builds' : 'Open builds'}</button>
        {open && <button className="btn btn-secondary btn-sm" onClick={() => onPrint(ticket.id)}>Print</button>}
        {canWork && (closed
          ? <span className="q-complete">Complete</span>
          : <button className="btn btn-primary btn-sm btn-adv" onClick={() => onAdvance(ticket.id)}>→ {next}</button>)}
        {isAdmin && (
          <button className={'btn btn-secondary btn-sm btn-del' + (confirmDel ? ' confirm' : '')}
            onClick={() => { if (confirmDel) { setConfirmDel(false); onDelete(ticket.id); } else setConfirmDel(true); }}
            onBlur={() => setConfirmDel(false)}>
            {confirmDel ? 'Confirm' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── module ─────────────────────────

export function Wiremold({ user, flash }: { user: SessionUser; flash: (m: string) => void }) {
  const canSubmit = user.role !== 'prefab';
  const canWork = user.role !== 'foreman';
  const isAdmin = user.role === 'admin';

  const [mode, setMode] = useState<'new' | 'list'>(canSubmit ? 'new' : 'list');
  const [tickets, setTickets] = useState<WiremoldTicket[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [printId, setPrintId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { tickets } = await api.listWiremold();
      setTickets(tickets);
      setLoadErr('');
    } catch (e: any) {
      setLoadErr(e.message || 'Could not load wiremold tickets');
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [load]);

  // Print one ticket at a time: show only that card, open the dialog, and
  // restore the full list when it closes.
  useEffect(() => {
    if (!printId) return;
    const done = () => setPrintId(null);
    window.addEventListener('afterprint', done);
    const t = window.setTimeout(() => window.print(), 60);
    return () => { window.removeEventListener('afterprint', done); window.clearTimeout(t); };
  }, [printId]);

  const advance = async (id: string) => {
    const t = tickets.find(x => x.id === id);
    if (!t) return;
    const next = WM_STATUSES[Math.min(WM_STATUSES.indexOf(t.status) + 1, WM_STATUSES.length - 1)];
    try {
      const { ticket } = await api.patchWiremold(id, { status: next });
      setTickets(prev => prev.map(x => (x.id === id ? ticket : x)));
    } catch (e: any) { flash(e.message || 'Update failed'); }
  };
  const remove = async (id: string) => {
    try {
      await api.deleteWiremold(id);
      setTickets(prev => prev.filter(x => x.id !== id));
      flash(`${id} deleted`);
    } catch (e: any) { flash(e.message || 'Delete failed'); }
  };

  const open = tickets.filter(t => t.status !== 'Closed').length;
  const shown = printId ? tickets.filter(t => t.id === printId) : tickets;

  return (
    <div className="page-col">
      <div className="page-title-row">
        <h1 className="page-title">Wiremold</h1>
        <span className="page-cap">Length · devices · spacing · colors → drawing</span>
      </div>

      {canSubmit && (
        <div className="wm-modebar noprint">
          <button className={'chip' + (mode === 'new' ? ' sel' : '')} onClick={() => setMode('new')}>New ticket</button>
          <button className={'chip' + (mode === 'list' ? ' sel' : '')} onClick={() => setMode('list')}>
            {canWork ? `All tickets (${open} open)` : `My tickets (${tickets.length})`}
          </button>
        </div>
      )}

      {mode === 'new' && canSubmit && (
        <TicketForm user={user} flash={flash} onSubmitted={() => { load(); setMode('list'); }} />
      )}

      {mode === 'list' && (
        <>
          {!canSubmit && <div className="page-cap" style={{ marginTop: 14 }}>{open} open · {tickets.length} total</div>}
          {printId && (
            <div className="noprint" style={{ marginTop: 14 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPrintId(null)}>← Show all tickets</button>
            </div>
          )}
          {loadErr && <div className="login-err" style={{ marginTop: 14 }}>{loadErr}</div>}
          {!loadErr && tickets.length === 0 && (
            <div className="empty-card">
              <div className="t">{canSubmit ? 'No wiremold tickets yet' : 'No wiremold builds waiting'}</div>
              <div className="s">
                {canSubmit
                  ? 'Fill out a ticket and it will show up here with its status.'
                  : 'Tickets from the field land here with a drawing of every build.'}
              </div>
            </div>
          )}
          {shown.map(t => (
            <TicketCard key={t.id} ticket={t} canWork={canWork} isAdmin={isAdmin} startOpen={printId === t.id}
              onAdvance={advance} onDelete={remove} onPrint={setPrintId} />
          ))}
        </>
      )}
    </div>
  );
}
