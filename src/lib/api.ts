import type { PrefabRequest, MaterialRow, SessionUser, Role, SpecProfile, SpecProfileLimits } from '../data/model';

export interface AccountRow {
  username: string; name: string; role: Role; active: boolean; createdAt: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as any).error || `Request failed (${res.status})`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const api = {
  me: () => call<{ user: SessionUser }>('/api/me'),
  login: (username: string, password: string) =>
    call<{ user: SessionUser }>('/api/auth', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => call<{ ok: true }>('/api/auth', { method: 'DELETE' }),
  changePassword: (current: string, next: string) =>
    call<{ ok: true }>('/api/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) }),

  listRequests: () => call<{ requests: PrefabRequest[] }>('/api/requests'),
  createRequest: (payload: {
    job: string; needBy: string; priority: string; notes: string; profileId?: string | null;
    lines: { assemblyId: string; opts: Record<string, string | string[]>; code: string; qty: number; mfgPref?: Record<string, string> }[];
  }) => call<{ request: PrefabRequest }>('/api/requests', { method: 'POST', body: JSON.stringify(payload) }),
  patchRequest: (id: string, body: object) =>
    call<{ request: PrefabRequest }>(`/api/requests/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRequest: (id: string) => call<{ ok: true }>(`/api/requests/${id}`, { method: 'DELETE' }),

  getMaterials: () => call<{ materials: Record<string, MaterialRow[]> }>('/api/materials'),
  putMaterials: (id: string, rows: MaterialRow[]) =>
    call<{ id: string; rows: MaterialRow[] }>(`/api/materials/${id}`, { method: 'PUT', body: JSON.stringify({ rows }) }),

  listUsers: () => call<{ users: AccountRow[] }>('/api/users'),
  createUser: (u: { username: string; name: string; role: Role; password: string }) =>
    call<{ user: AccountRow }>('/api/users', { method: 'POST', body: JSON.stringify(u) }),
  patchUser: (username: string, body: object) =>
    call<{ user: AccountRow }>(`/api/users/${username}`, { method: 'PATCH', body: JSON.stringify(body) }),

  listProfiles: () => call<{ profiles: SpecProfile[] }>('/api/profiles'),
  createProfile: (p: { name: string; notes?: string; limits: SpecProfileLimits; active?: boolean }) =>
    call<{ profile: SpecProfile }>('/api/profiles', { method: 'POST', body: JSON.stringify(p) }),
  putProfile: (id: string, body: { name?: string; notes?: string; limits?: SpecProfileLimits; active?: boolean }) =>
    call<{ profile: SpecProfile }>(`/api/profiles/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteProfile: (id: string) => call<{ ok: true }>(`/api/profiles/${id}`, { method: 'DELETE' })
};
