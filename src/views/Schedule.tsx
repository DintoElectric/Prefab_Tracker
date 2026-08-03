import { useState } from 'react';
import { STATUSES, mondayOf, iso, weekLabel, pieces, type PrefabRequest } from '../data/model';
import { StatusTag } from '../lib/ui';

export function Schedule({ requests, onSchedule, onAdvance, onTicket }: {
  requests: PrefabRequest[];
  onSchedule: (id: string, week: string | null) => void;
  onAdvance: (id: string) => void;
  onTicket: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const mon = mondayOf(new Date());
  const weeks = [0, 1, 2, 3].map(k => {
    const d = new Date(mon); d.setDate(d.getDate() + k * 7);
    const key = iso(d);
    return { key, label: (k === 0 ? 'This week · ' : k === 1 ? 'Next week · ' : '') + weekLabel(key) };
  });
  const weekKeys = weeks.map(w => w.key);
  const unscheduled = requests.filter(r => r.status !== 'Closed' && (!r.week || !weekKeys.includes(r.week)));

  const card = (r: PrefabRequest) => (
    <div key={r.id} className="sched-card" draggable
      style={{ borderLeft: `4px solid ${r.priority === 'Hot' ? 'var(--color-accent)' : 'var(--color-neutral-700)'}` }}
      onDragStart={e => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; }}>
      <div className="row1">
        <span className="mono" style={{ fontSize: 12 }}>{r.id}</span>
        <StatusTag s={r.status} />
      </div>
      <div className="job">{r.job}</div>
      <div className="meta">{pieces(r)} pcs · {r.by.replace(/ — .*$/, '')}</div>
      <div className="acts">
        <button className="btn btn-secondary btn-xs" onClick={() => onTicket(r.id)}>Ticket</button>
        {r.status !== 'Closed' && (
          <button className="btn btn-primary btn-xs" onClick={() => onAdvance(r.id)}>
            → {STATUSES[Math.min(STATUSES.indexOf(r.status) + 1, STATUSES.length - 1)]}
          </button>
        )}
      </div>
    </div>
  );

  const dropProps = (key: string | null) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dragOver !== key) setDragOver(key ?? 'unsched'); },
    onDragLeave: () => { if (dragOver === (key ?? 'unsched')) setDragOver(null); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const id = e.dataTransfer.getData('text/plain');
      if (id) onSchedule(id, key);
    }
  });

  return (
    <div className="cat-main">
      <div className="sched-hdr">
        <h2>Build schedule</h2>
        <span className="hint">Drag a request onto a build week</span>
      </div>
      <div className="sched-row">
        <div className={'sched-col unsched' + (dragOver === 'unsched' ? ' over' : '')} {...dropProps(null)}>
          <div className="sched-col-hdr">
            <span className="t">Unscheduled</span>
            <span className="load">{unscheduled.length} req</span>
          </div>
          <div className="sched-cards">{unscheduled.map(card)}</div>
        </div>
        {weeks.map(w => {
          const items = requests.filter(r => r.week === w.key && r.status !== 'Closed');
          const load = items.reduce((a, r) => a + pieces(r), 0);
          return (
            <div key={w.key} className={'sched-col week' + (dragOver === w.key ? ' over' : '')} {...dropProps(w.key)}>
              <div className="sched-col-hdr">
                <span className="t">{w.label}</span>
                <span className={'load' + (load > 120 ? ' hotload' : '')}>{load} pcs</span>
              </div>
              <div className="sched-cards">{items.map(card)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
