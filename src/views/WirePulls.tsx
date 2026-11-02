import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate, type SessionUser } from '../data/model';
import { StatusTag, PrioTag } from '../lib/ui';
import { api } from '../lib/api';
import {
  SYSTEMS, DEFAULT_SYSTEM, MAX_CIRCUIT, WP_STATUSES,
  systemDef, phaseColor, parseCircuits, parseFootages, wiresFor, checkBoxRows, buildReport, fmtFeet,
  type VoltageSystem, type BoxRow, type BoxInput, type WirePullSheet, type SheetReport, type WireColor
} from '../data/wirepulls';
import '../styles/wirepulls.css';

// ───────────────────────── shared bits ─────────────────────────

const NOT_A_CIRCUIT: WireColor = { key: 'x', label: 'Not a circuit', short: '?', hex: '#d7d3d3', ink: '#201e1d' };
const colorFor = (circuit: number, system: VoltageSystem): WireColor =>
  circuit >= 1 && circuit <= MAX_CIRCUIT ? phaseColor(circuit, system) : NOT_A_CIRCUIT;

function Swatch({ color }: { color: WireColor }) {
  return <span className="wp-swatch" style={{ background: color.hex }} aria-hidden="true" />;
}

// The report Harry cuts from: for each BOX, each wire color in it — which
// circuits (one run each), how many wires, how many feet.
function ReportTable({ report }: { report: SheetReport }) {
  if (!report.boxes.length) {
    return <div className="wp-empty-note">List a box with its circuits and footage and the wire to cut shows up here, box by box.</div>;
  }
  return (
    <table className="wp-rpt">
      <thead>
        <tr>
          <th style={{ width: 150 }}>Box</th>
          <th style={{ width: 130 }}>Color</th>
          <th>Runs (circuit · length)</th>
          <th className="num" style={{ width: 80 }}>Wires</th>
          <th className="num" style={{ width: 120 }}>Feet</th>
        </tr>
      </thead>
      <tbody>
        {report.boxes.map((b, bi) => b.groups.map((g, gi) => (
          <tr key={`${bi}-${gi}`} className={gi === 0 ? 'box-start' : ''}>
            {gi === 0 && (
              <td className="box" rowSpan={b.groups.length}>
                <div className="b">Box {b.box}</div>
                <div className="s">{b.feet ? fmtFeet(b.feet) : 'no footage yet'}</div>
              </td>
            )}
            <td><Swatch color={g.color} />{g.color.label}</td>
            <td className="circs">
              {g.wires.map((w, i) => (
                <span key={i} className={'wp-run' + (w.footage === null ? ' none' : '')}>
                  <b>{w.circuit}</b>{w.footage === null ? 'no footage' : fmtFeet(w.footage)}
                </span>
              ))}
            </td>
            <td className="num">{g.wires.length}</td>
            <td className="num">{g.feet ? fmtFeet(g.feet) : '—'}</td>
          </tr>
        )))}
      </tbody>
    </table>
  );
}

function TotalsTable({ report }: { report: SheetReport }) {
  if (!report.totals.length) return null;
  return (
    <table className="wp-rpt">
      <thead>
        <tr>
          <th>All boxes together</th>
          <th className="num" style={{ width: 80 }}>Wires</th>
          <th className="num" style={{ width: 120 }}>Feet</th>
        </tr>
      </thead>
      <tbody>
        {report.totals.map(t => (
          <tr key={t.phase}>
            <td><Swatch color={t.color} />{t.color.label}</td>
            <td className="num">{t.wires}</td>
            <td className="num">{t.feet ? fmtFeet(t.feet) : '—'}</td>
          </tr>
        ))}
        <tr className="total">
          <td>Total</td>
          <td className="num">{report.wires}</td>
          <td className="num">{fmtFeet(report.feet)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ───────────────────────── circuits field ─────────────────────────
//
// Type 3 then a comma (or space, period, Enter, or just tap away) and the 3
// becomes a red chip inside the field. The number you're still typing is
// colored too, so you see its wire color the moment it's a valid circuit.
// The value stays a plain string ("3, 4, 9, 14") so drafts and the checker
// work on exactly what's on screen.

function CircuitsField({ value, onChange, system, label }: {
  value: string; onChange: (v: string) => void; system: VoltageSystem; label: string;
}) {
  const [pending, setPending] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tokens = parseCircuits(value).circuits;
  const join = (nums: number[]) => nums.join(', ');

  const commitPending = () => {
    if (!pending) return;
    onChange(join([...tokens, parseInt(pending, 10)]));
    setPending('');
  };

  const handleChange = (raw: string) => {
    // Digits plus the separators foremen use. "." counts as a separator so the
    // tablet's number pad (which has a period, not a comma) works.
    const cleaned = raw.replace(/[^0-9,.;\s]/g, '');
    const parts = cleaned.split(/[\s,.;]+/);
    const typing = (parts.pop() ?? '').slice(0, 3);
    const done = parts.filter(Boolean).map(p => parseInt(p.slice(0, 3), 10));
    setPending(typing);
    if (done.length) onChange(join([...tokens, ...done]));
  };

  const pendingNum = pending ? parseInt(pending, 10) : 0;
  const live = pending ? colorFor(pendingNum, system) : null;

  return (
    <div className="wp-circ-field" onClick={() => inputRef.current?.focus()}>
      {tokens.map((c, i) => {
        const col = colorFor(c, system);
        return (
          <span key={i} className="wp-chip" style={{ background: col.hex, color: col.ink }} title={col.label}>
            <span className="n">{c}</span>
            <span className="ph">{col.short}</span>
            <button type="button" className="x" aria-label={`Remove circuit ${c}`}
              onClick={e => { e.stopPropagation(); onChange(join(tokens.filter((_, j) => j !== i))); }}>×</button>
          </span>
        );
      })}
      <input ref={inputRef} aria-label={label} inputMode="decimal" autoComplete="off"
        placeholder={tokens.length ? '' : 'e.g. 3, 4, 9, 14'}
        className={live ? 'live' : ''}
        style={live ? { background: live.hex, color: live.ink } : undefined}
        value={pending}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commitPending(); }
          else if (e.key === 'Backspace' && !pending && tokens.length) {
            // Back into the last number to fix it, like deleting a tag.
            e.preventDefault();
            onChange(join(tokens.slice(0, -1)));
            setPending(String(tokens[tokens.length - 1]));
          }
        }}
        onBlur={commitPending} />
    </div>
  );
}

// ───────────────────────── foreman sheet ─────────────────────────

interface BoxDraft { box: string; circuits: string; footage: string; }
const blankRow = (): BoxDraft => ({ box: '', circuits: '', footage: '' });
const isBlank = (r: BoxDraft) => !r.box.trim() && !r.circuits.trim() && !r.footage.trim();
const withTrailingBlank = (rows: BoxDraft[]): BoxDraft[] =>
  rows.length && isBlank(rows[rows.length - 1]) ? rows : [...rows, blankRow()];
const START_ROWS = 6;

interface Draft {
  job: string; floor: string; panel: string; system: VoltageSystem;
  needBy: string; priority: 'Standard' | 'Hot'; notes: string; rows: BoxDraft[];
}
const emptyDraft = (): Draft => ({
  job: '', floor: '', panel: '', system: DEFAULT_SYSTEM, needBy: '', priority: 'Standard', notes: '',
  rows: Array.from({ length: START_ROWS }, blankRow)
});

// The sheet can be long; a foreman shouldn't lose it to a dropped tab or a
// locked phone. Same per-user, per-device draft idea the catalog cart uses.
const DRAFT_KEY = 'dinto-wirepull-draft-v2';
function loadDraft(username: string): Draft {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    const mine = all[username];
    if (mine && typeof mine === 'object' && Array.isArray(mine.rows)) {
      const d = { ...emptyDraft(), ...mine } as Draft;
      d.rows = withTrailingBlank(d.rows.map((r: any) => ({
        box: String(r?.box ?? ''), circuits: String(r?.circuits ?? ''), footage: String(r?.footage ?? '')
      })));
      return d;
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

function SheetForm({ user, flash, onSubmitted }: {
  user: SessionUser; flash: (m: string) => void; onSubmitted: () => void;
}) {
  const [draft, setDraftState] = useState<Draft>(() => loadDraft(user.username));
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const setDraft = (d: Draft) => { setDraftState(d); saveDraft(user.username, d); };
  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setRow = (i: number, p: Partial<BoxDraft>) =>
    patch({ rows: withTrailingBlank(draft.rows.map((r, j) => j === i ? { ...r, ...p } : r)) });
  const removeRow = (i: number) =>
    patch({ rows: withTrailingBlank(draft.rows.filter((_, j) => j !== i)) });

  const { parsed, problems, valid, report } = useMemo(() => {
    const parsed: BoxInput[] = draft.rows.map(r => {
      const c = parseCircuits(r.circuits);
      const f = parseFootages(r.footage);
      return { box: r.box, circuits: c.circuits, bad: c.bad, footages: f.footages, footageBad: f.bad };
    });
    const problems = checkBoxRows(parsed);
    const valid: BoxRow[] = [];
    draft.rows.forEach((r, i) => {
      if (isBlank(r) || problems[i] !== null) return;
      valid.push({ box: r.box.trim(), wires: wiresFor(parsed[i].circuits, parsed[i].footages) });
    });
    return { parsed, problems, valid, report: buildReport(valid, draft.system) };
  }, [draft]);

  const filled = draft.rows.filter(r => !isBlank(r)).length;
  const bad = problems.filter(p => p !== null).length;

  const submit = async () => {
    if (!draft.job.trim()) { flash('Job name is required'); return; }
    if (!draft.panel.trim()) { flash('Panel name is required'); return; }
    if (!filled) { flash('List at least one box with its circuits'); return; }
    if (bad) { flash('Fix the highlighted boxes first'); return; }
    setBusy(true);
    try {
      const { sheet } = await api.createWirePull({
        job: draft.job, floor: draft.floor, panel: draft.panel, system: draft.system,
        needBy: draft.needBy, priority: draft.priority, notes: draft.notes, boxes: valid
      });
      // Foremen usually send several panels for one job, so keep the job-level
      // fields and clear only what belongs to this panel.
      setDraft({ ...draft, panel: '', notes: '', rows: emptyDraft().rows });
      flash(`${sheet.id} submitted to prefab`);
      onSubmitted();
    } catch (e: any) {
      flash(e.message || 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  const hint = bad
    ? { err: true, text: `${bad} box${bad === 1 ? '' : 'es'} need${bad === 1 ? 's' : ''} attention` }
    : valid.length
      ? {
        err: false,
        text: `${draft.panel.trim() || 'This panel'} · ${valid.length} box${valid.length === 1 ? '' : 'es'} · ${report.wires} wire${report.wires === 1 ? '' : 's'} · ${fmtFeet(report.feet)}`
          + (report.unmeasured ? ` · ${report.unmeasured} with no footage yet` : '')
      }
      : { err: false, text: 'Enter a box number, its circuits and the footage.' };

  return (
    <>
      <div className="wp-hdr">
        <div className="wp-cell">
          <label htmlFor="wp-job">Job name</label>
          <input id="wp-job" className="input" placeholder="e.g. Yale OML"
            value={draft.job} onChange={e => patch({ job: e.target.value })} />
        </div>
        <div className="wp-cell">
          <label htmlFor="wp-need">Date needed</label>
          <input id="wp-need" className="input" type="date" value={draft.needBy}
            onChange={e => patch({ needBy: e.target.value })} />
        </div>
        <div className="wp-cell">
          <label htmlFor="wp-floor">Floor</label>
          <input id="wp-floor" className="input" placeholder="e.g. 4"
            value={draft.floor} onChange={e => patch({ floor: e.target.value })} />
        </div>
        <div className="wp-cell">
          <label htmlFor="wp-panel">Panel</label>
          <input id="wp-panel" className="input" placeholder="e.g. PP4-2"
            value={draft.panel} onChange={e => patch({ panel: e.target.value })} />
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
        <div className="wp-cell">
          <span className="wp-lbl">Voltage — sets the wire colors</span>
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
          <textarea id="wp-notes" className="input" rows={2} placeholder="Label each wire with its circuit number."
            value={draft.notes} onChange={e => patch({ notes: e.target.value })} />
        </div>
      </div>

      <div className="wp-tbl-scroll">
        <table className="wp-box-tbl">
          <thead>
            <tr>
              <th style={{ width: 120 }}>Box #</th>
              <th>Circuits</th>
              <th style={{ width: 190 }}>Footage</th>
              <th style={{ width: 54 }} />
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((r, i) => {
              const why = problems[i];
              const p = parsed[i];
              let note = '';
              if (!why && p.circuits.length && p.footages.length) {
                const total = p.footages.length === 1 ? p.footages[0] * p.circuits.length : p.footages.reduce((a, b) => a + b, 0);
                note = p.footages.length === 1
                  ? (p.circuits.length > 1 ? `${p.circuits.length} wires × ${fmtFeet(p.footages[0])} = ${fmtFeet(total)}` : '')
                  : `one per circuit = ${fmtFeet(total)}`;
              }
              return (
                <tr key={i} className={why ? 'bad' : ''}>
                  <td className="bx">
                    <input className="input" aria-label={`Row ${i + 1} box`} placeholder="—" autoComplete="off"
                      value={r.box} onChange={e => setRow(i, { box: e.target.value.slice(0, 12) })} />
                  </td>
                  <td className="cx">
                    <CircuitsField label={`Row ${i + 1} circuits`} system={draft.system} value={r.circuits}
                      onChange={v => setRow(i, { circuits: v })} />
                    {why && <div className="why">{why}</div>}
                  </td>
                  <td className="fx">
                    <div className="wp-ft">
                      <input className="input" inputMode="decimal" aria-label={`Row ${i + 1} footage`}
                        placeholder="205" autoComplete="off" value={r.footage}
                        onChange={e => setRow(i, { footage: e.target.value.replace(/[^0-9,.;'\s]/g, '').slice(0, 40) })} />
                      <span>ft</span>
                    </div>
                    {note && <div className="wp-ft-note">{note}</div>}
                  </td>
                  <td className="rm">
                    {!isBlank(r) && (
                      <button type="button" className="btn btn-secondary btn-xs" aria-label={`Remove row ${i + 1}`}
                        onClick={() => removeRow(i)}>✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="wp-hint-row">
        Type a circuit and press comma, space or Enter — it turns into its wire color. Footage: one number
        covers every circuit in that box, or give one per circuit in the same order (205, 200, 195).
      </div>

      <div className="wp-card">
        <div className="wp-card-hd">
          <span className="t">Wire to cut</span>
          <span className="s">{valid.length} box{valid.length === 1 ? '' : 'es'} · {report.wires} wire{report.wires === 1 ? '' : 's'} · {fmtFeet(report.feet)}</span>
        </div>
        <ReportTable report={report} />
        <TotalsTable report={report} />
      </div>

      <div className="wp-foot">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Submitting…' : 'Submit to prefab'}
        </button>
        <button type="button" className={'btn btn-secondary btn-del' + (confirmClear ? ' confirm' : '')}
          onClick={() => {
            if (confirmClear) { setConfirmClear(false); patch({ rows: emptyDraft().rows }); }
            else setConfirmClear(true);
          }}
          onBlur={() => setConfirmClear(false)}>
          {confirmClear ? 'Confirm — clear all boxes' : 'Clear boxes'}
        </button>
        <span className={'hint' + (hint.err ? ' err' : '')}>{hint.text}</span>
      </div>
    </>
  );
}

// ───────────────────────── prefab list ─────────────────────────

function SheetCard({ sheet, canWork, isAdmin, startOpen, onAdvance, onDelete, onPrint }: {
  sheet: WirePullSheet; canWork: boolean; isAdmin: boolean; startOpen: boolean;
  onAdvance: (id: string) => void; onDelete: (id: string) => void; onPrint: (id: string) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [confirmDel, setConfirmDel] = useState(false);
  const report = useMemo(() => buildReport(sheet.boxes, sheet.system), [sheet]);
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
        {sheet.floor && <div><div className="k">Floor</div><div className="v">{sheet.floor}</div></div>}
        <div><div className="k">Panel</div><div className="v">{sheet.panel}</div></div>
        <div><div className="k">Voltage</div><div className="v">{systemDef(sheet.system).label}</div></div>
        <div><div className="k">Boxes</div><div className="v">{sheet.boxes.length}</div></div>
        <div><div className="k">Wires</div><div className="v">{report.wires}</div></div>
        <div><div className="k">Total wire</div><div className="v">{fmtFeet(report.feet)}</div></div>
      </div>

      {open && (
        <div className="wp-card">
          <div className="wp-card-hd">
            <span className="t">Wire to cut</span>
            <span className="s">by box, then by color</span>
          </div>
          <ReportTable report={report} />
          <TotalsTable report={report} />
          {sheet.notes.trim() && <div className="wp-notes"><strong>Notes: </strong>{sheet.notes}</div>}
        </div>
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
        <span className="page-cap">Box · circuits · footage → wire colors</span>
      </div>

      {canSubmit && (
        <div className="wp-modebar noprint">
          <button className={'chip' + (mode === 'new' ? ' sel' : '')} onClick={() => setMode('new')}>New pull sheet</button>
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
              <div className="t">{canSubmit ? 'No pull sheets yet' : 'No wire pulls waiting'}</div>
              <div className="s">
                {canSubmit
                  ? 'Fill out a pull sheet and it will show up here with its status.'
                  : 'Pull sheets from the field land here with the wire colors worked out.'}
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
