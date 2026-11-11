import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDate, type SessionUser } from '../data/model';
import { StatusTag, PrioTag } from '../lib/ui';
import { api } from '../lib/api';
import { WiremoldFigure } from './WiremoldDiagram';
import {
  FEED_ENDS, DEVICE_COLORS, WIRE_COLORS, WIRE_TYPES, WIRE_SIZES, ROLES, WIRE_PRESETS, WM_STATUSES,
  SERIES, CHANNELS, DEVICE_TYPES, MEASURES, PLACES, MAX_DEVICES, MAX_CONDUCTORS, MAX_BUILDS,
  seriesDef, seriesLabel, fillBuild, isDeviceType, isPlace, conductorLength,
  deviceColor, wireColor, resolveDraft, emptyBuildDraft, ticketTotals, layoutBuild, formatLength,
  fmtFeetDecimal, sizeLabel, isDeviceColor, isRole, isWireColor, wireLengthText,
  type BuildDraft, type DraftResult, type WiremoldBuild, type WiremoldTicket, type TicketTotals, type WireRole,
  type DeviceType, type Place
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
  !d.label.trim() && !d.length.trim() && !d.devices.trim() && !d.spacing.trim() && !d.start.trim()
  && !(d.whip || '').trim() && !(d.gaps || []).some(g => (g || '').trim()) && !d.series;

// A long ticket shouldn't be lost to a dropped tab or a locked phone. Same
// per-user, per-device draft idea the catalog cart uses.
const DRAFT_KEY = 'dinto-wiremold-draft-v1';
function cleanBuildDraft(raw: any): BuildDraft {
  const base = emptyBuildDraft();
  if (!raw || typeof raw !== 'object') return base;
  const d: BuildDraft = { ...base, ...raw };
  d.colors = Array.isArray(raw.colors) ? raw.colors.map((c: unknown) => (isDeviceColor(c) ? c : '')) : [];
  // fields added later — drafts saved before them simply don't have them
  d.gaps = Array.isArray(raw.gaps) ? raw.gaps.map((g: unknown) => (typeof g === 'string' ? g : '')) : [];
  d.eachGap = raw.eachGap === true;
  d.whip = typeof raw.whip === 'string' ? raw.whip : '';
  d.series = typeof raw.series === 'string' ? raw.series : '';
  d.channels = raw.channels === 2 ? 2 : 1;
  d.horizontal = raw.horizontal === true;
  d.deviceType = raw.deviceType === 'double' ? 'double' : 'duplex';
  d.types = Array.isArray(raw.types) ? raw.types.map((t: unknown) => (isDeviceType(t) ? t : '')) : [];
  d.place = raw.place === 'bottom' ? 'bottom' : 'top';
  d.places = Array.isArray(raw.places) ? raw.places.map((x: unknown) => (isPlace(x) ? x : '')) : [];
  d.boxDuplex = typeof raw.boxDuplex === 'string' ? raw.boxDuplex : '';
  d.boxDouble = typeof raw.boxDouble === 'string' ? raw.boxDouble : '';
  // A draft typed before spacing could be measured two ways was center to center;
  // keep it meaning what it meant. (New builds start out "between boxes".)
  d.measure = raw.measure === 'clear' || raw.measure === 'center' ? raw.measure : 'center';
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
  const gapCount = Math.max(0, deviceCount - 1);
  const ownGaps = (d.gaps || []).slice(0, gapCount).filter(g => (g || '').trim()).length;
  const between = d.measure === 'clear';
  const typeOf = (k: number): DeviceType => (isDeviceType((d.types || [])[k]) ? (d.types[k] as DeviceType) : d.deviceType);
  const isDouble = d.channels === 2;
  const allPlace: Place = d.place === 'bottom' ? 'bottom' : 'top';
  const placeOf = (k: number): Place => (isPlace((d.places || [])[k]) ? (d.places[k] as Place) : allPlace);
  const anyDouble = deviceCount > 0
    ? Array.from({ length: deviceCount }, (_, k) => typeOf(k)).includes('double')
    : d.deviceType === 'double';

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
          {/* the raceway: series, and single or double */}
          <div className="wm-pair">
            <div className="wm-f">
              <label htmlFor={`wm-ser-${n}`}>Wiremold series</label>
              <select id={`wm-ser-${n}`} aria-label={`${p} series`} value={d.series}
                onChange={ev => {
                  // a series can bring what is known about it (so far, only the Hubbell aluminum one does)
                  const def = seriesDef(ev.target.value);
                  onPatch({
                    series: ev.target.value,
                    ...(def?.channels ? { channels: def.channels } : {}),
                    ...(def?.horizontal !== undefined ? { horizontal: def.horizontal } : {})
                  });
                }}>
                <option value="">Choose a series…</option>
                {SERIES.map(x => <option key={x.v} value={x.v}>{x.label}</option>)}
              </select>
              {!d.series && res.build && <div className="wm-why">Choose the series to finish this build</div>}
            </div>
            <div className="wm-f">
              <span className="wm-lbl">Raceway</span>
              <div className="wm-seg" role="group" aria-label={`${p} raceway`}>
                {CHANNELS.map(c => (
                  <button key={c.v} type="button" aria-pressed={d.channels === c.v} className={'chip' + (d.channels === c.v ? ' sel' : '')}
                    onClick={() => onPatch({ channels: c.v })}>{c.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* a double has two channels: which one the devices sit in */}
          {isDouble && (
            <div className="wm-f">
              <span className="wm-lbl">Devices sit in</span>
              <div className="wm-seg" role="group" aria-label={`${p} device channel`}>
                {PLACES.map(x => (
                  <button key={x.v} type="button" aria-pressed={allPlace === x.v} className={'chip' + (allPlace === x.v ? ' sel' : '')}
                    onClick={() => onPatch({ place: x.v, places: [] })}>{x.label}</button>
                ))}
              </div>
              <div className="wm-help">
                Moves every device. To put some in the top and some in the bottom, use “Set the color, type and channel
                of each device” below. Wire is run in each channel that has a device.
              </div>
            </div>
          )}

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

          {/* the device boxes: duplex or double duplex, standing up or along the raceway */}
          <div className="wm-f">
            <span className="wm-lbl">Device boxes</span>
            <div className="wm-seg" role="group" aria-label={`${p} device type`}>
              {DEVICE_TYPES.map(t => (
                <button key={t.v} type="button" aria-pressed={d.deviceType === t.v} className={'chip' + (d.deviceType === t.v ? ' sel' : '')}
                  onClick={() => onPatch({ deviceType: t.v, types: [] })}>{t.label}</button>
              ))}
            </div>
            <label className="wm-check">
              <input type="checkbox" aria-label={`${p} horizontal boxes`} checked={d.horizontal}
                onChange={ev => onPatch({ horizontal: ev.target.checked })} />
              Boxes horizontal (turned to run along the raceway)
            </label>
            <div className="wm-pair wm-boxlen">
              <div>
                <span className="wm-mini">Duplex box takes</span>
                <input className="input" aria-label={`${p} duplex box length`} placeholder={res.box.duplex} autoComplete="off"
                  value={d.boxDuplex || ''} onChange={ev => onPatch({ boxDuplex: ev.target.value.slice(0, 20) })} />
              </div>
              {anyDouble && (
                <div>
                  <span className="wm-mini">Double duplex takes</span>
                  <input className="input" aria-label={`${p} double duplex box length`} placeholder={res.box.double} autoComplete="off"
                    value={d.boxDouble || ''} onChange={ev => onPatch({ boxDouble: ev.target.value.slice(0, 20) })} />
                </div>
              )}
            </div>
            {e.box && <div className="wm-why">{e.box}</div>}
            <div className="wm-help">How much of the run one box takes up. The gray number is the standard size — type over it if yours differs.</div>
          </div>

          {/* 3: spacing — one value for every gap, and each gap can have its own */}
          <div className="wm-f">
            <span className="wm-lbl">Spacing is measured</span>
            <div className="wm-seg" role="group" aria-label={`${p} spacing measure`} style={{ marginBottom: 12 }}>
              {MEASURES.map(m => (
                <button key={m.v} type="button" aria-pressed={d.measure === m.v} className={'chip' + (d.measure === m.v ? ' sel' : '')}
                  onClick={() => onPatch({ measure: m.v })}>{m.label}</button>
              ))}
            </div>
            <label htmlFor={`wm-sp-${n}`}>{between ? 'Spacing between device boxes (feet / inches)' : 'Spacing center to center (feet / inches)'}</label>
            <input id={`wm-sp-${n}`} className="input" aria-label={`${p} spacing`} placeholder={`2'-6"`} autoComplete="off"
              value={d.spacing} onChange={ev => onPatch({ spacing: ev.target.value.slice(0, 120) })} />
            {e.spacing ? <div className="wm-why">{e.spacing}</div>
              : <div className="wm-echo">{deviceCount === 1 ? 'One device — no spacing needed' : (res.echo.spacing || '') + (res.echo.alt ? ` (${res.echo.alt})` : '')}</div>}
            <div className="wm-help">
              {ownGaps
                ? 'Used for every gap that doesn’t have its own spacing below.'
                : between
                  ? 'The open raceway from the edge of one box to the edge of the next.'
                  : 'From the center of one device to the center of the next.'}
            </div>
            {gapCount > 0 && (
              <button type="button" className="wm-linkbtn" onClick={() => onPatch({ eachGap: !d.eachGap })}>
                {d.eachGap ? 'Hide the spacing of each gap' : 'Set the spacing of each gap'}
              </button>
            )}
            {d.eachGap && gapCount > 0 && (
              <>
                <div className="wm-each">
                  {Array.from({ length: gapCount }, (_, k) => (
                    <div className={'wm-each-item wm-gap' + (res.badGaps.includes(k) ? ' bad' : '')} key={k}>
                      <b>{k + 1} → {k + 2}</b>
                      <input aria-label={`${p} gap ${k + 1} spacing`} autoComplete="off"
                        placeholder={res.gapEcho[k] || '—'} value={(d.gaps || [])[k] || ''}
                        onChange={ev => {
                          const gaps = (d.gaps || []).slice();
                          while (gaps.length < gapCount) gaps.push('');
                          gaps[k] = ev.target.value.slice(0, 20);
                          onPatch({ gaps });
                        }} />
                    </div>
                  ))}
                </div>
                {e.gaps && <div className="wm-why">{e.gaps}</div>}
                <div className="wm-help">Leave a gap blank to use the main spacing (shown in gray).</div>
                {ownGaps > 0 && (
                  <button type="button" className="wm-linkbtn" onClick={() => onPatch({ gaps: [] })}>
                    Reset every gap to the main spacing
                  </button>
                )}
              </>
            )}
          </div>

          {/* where the first device sits */}
          <div className="wm-f">
            <label htmlFor={`wm-st-${n}`}>{between ? 'Raceway before the first box (optional)' : 'First device from the left end (optional)'}</label>
            <input id={`wm-st-${n}`} className="input" aria-label={`${p} first device`} placeholder="blank = centered on the run" autoComplete="off"
              value={d.start} onChange={ev => onPatch({ start: ev.target.value.slice(0, 20) })} />
            {e.start ? <div className="wm-why">{e.start}</div>
              : <div className="wm-echo">{res.echo.start
                ? (between
                  ? `${res.echo.start} before the first box${res.echo.end ? ` · ${res.echo.end} after the last` : ''}`
                  : `${res.echo.start} from the left${res.echo.end ? ` · ${res.echo.end} from the right` : ''}`)
                : ''}</div>}
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
                {d.each
                  ? (isDouble ? 'Hide the color, type and channel of each device' : 'Hide the color and type of each device')
                  : (isDouble ? 'Set the color, type and channel of each device' : 'Set the color and type of each device')}
              </button>
            )}
            {d.each && deviceCount > 0 && (
              <div className={'wm-each wide' + (isDouble ? ' wider' : '')}>
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
                      <select aria-label={`${p} device ${k + 1} type`} value={typeOf(k)}
                        onChange={ev => {
                          const types = (d.types || []).slice();
                          while (types.length < deviceCount) types.push('');
                          types[k] = ev.target.value;
                          onPatch({ types });
                        }}>
                        {DEVICE_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                      </select>
                      {isDouble && (
                        <select aria-label={`${p} device ${k + 1} channel`} value={placeOf(k)}
                          onChange={ev => {
                            const places = (d.places || []).slice();
                            while (places.length < deviceCount) places.push('');
                            places[k] = ev.target.value;
                            onPatch({ places });
                          }}>
                          {PLACES.map(x => <option key={x.v} value={x.v}>{x.v === 'top' ? 'Top' : 'Bottom'}</option>)}
                        </select>
                      )}
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

          {/* whip at the fed end — blank means the wire is end capped */}
          <div className="wm-f">
            <label htmlFor={`wm-wh-${n}`}>Whip length (optional)</label>
            <input id={`wm-wh-${n}`} className="input" aria-label={`${p} whip`} placeholder="blank = end capped" autoComplete="off"
              value={d.whip || ''} onChange={ev => onPatch({ whip: ev.target.value.slice(0, 20) })} />
            {e.whip ? <div className="wm-why">{e.whip}</div> : <div className="wm-echo">{res.echo.whip || ''}</div>}
            <div className="wm-help">A plain number is feet (6 = 6'). The whip’s length is added to every conductor.</div>
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
          : (r.errors.fit || r.errors.length || r.errors.devices || r.errors.box || r.errors.spacing || r.errors.gaps || r.errors.start || r.errors.whip || r.errors.qty || r.errors.wire || 'fill in the length, device count and spacing');
        flash(`Build ${i + 1}: ${why}`);
        return;
      }
      // Prefab can't pull material without knowing which raceway it is.
      if (!draft.builds[i].series) { flash(`Build ${i + 1}: choose the wiremold series`); return; }
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

  const incomplete = draft.builds.filter((b, i) => !isBlankBuild(b) && (!results[i].build || !b.series)).length;
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

function BuildDetail({ b: raw, n }: { b: WiremoldBuild; n: number }) {
  const b = fillBuild(raw);            // tickets sent before a field existed read as they were meant
  const lay = layoutBuild(b);
  const same = (xs: number[]) => xs.every(x => Math.abs(x - xs[0]) < 1e-9);
  const list = (xs: number[]) => (b.devices === 1 ? '—' : same(xs) ? `${formatLength(xs[0])} each` : xs.map(formatLength).join(' · '));
  const feed = FEED_ENDS.find(f => f.v === b.feed)!.label;
  const nDouble = b.deviceTypes.filter(t => t === 'double').length;
  const nDuplex = b.devices - nDouble;
  const sizeOf = (t: DeviceType) => Array.from(new Set(b.widthsIn.filter((_, i) => b.deviceTypes[i] === t))).map(formatLength).join(' / ');
  const typed = b.measure === 'clear';
  const wire = conductorLength(b);
  const nBottom = b.places.filter(x => x === 'bottom').length;
  return (
    <div className="wm-detail-build">
      <div className="wm-detail-hd">
        <span className="wm-num">{n}</span>
        <span className="t">{b.label}</span>
        {b.qty > 1 && <span className="q">× {b.qty}</span>}
      </div>
      <div className="wm-detail-grid">
        <dl className="wm-spec">
          <dt>Series</dt><dd>{seriesLabel(b.series)}</dd>
          <dt>Raceway</dt><dd>{b.channels === 2 ? 'Double (two-channel)' : 'Single'}</dd>
          {b.channels === 2 && (
            <>
              <dt>Channel</dt>
              <dd>
                {nBottom === 0 ? 'All devices in the top channel'
                  : nBottom === b.devices ? 'All devices in the bottom channel'
                    : `${b.devices - nBottom} in the top · ${nBottom} in the bottom`}
              </dd>
            </>
          )}
          <dt>Length</dt><dd>{formatLength(b.lengthIn)}</dd>
          <dt>Devices</dt>
          <dd>{b.devices} — {[nDuplex ? `${nDuplex} duplex` : '', nDouble ? `${nDouble} double duplex` : ''].filter(Boolean).join(', ')}</dd>
          <dt>Boxes</dt>
          <dd>
            {b.horizontal ? 'Horizontal (along the raceway)' : 'Standing up'}
            <div style={{ fontWeight: 400 }}>
              {[nDuplex ? `duplex ${sizeOf('duplex')}` : '', nDouble ? `double duplex ${sizeOf('double')}` : ''].filter(Boolean).join(' · ')} of the run each
            </div>
          </dd>
          <dt>{typed ? 'Between boxes' : 'Center to center'}</dt>
          <dd>{list(typed ? lay.clear : b.gapsIn)} <span className="wm-asentered">as entered</span></dd>
          <dt>{typed ? 'Center to center' : 'Between boxes'}</dt>
          <dd style={{ fontWeight: 400 }}>{list(typed ? b.gapsIn : lay.clear)}</dd>
          <dt>First box</dt>
          <dd>starts {formatLength(lay.leadIn)} from the left end{b.startIn === null ? ' (centered)' : ''}</dd>
          <dt>Last box</dt><dd>ends {formatLength(lay.tailIn)} from the right end</dd>
          <dt>Fed from</dt><dd>{feed}</dd>
          <dt>Whip</dt>
          <dd>{b.whipIn ? `${formatLength(b.whipIn)}${b.feed === 'both' ? ' at each end' : ''}` : 'None — wire end capped'}</dd>
          <dt>Wire</dt><dd>{sizeLabel(b.wire.size)} {b.wire.type}</dd>
          <dt>Conductors</dt>
          <dd>
            {b.wire.conductors.map((c, i) => (
              <div key={i}><WireSwatch colorKey={c.color} />{c.role[0].toUpperCase() + c.role.slice(1)} · {wireColor(c.color).label}</div>
            ))}
            <div style={{ color: 'var(--color-neutral-600)', fontWeight: 400 }}>
              {wire.sets.length > 1
                ? `Cut ${b.wire.conductors.length} for each channel — ${wireLengthText(b)}`
                : `Cut ${b.wire.conductors.length} × ${wireLengthText(b)}`}{b.qty > 1 ? ` · ${b.qty} runs` : ''}
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
              <span className="p">
                {' '}{formatLength(at)} <small>to center · box {formatLength(lay.lefts[i])} to {formatLength(lay.rights[i])} from the left end</small>
              </span>
              <span className="wm-devkind">
                {b.deviceTypes[i] === 'double' ? 'Double duplex' : 'Duplex'}{b.channels === 2 ? ` · ${b.places[i] === 'bottom' ? 'Bottom' : 'Top'}` : ''}
              </span>
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
