import { profileIdsOf, joinProfileIds, resolveProfile, specConflicts, type SpecProfile } from '../data/model';

// Job spec checkboxes. Each active profile gets a checkbox; every checked
// profile applies at once and the configurator is limited to what ALL of them
// allow. `profileId` is the checked ids joined with '+', or null for none.
export function SpecChecks({ profiles, profileId, onChange }: {
  profiles: SpecProfile[];
  profileId: string | null;
  onChange: (id: string | null) => void;
}) {
  const active = profiles.filter(p => p.active);
  const checked = profileIdsOf(profileId).filter(id => active.some(p => p.id === id));
  const toggle = (id: string) => {
    const next = checked.includes(id) ? checked.filter(x => x !== id) : checked.concat([id]);
    onChange(joinProfileIds(next, active));
  };
  const clashes = specConflicts(resolveProfile(profiles, profileId));

  return (
    <div className="spec-checks-wrap">
      <div className="spec-checks" role="group" aria-label="Job spec profiles">
        {active.map(p => {
          const on = checked.includes(p.id);
          return (
            <label key={p.id} className={'spec-check' + (on ? ' on' : '')}>
              <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
              <span>{p.name}</span>
            </label>
          );
        })}
      </div>
      {clashes.length > 0 && (
        <div className="spec-warn" role="alert">
          The checked specs have no approved option in common for {clashes.join(', ')}.
          Uncheck one spec before submitting.
        </div>
      )}
    </div>
  );
}
