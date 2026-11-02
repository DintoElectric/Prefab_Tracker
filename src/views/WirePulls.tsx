import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDate, type SessionUser } from '../data/model';
import { StatusTag, PrioTag } from '../lib/ui';
import { api } from '../lib/api';
import {
  SYSTEMS, PANEL_SPACES, WIRE_SIZES, DEFAULT_WIRE_SIZE, DEFAULT_SYSTEM, MAX_FOOTAGE, WP_STATUSES,
  systemDef, phaseColor, positionsOf, conductorsFor, claimMap, checkRows, cutList, totalFeet,
  fmtFeet, sizeLabel,
  type VoltageSystem, type WireSize, type Poles, type WirePullRow, type WirePullSheet,
  type Conductor, type CutLine, type WireColor
} from '../data/wirepulls';
import '../styles/wirepulls.css';

// ───────────────────────── shared bits ─────────────────────────

function ColorChip({ color, tag, ghost }: { color: WireColor; tag?: string; ghost?: boolean }) {
  return (
    <span className={'wp-chip' + (ghost ? ' ghost' : '')} style={{ background: color.hex, color: color.ink }}
      title={color.label}>
      {color.short}{tag && <span className="ph">{tag}</span>}
    </span>
  );
}

function Chips({ conductors, ghost }: { conductors: Conductor[]; ghost?: boolean }) {
  return (
    <span className="wp-chips">
      {conductors.map((c, i) => (
        <ColorChip key={i} color={c.color} ghost={ghost}
          tag={c.role === 'hot' ? c.phase : c.role === 'neutral' ? 'N' : 'G'} />
      ))}
    </span>
  );
}

const ROLE_NAME = { hot: 'hot', neutral: 'neutral', ground: 'ground' } as const;

function CutTable({ lines }: { lines: CutLine[] }) {
  if (!lines.length) return <div className="wp-empty-note">Enter a footage for a circuit and the wire to cut shows up here.</div>;
  return (
    <table className="wp-cut">
      <thead>
        <tr><th style={{ width: 90 }}>Size</th><th>Wire</th><th className="num" style={{ width: 110 }}>Pieces</th><th className="num" style={{ width: 150 }}>Total footage</th></tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td style={{ fontWeight: 700 }}>{sizeLabel(l.size)}</td>
            <td>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ColorChip color={l.color} />
                <span>{l.color.label} <span style={{ color: 'var(--color-neutral-600)' }}>· {ROLE_NAME[l.role]}</span></span>
              </span>
            </td>
            <td className="num">{l.pieces}</td>
            <td className="num">{fmtFeet(l.feet)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ───────────────────────── foreman sheet ─────────────────────────

interface Cell { footage: string; poles: Poles; size: '' | WireSize; neutral: boolean | null; }
const BLANK: Cell = { footage: '', poles: 1, size: '', neutral: null };

interface Draft {
  job: string; panel: string; system: VoltageSystem; spaces: number;
  needBy: string; priority: 'Standard' | 'Hot'; notes: string;
  defaultSize: WireSize; cells: Record<number, Cell>;
}
const emptyDraft = (): Draft => ({
  job: '', panel: '', system: DEFAULT_SYSTEM, spaces: 42, needBy: '', priority: 'Standard',
  notes: '', defaultSize: DEFAULT_WIRE_SIZE, cells: {}
});

// The sheet is long; a foreman shouldn't lose it to a dropped tab or a locked
// phone. Same per-user, per-device draft idea the catalog cart uses.
const DRAFT_KEY = 'dinto-wirepull-draft-v1';
function loadDraft(username: string): Draft {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    const mine = all[username];
    if (mine && typeof mine === 'object' && mine.cells && typeof mine.cells === 'object') {
      return { ...emptyDraft(), ...mine };
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

const footageOf = (c: Cell) => {
  const n = parseInt(c.footage, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
// Default: a single-pole circuit carries a neutral, a multi-pole one does not.
// The foreman can flip it either way per circuit.
const wantsNeutral = (c: Cell, system: VoltageSystem) =>
  !!systemDef(system).neutral && (c.neutral ?? c.poles === 1);

function SheetForm({ user, flash, onSubmitted }: {
  user: SessionUser; flash: (m: string) => void; onSubmitted: () => void;
}) {
  const [draft, setDraftState] = useState<Draft>(() => loadDraft(user.username));
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const setDraft = (d: Draft) => { setDraftState(d); saveDraft(user.username, d); };
  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setCell = (n: number, p: Partial<Cell>) =>
    setDraft({ ...draft, cells: { ...draft.cells, [n]: { ...(draft.cells[n] || BLANK), ...p } } });

  const sys = systemDef(draft.system);
  const hasNeutral = !!sys.neutral;

  const { rows, problems, claims } = useMemo(() => {
    const rows: WirePullRow[] = [];
    for (let n = 1; n <= draft.spaces; n++) {
      const c = draft.cells[n];
      if (!c) continue;
      const f = footageOf(c);
      if (!f) continue;
      rows.push({
        circuit: n, poles: c.poles, footage: f,
        size: c.size || draft.defaultSize, neutral: wantsNeutral(c, draft.system)
      });
    }
    const problems = checkRows(rows, draft.spaces);
    for (const r of rows) {
      if (r.footage > MAX_FOOTAGE && !problems.has(r.circuit)) problems.set(r.circuit, `over ${MAX_FOOTAGE} ft — check the number`);
    }
    return { rows, problems, claims: claimMap(rows) };
  }, [draft]);

  const lines = useMemo(() => cutList(rows, draft.system), [rows, draft.system]);

  const submit = async () => {
    if (!draft.job.trim()) { flash('Job name is required'); return; }
    if (!draft.panel.trim()) { flash('Panel name is required'); return; }
    if (!rows.length) { flash('List a footage for at least one circuit'); return; }
    if (problems.size) { flash('Fix the highlighted circuits first'); return; }
    setBusy(true);
    try {
      const { sheet } = await api.createWirePull({
        job: draft.job, panel: draft.panel, system: draft.system, spaces: draft.spaces,
        needBy: draft.needBy, priority: draft.priority, notes: draft.notes, rows
      });
      // Foremen usually send several panels for one job, so keep the job-level
      // fields and clear only what belongs to this panel.
      setDraft({ ...draft, panel: '', notes: '', cells: {} });
      flash(`${sheet.id} submitted to prefab`);
      onSubmitted();
    } catch (e: any) {
      flash(e.message || 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  const hint = problems.size
    ? { err: true, text: `${problems.size} circuit${problems.size === 1 ? '' : 's'} need attention` }
    : rows.length
      ? { err: false, text: `${draft.panel.trim() || 'This panel'} · ${rows.length} circuit${rows.length === 1 ? '' : 's'} · ${fmtFeet(totalFeet(lines))} of wire` }
      : { err: false, text: 'Type a footage next to each circuit that needs a pull.' };

  const circuits = Array.from({ length: draft.spaces }, (_, i) => i + 1);

  return (
    <>
      <div className="wp-hdr">
        <div className="wp-cell">
          <label htmlFor="wp-job">Job name</label>
          <input id="wp-job" className="input" placeholder="e.g. Yale OML — Level 2"
            value={draft.job} onChange={e => patch({ job: e.target.value })} />
        </div>
        <div className="wp-cell">
          <label htmlFor="wp-panel">Panel</label>
          <input id="wp-panel" className="input" placeholder="e.g. LP2-1"
            value={draft.panel} onChange={e => patch({ panel: e.target.value })} />
        </div>
        <div className="wp-cell">
          <label htmlFor="wp-spaces">Panel size</label>
          <select id="wp-spaces" className="input" value={draft.spaces}
            onChange={e => patch({ spaces: Number(e.target.value) })}>
            {PANEL_SPACES.map(n => <option key={n} value={n}>{n} spaces</option>)}
          </select>
        </div>
        <div className="wp-cell">
          <label htmlFor="wp-size">Wire size (unless a circuit says otherwise)</label>
          <select id="wp-size" className="input" value={draft.defaultSize}
            onChange={e => patch({ defaultSize: e.target.value as WireSize })}>
            {WIRE_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)} AWG</option>)}
          </select>
        </div>
        <div className="wp-cell">
          <label htmlFor="wp-need">Date needed</label>
          <input id="wp-need" className="input" type="date" value={draft.needBy}
            onChange={e => patch({ needBy: e.target.value })} />
        </div>
        <div className="wp-cell">
          <span className="wp-lbl">Priority</span>
          <div className="prio-seg">
            <button type="button" className={draft.priority === 'Standard' ? 'sel-std' : ''}
              onClick={() => patch({ priority: 'Standard' })}>Standard</button>
            <button type="button" className={draft.priority === 'Hot' ? 'sel-hot' : ''}
              onClick={() => patch({ priority: 'Hot' })}>Hot</button>
          </div>
        </div>
        <div className="wp-cell full">
          <span className="wp-lbl">Voltage system — sets the wire colors</span>
          <div className="wp-sys">
            {SYSTEMS.map(s => (
              <button key={s.v} type="button" className={'chip' + (draft.system === s.v ? ' sel' : '')}
                onClick={() => patch({ system: s.v })}>
                <span>{s.label}</span>
                <span className="b">{s.blurb}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="wp-cell full">
          <label htmlFor="wp-notes">Notes for prefab</label>
          <textarea id="wp-notes" className="input" rows={2} placeholder="Label each pull with the circuit number. Deliver to the 2nd floor electrical room."
            value={draft.notes} onChange={e => patch({ notes: e.target.value })} />
        </div>
      </div>

      <div className="wp-tbl-scroll">
        <table className="wp-tbl">
          <thead>
            <tr>
              <th style={{ width: 76 }}>Ckt</th>
              <th>Wire to pull</th>
              <th style={{ width: 120 }}>Footage</th>
              <th style={{ width: 96 }}>Poles</th>
              <th style={{ width: 150 }}>Size</th>
              <th style={{ width: 96 }}>Neutral</th>
            </tr>
          </thead>
          <tbody>
            {circuits.map(n => {
              const cell = draft.cells[n] || BLANK;
              const f = footageOf(cell);
              const owner = claims.get(n);
              const covered = !f && owner !== undefined && owner !== n;
              const why = problems.get(n);
              const band = phaseColor(n, draft.system).hex;
              const cls = [
                n > 1 && (n - 1) % 6 === 0 ? 'cycle' : '',
                f ? 'active' : '', covered ? 'covered' : '', why ? 'bad' : ''
              ].filter(Boolean).join(' ');
              const bandStyle = { boxShadow: `inset 6px 0 0 ${band}` };

              if (covered) {
                const ownerRow = rows.find(r => r.circuit === owner);
                return (
                  <tr key={n} className={cls}>
                    <td className="ckt" style={bandStyle}>{n}</td>
                    <td colSpan={5} className="muted">
                      ↳ Part of circuit {owner}{ownerRow ? ` (${ownerRow.poles}-pole)` : ''}
                    </td>
                  </tr>
                );
              }

              const neutralOn = wantsNeutral(cell, draft.system);
              const conductors = conductorsFor(n, cell.poles, neutralOn, draft.system);
              return (
                <tr key={n} className={cls}>
                  <td className="ckt" style={bandStyle}>
                    {n}
                    {cell.poles > 1 && <small>{positionsOf(n, cell.poles).join(' · ')}</small>}
                  </td>
                  <td>
                    {f
                      ? <Chips conductors={conductors} />
                      : <Chips conductors={conductors.filter(c => c.role === 'hot')} ghost />}
                    {why && <div className="why">{why}</div>}
                  </td>
                  <td className="ft">
                    <input className="input" inputMode="numeric" placeholder="—" aria-label={`Circuit ${n} footage`}
                      value={cell.footage}
                      onChange={e => setCell(n, { footage: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                  </td>
                  <td>
                    <select className="input" aria-label={`Circuit ${n} poles`} value={cell.poles}
                      onChange={e => setCell(n, { poles: Number(e.target.value) as Poles })}>
                      <option value={1}>1P</option>
                      <option value={2}>2P</option>
                      <option value={3}>3P</option>
                    </select>
                  </td>
                  <td>
                    <select className="input" aria-label={`Circuit ${n} wire size`} value={cell.size}
                      onChange={e => setCell(n, { size: e.target.value as '' | WireSize })}>
                      <option value="">Default ({sizeLabel(draft.defaultSize)})</option>
                      {WIRE_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}
                    </select>
                  </td>
                  <td className="n">
                    <label>
                      <input type="checkbox" disabled={!hasNeutral} checked={hasNeutral && neutralOn}
                        onChange={e => setCell(n, { neutral: e.target.checked })} />
                      N
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="wp-card">
        <div className="wp-card-hd">
          <span className="t">Wire to cut</span>
          <span className="s">{rows.length} circuit{rows.length === 1 ? '' : 's'} · {fmtFeet(totalFeet(lines))}</span>
        </div>
        <CutTable lines={lines} />
      </div>

      <div className="wp-foot">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Submitting…' : 'Submit to prefab'}
        </button>
        <button type="button" className={'btn btn-secondary btn-del' + (confirmClear ? ' confirm' : '')}
          onClick={() => {
            if (confirmClear) { setConfirmClear(false); patch({ cells: {} }); }
            else setConfirmClear(true);
          }}
          onBlur={() => setConfirmClear(false)}>
          {confirmClear ? 'Confirm — clear all footages' : 'Clear footages'}
        </button>
        <span className={'hint' + (hint.err ? ' err' : '')}>{hint.text}</span>
      </div>
    </>
  );
}

// ───────────────────────── prefab list ─────────────────────────

function CircuitTable({ sheet }: { sheet: WirePullSheet }) {
  return (
    <div className="wp-tbl-scroll">
      <table className="wp-tbl">
        <thead>
          <tr>
            <th style={{ width: 120 }}>Ckt</th>
            <th>Wire to pull</th>
            <th className="num" style={{ width: 70 }}>Poles</th>
            <th className="num" style={{ width: 80 }}>Size</th>
            <th className="num" style={{ width: 100 }}>Footage</th>
            <th className="num" style={{ width: 120 }}>All conductors</th>
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map(r => {
            const cs = conductorsFor(r.circuit, r.poles, r.neutral, sheet.system);
            return (
              <tr key={r.circuit}>
                <td className="ckt" style={{ boxShadow: `inset 6px 0 0 ${phaseColor(r.circuit, sheet.system).hex}` }}>
                  {r.circuit}
                  {r.poles > 1 && <small>{positionsOf(r.circuit, r.poles).join(' · ')}</small>}
                </td>
                <td><Chips conductors={cs} /></td>
                <td className="num">{r.poles}P</td>
                <td className="num">{sizeLabel(r.size)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{r.footage} ft</td>
                <td className="num">{fmtFeet(r.footage * cs.length)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SheetCard({ sheet, canWork, isAdmin, startOpen, onAdvance, onDelete, onPrint }: {
  sheet: WirePullSheet; canWork: boolean; isAdmin: boolean; startOpen: boolean;
  onAdvance: (id: string) => void; onDelete: (id: string) => void; onPrint: (id: string) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [confirmDel, setConfirmDel] = useState(false);
  const lines = useMemo(() => cutList(sheet.rows, sheet.system), [sheet]);
  const next = WP_STATUSES[Math.min(WP_STATUSES.indexOf(sheet.status) + 1, WP_STATUSES.length - 1)];
  const closed = sheet.status === 'Closed';

  return (
    <div className="req-card wp-detail">
      <div className="req-hdr">
        <span className="req-id">{sheet.id}</span>
        <span className="req-job">{sheet.job}</span>
        <StatusTag s={sheet.status} />
        <PrioTag p={sheet.priority} />
        <span className="req-right">Needed {fmtDate(sheet.needBy)} · {sheet.by.replace(/ — .*$/, '')}</span>
      </div>
      <div className="wp-sheet-meta">
        <div><div className="k">Panel</div><div className="v">{sheet.panel}</div></div>
        <div><div className="k">System</div><div className="v">{systemDef(sheet.system).label}</div></div>
        <div><div className="k">Circuits</div><div className="v">{sheet.rows.length}</div></div>
        <div><div className="k">Total wire</div><div className="v">{fmtFeet(totalFeet(lines))}</div></div>
      </div>

      {open && (
        <>
          <CircuitTable sheet={sheet} />
          <div className="wp-card-hd" style={{ borderTop: '1px solid var(--color-neutral-300)' }}>
            <span className="t">Wire to cut</span>
            <span className="s">grouped by size and color</span>
          </div>
          <CutTable lines={lines} />
          {sheet.notes.trim() && <div className="wp-notes"><strong>Notes: </strong>{sheet.notes}</div>}
        </>
      )}

      <div className="wp-sheet-acts noprint">
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(o => !o)}>
          {open ? 'Hide cut list' : 'Open cut list'}
        </button>
        {open && <button className="btn btn-secondary btn-sm" onClick={() => onPrint(sheet.id)}>Print</button>}
        {canWork && (closed
          ? <span className="q-complete">Complete</span>
          : <button className="btn btn-primary btn-sm btn-adv" onClick={() => onAdvance(sheet.id)}>→ {next}</button>)}
        {isAdmin && (
          <button className={'btn btn-secondary btn-sm btn-del' + (confirmDel ? ' confirm' : '')}
            onClick={() => {
              if (confirmDel) { setConfirmDel(false); onDelete(sheet.id); }
              else setConfirmDel(true);
            }}
            onBlur={() => setConfirmDel(false)}>
            {confirmDel ? 'Confirm' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── module ─────────────────────────

export function WirePulls({ user, flash }: { user: SessionUser; flash: (m: string) => void }) {
  const canSubmit = user.role !== 'prefab';
  const canWork = user.role !== 'foreman';
  const isAdmin = user.role === 'admin';

  const [mode, setMode] = useState<'new' | 'list'>(canSubmit ? 'new' : 'list');
  const [sheets, setSheets] = useState<WirePullSheet[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [printId, setPrintId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { sheets } = await api.listWirePulls();
      setSheets(sheets);
      setLoadErr('');
    } catch (e: any) {
      setLoadErr(e.message || 'Could not load wire pull sheets');
    }
  }, []);

  // Load now, then keep fresh while someone leaves the tab open (same cadence
  // as the queue).
  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [load]);

  // Print one sheet at a time: show only that card, open the dialog, and
  // restore the full list when it closes.
  useEffect(() => {
    if (!printId) return;
    const done = () => setPrintId(null);
    window.addEventListener('afterprint', done);
    const t = window.setTimeout(() => window.print(), 60);
    return () => { window.removeEventListener('afterprint', done); window.clearTimeout(t); };
  }, [printId]);

  const advance = async (id: string) => {
    const s = sheets.find(x => x.id === id);
    if (!s) return;
    const next = WP_STATUSES[Math.min(WP_STATUSES.indexOf(s.status) + 1, WP_STATUSES.length - 1)];
    try {
      const { sheet } = await api.patchWirePull(id, { status: next });
      setSheets(prev => prev.map(x => x.id === id ? sheet : x));
    } catch (e: any) { flash(e.message || 'Update failed'); }
  };
  const remove = async (id: string) => {
    try {
      await api.deleteWirePull(id);
      setSheets(prev => prev.filter(x => x.id !== id));
      flash(`${id} deleted`);
    } catch (e: any) { flash(e.message || 'Delete failed'); }
  };

  const open = sheets.filter(s => s.status !== 'Closed').length;
  const shown = printId ? sheets.filter(s => s.id === printId) : sheets;

  return (
    <div className="page-col">
      <div className="page-title-row">
        <h1 className="page-title">Wire pulls</h1>
        <span className="page-cap">Circuit footages → wire colors</span>
      </div>

      {canSubmit && (
        <div className="wp-modebar noprint">
          <button className={'chip' + (mode === 'new' ? ' sel' : '')} onClick={() => setMode('new')}>New panel sheet</button>
          <button className={'chip' + (mode === 'list' ? ' sel' : '')} onClick={() => setMode('list')}>
            {canWork ? `All sheets (${open} open)` : `My sheets (${sheets.length})`}
          </button>
        </div>
      )}

      {mode === 'new' && canSubmit && (
        <SheetForm user={user} flash={flash} onSubmitted={() => { load(); setMode('list'); }} />
      )}

      {mode === 'list' && (
        <>
          {!canSubmit && <div className="page-cap" style={{ marginTop: 14 }}>{open} open · {sheets.length} total</div>}
          {printId && (
            <div className="noprint" style={{ marginTop: 14 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPrintId(null)}>← Show all sheets</button>
            </div>
          )}
          {loadErr && <div className="login-err" style={{ marginTop: 14 }}>{loadErr}</div>}
          {!loadErr && sheets.length === 0 && (
            <div className="empty-card">
              <div className="t">{canSubmit ? 'No wire pull sheets yet' : 'No wire pulls waiting'}</div>
              <div className="s">
                {canSubmit
                  ? 'Fill out a panel sheet and it will show up here with its status.'
                  : 'Panel sheets from the field land here with the wire colors worked out.'}
              </div>
            </div>
          )}
          {shown.map(s => (
            <SheetCard key={s.id} sheet={s} canWork={canWork} isAdmin={isAdmin}
              startOpen={printId === s.id}
              onAdvance={advance} onDelete={remove} onPrint={setPrintId} />
          ))}
        </>
      )}
    </div>
  );
}
