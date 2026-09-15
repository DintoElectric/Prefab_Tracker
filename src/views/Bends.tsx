import { useState } from 'react';
import {
  computeBend, toFraction, emptyInput,
  BEND_SIZES, BEND_MATERIALS, BEND_TYPES, OFFSET_ANGLES,
  type BendType, type ConduitSize, type BendMaterial
} from '../data/bends';
import { BendDiagram } from './BendDiagram';

const num = (s: string) => {
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};

export function Bends() {
  const [type, setType] = useState<BendType>('offset');
  const [size, setSize] = useState<ConduitSize>('3/4');
  const [material, setMaterial] = useState<BendMaterial>('EMT');
  const [angle, setAngle] = useState<number>(30);
  const [custom, setCustom] = useState(false);
  const [customAngle, setCustomAngle] = useState('');
  const [depth, setDepth] = useState('');
  const [width, setWidth] = useState('');
  const [rise, setRise] = useState('');
  const [roll, setRoll] = useState('');
  const [runAfter, setRunAfter] = useState('');
  const [stub, setStub] = useState('');
  const [start, setStart] = useState('');
  const [notes, setNotes] = useState('');

  const rawCustom = num(customAngle);
  const effectiveAngle = custom ? (rawCustom > 0 ? Math.min(rawCustom, 90) : angle) : angle;

  const input = {
    ...emptyInput(),
    type, size, material, angle: effectiveAngle,
    depth: num(depth), width: num(width), rise: num(rise), roll: num(roll),
    runAfter: num(runAfter), stubHeight: num(stub), startInches: num(start), notes
  };
  const r = computeBend(input);
  const showAngle = type === 'offset' || type === 'rolling' || type === 'saddle4' || type === 'kick';

  const numField = (label: string, value: string, set: (v: string) => void, hint?: string) => (
    <div className="fieldblock" style={{ flex: 1, minWidth: 150 }}>
      <div className="lblrow"><span className="lbl">{label}</span></div>
      <input className="input" inputMode="decimal" placeholder="0" value={value}
        onChange={e => set(e.target.value.replace(/[^0-9.]/g, ''))} style={{ height: 48, fontSize: 15, width: '100%' }} />
      {hint && <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 5 }}>{hint}</div>}
    </div>
  );

  return (
    <div className="page-col">
      <div className="page-title-row">
        <h1 className="page-title">Bend calculator</h1>
        <span className="page-cap">Calibrated to the B2000 Cyclone</span>
      </div>

      {/* bend type */}
      <div className="fieldblock" style={{ marginTop: 18 }}>
        <div className="lblrow"><span className="lbl">Bend type</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {BEND_TYPES.map(t => (
            <button key={t.v} className={'chip' + (type === t.v ? ' sel' : '')}
              onClick={() => setType(t.v)} style={{ flexDirection: 'column', height: 'auto', padding: '10px 14px', alignItems: 'flex-start' }}>
              <span>{t.label}</span>
              <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginTop: 3, opacity: .8 }}>{t.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      {/* size + material */}
      <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <div className="fieldblock" style={{ flex: 1, minWidth: 150 }}>
          <div className="lblrow"><span className="lbl">Conduit size</span></div>
          <select className="input" value={size} onChange={e => setSize(e.target.value as ConduitSize)} style={{ height: 48, fontSize: 15, width: '100%' }}>
            {BEND_SIZES.map(s => <option key={s} value={s}>{s}"</option>)}
          </select>
        </div>
        <div className="fieldblock" style={{ flex: 1, minWidth: 150 }}>
          <div className="lblrow"><span className="lbl">Material</span></div>
          <select className="input" value={material} onChange={e => setMaterial(e.target.value as BendMaterial)} style={{ height: 48, fontSize: 15, width: '100%' }}>
            {BEND_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* type-specific inputs */}
      <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {(type === 'offset') && numField('Offset depth (in)', depth, setDepth, 'How far the run steps over')}
        {(type === 'saddle3' || type === 'saddle4') && numField('Obstruction height (in)', depth, setDepth, 'How high the hump must clear')}
        {type === 'saddle4' && numField('Obstruction width (in)', width, setWidth, 'Flat run across the top')}
        {type === 'rolling' && numField('Rise — up (in)', rise, setRise)}
        {type === 'rolling' && numField('Roll — over (in)', roll, setRoll)}
        {type === 'kick' && numField('Kick mark from end (in)', start, setStart, 'Where the bend sits')}
        {type === 'kick' && numField('Run past bend (in, optional)', runAfter, setRunAfter, 'Shows the rise gained')}
        {type === 'stub90' && numField('Finished stub height (in)', stub, setStub, 'End of pipe to back of stub')}
        {type === 'offset' && numField('First mark from end (in, optional)', start, setStart, 'Leave blank for relative marks')}
        {type === 'saddle3' && numField('Center from end (in, optional)', start, setStart, 'Leave blank for relative marks')}
        {type === 'saddle4' && numField('First bend from end (in, optional)', start, setStart, 'Leave blank for relative marks')}
      </div>

      {/* angle */}
      {showAngle && (
        <div className="fieldblock" style={{ marginTop: 18 }}>
          <div className="lblrow"><span className="lbl">Bend angle</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {OFFSET_ANGLES.map(a => (
              <button key={a} className={'chip' + (!custom && angle === a ? ' sel' : '')}
                onClick={() => { setCustom(false); setAngle(a); }}>{a}°</button>
            ))}
            <button className={'chip' + (custom ? ' sel' : '')} onClick={() => setCustom(true)}>Custom</button>
            {custom && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input className="input" inputMode="decimal" placeholder="deg" autoFocus
                  value={customAngle} onChange={e => setCustomAngle(e.target.value.replace(/[^0-9.]/g, ''))}
                  style={{ height: 44, width: 90, fontSize: 15, textAlign: 'center' }} />
                <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>° (1–90)</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* custom notes for prefab */}
      <div className="fieldblock" style={{ marginTop: 18 }}>
        <div className="lblrow"><span className="lbl">Notes for prefab (optional)</span></div>
        <textarea className="input" rows={2} placeholder="Describe anything the calculator can't cover — odd angles, field conditions, which run this is for."
          value={notes} onChange={e => setNotes(e.target.value)} style={{ fontSize: 14, width: '100%' }} />
      </div>

      {/* to-scale sketch */}
      <div style={{ marginTop: 24, background: '#fff', border: '2px solid var(--color-divider)' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--color-neutral-300)' }}>
          <div className="page-cap">Sketch — to scale</div>
        </div>
        <div style={{ padding: 12 }}>
          <BendDiagram input={input} />
        </div>
      </div>

      {/* results */}
      <div style={{ marginTop: 18, background: '#fff', border: '2px solid var(--color-divider)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-neutral-300)' }}>
          <div className="page-cap" style={{ marginBottom: 6 }}>Result</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{r.headline}</div>
        </div>

        {r.warnings.length > 0 && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-neutral-300)' }}>
            {r.warnings.map((w, i) => (
              <div key={i} style={{ color: 'var(--color-accent-700)', fontWeight: 600, fontSize: 13 }}>{w}</div>
            ))}
          </div>
        )}

        {r.marks.length > 0 && (
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-neutral-300)' }}>
            <div className="page-cap" style={{ marginBottom: 10 }}>Marks</div>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              {r.marks.map((m, i) => (
                <div key={i}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>{toFraction(m.at)}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 2 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-neutral-300)' }}>
          <div className="page-cap" style={{ marginBottom: 10 }}>How to bend it</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6 }}>
            {r.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          {r.figures.map((f, i) => (
            <div key={i}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{f.value}</div>
              <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 2 }}>{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--color-neutral-600)', lineHeight: 1.5 }}>
        Figures come from the B2000's own bend tables. The machine's degree scale is adjustable, so if a
        test bend reads a touch long or short, dial the scale to match — or tell me and I'll tune the number.
      </div>
    </div>
  );
}
