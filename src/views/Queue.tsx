import { useState } from 'react';
import { STATUSES, itemOf, fmtDate, pieces, type PrefabRequest } from '../data/model';
import { StatusTag, PrioTag } from '../lib/ui';

export function Queue({ requests, isAdmin, onAdvance, onDelete, onTicket }: {
  requests: PrefabRequest[];
  isAdmin: boolean;
  onAdvance: (id: string) => void;
  onDelete: (id: string) => void;
  onTicket: (id: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const open = requests.filter(r => r.status !== 'Closed').length;

  return (
    <div className="queue-col">
      <div className="page-title-row">
        <h1 className="page-title">Incoming queue</h1>
        <span className="page-cap">{open} open · {requests.length} total</span>
      </div>
      {requests.length === 0 ? (
        <div className="empty-card">
          <div className="t">The queue is clear</div>
          <div className="s">Submitted requests from the field land here.</div>
        </div>
      ) : (
        <div className="tbl-scroll">
          <table className="queue-table">
            <thead>
              <tr>
                <th style={{ width: 104 }}>Req</th>
                <th style={{ minWidth: 260 }}>Job</th>
                <th style={{ width: 126 }}>Foreman</th>
                <th style={{ width: 104 }}>Needed</th>
                <th style={{ width: 82 }}>Pieces</th>
                <th style={{ width: 108 }}>Priority</th>
                <th style={{ width: 124 }}>Status</th>
                <th style={{ width: 226 }} />
              </tr>
            </thead>
            <tbody>
              {requests.map(r => {
                const full = r.lines.map(l => `${l.qty}× ${itemOf(l.assemblyId)?.title || l.assemblyId}`).join(' · ');
                const summary = full.length > 96 ? full.slice(0, 96) + '…' : full;
                const next = STATUSES[Math.min(STATUSES.indexOf(r.status) + 1, STATUSES.length - 1)];
                const closed = r.status === 'Closed';
                return (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td className="job">
                      <div className="n">{r.job}</div>
                      <div className="s">{summary}</div>
                    </td>
                    <td>{r.by.replace(/ — .*$/, '')}</td>
                    <td>{fmtDate(r.needBy)}</td>
                    <td>{pieces(r)}</td>
                    <td><PrioTag p={r.priority} /></td>
                    <td><StatusTag s={r.status} /></td>
                    <td>
                      <div className="q-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => onTicket(r.id)}>Build ticket</button>
                        {closed
                          ? <span className="q-complete">Complete</span>
                          : <button className="btn btn-primary btn-sm btn-adv" onClick={() => onAdvance(r.id)}>→ {next}</button>}
                        {isAdmin && (
                          <button
                            className={'btn btn-secondary btn-sm btn-del' + (confirmDel === r.id ? ' confirm' : '')}
                            onClick={() => {
                              if (confirmDel === r.id) { setConfirmDel(null); onDelete(r.id); }
                              else setConfirmDel(r.id);
                            }}
                            onBlur={() => { if (confirmDel === r.id) setConfirmDel(null); }}>
                            {confirmDel === r.id ? 'Confirm' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
