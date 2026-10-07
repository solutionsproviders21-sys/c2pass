'use client';

/** Fetch wrapper: JSON, bearer token, transparent refresh-token rotation, typed errors. */

const STORAGE_KEY = 'c2pass.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

let session: Session | null = null;
let loaded = false;
const listeners = new Set<(s: Session | null) => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    session = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    session = null;
  }
}

export function getSession() {
  load();
  return session;
}

export function setSession(next: Session | null) {
  session = next;
  loaded = true;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: keep the session in memory */
  }
  listeners.forEach((l) => l(next));
}

export function onSessionChange(listener: (s: Session | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let refreshing: Promise<boolean> | null = null;
function refresh(): Promise<boolean> {
  const s = getSession();
  if (!s) return Promise.resolve(false);
  refreshing ??= (async () => {
    const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
    if (!res.ok) {
      setSession(null);
      return false;
    }
    setSession((await res.json()) as Session);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const s = getSession();
  const headers: Record<string, string> = {};
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (s) headers.Authorization = `Bearer ${s.accessToken}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  if (res.status === 401 && retry && s && (await refresh())) return request<T>(method, path, body, false);
  if (res.status === 204) return undefined as T;
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? res.statusText, data?.error?.details);
  return data as T;
}

/** Authenticated GET returning the raw response (audio files). */
export async function fetchRaw(path: string, retry = true): Promise<Response> {
  const s = getSession();
  const res = await fetch(`/api${path}`, { headers: s ? { Authorization: `Bearer ${s.accessToken}` } : {} });
  if (res.status === 401 && retry && s && (await refresh())) return fetchRaw(path, false);
  if (!res.ok) {
    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json().catch(() => null) : null;
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? res.statusText);
  }
  return res;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function qs(params: Record<string, string | number | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}
