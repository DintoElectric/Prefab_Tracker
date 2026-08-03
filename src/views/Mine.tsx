import { STATUSES, itemOf, fmtDate, weekLabel, pieces, type PrefabRequest } from '../data/model';
import { StatusTag, PrioTag } from '../lib/ui';

export function Mine({ requests, isAdmin }: { requests: PrefabRequest[]; isAdmin: boolean }) {
  return (
    <div className="mine-col">
      <div className="page-title-row">
        <h1 className="page-title">{isAdmin ? 'All requests' : 'My requests'}</h1>
        <span className="page-cap">{requests.length} total</span>
      </div>
      {requests.length === 0 && (
        <div className="empty-card">
          <div className="t">No requests yet</div>
          <div className="s">Submit one from the catalog and it will show up here with its build status.</div>
        </div>
      )}
      {requests.map(r => {
        const promise = r.week ? `build week of ${weekLabel(r.week)}` : 'not yet scheduled';
        const frac = (STATUSES.indexOf(r.status) + 1) / 5;
        return (
          <div key={r.id} className="req-card">
            <div className="req-hdr">
              <span className="req-id">{r.id}</span>
              <span className="req-job">{r.job}</span>
              <StatusTag s={r.status} />
              <PrioTag p={r.priority} />
              <span className="req-right">Needed {fmtDate(r.needBy)} · {promise}</span>
            </div>
            <div className="progress"><div style={{ width: `${frac * 100}%` }} /></div>
            <div className="req-lines">
              {r.lines.map((l, i) => (
                <span key={i} className="req-line">
                  <span className="q">{l.qty}</span>
                  <span className="t">{itemOf(l.assemblyId)?.title || l.assemblyId}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
