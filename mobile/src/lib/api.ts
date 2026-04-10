const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  MEMBER: 'member',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface User {
  id: string;
  auth_id?: string;
  tenant_id: string;
  role: Role;
  email: string;
}

export interface Tenant {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: User;
  tenant: Tenant | null;
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export function isMember(role: string): boolean {
  return role === ROLES.MEMBER;
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json().catch(() => ({ error: 'Unexpected server error' }));

  if (!res.ok) {
    throw new Error(body.error || 'Login failed');
  }

  return body as LoginResponse;
}

export async function apiRefresh(
  refreshToken: string,
): Promise<RefreshResponse> {
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) throw new Error('Session expired');

  return res.json();
}

export async function apiLogout(accessToken: string): Promise<void> {
  await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  }).catch(() => {});
}

export interface SignupResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export async function apiSignup(
  email: string,
  password: string,
  tenantId: string,
): Promise<SignupResponse> {
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenant_id: tenantId }),
  });

  const body = await res.json().catch(() => ({ error: 'Unexpected server error' }));

  if (!res.ok) {
    throw new Error(body.error || 'Signup failed');
  }

  return body as SignupResponse;
}

export async function apiGetMe(
  accessToken: string,
): Promise<{ user: User; tenant: Tenant | null }> {
  const res = await fetch(`${API_URL}/api/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error('Unauthorized');

  return res.json();
}

const TOKEN_KEY = 'aurafit_m_access_token';
const REFRESH_KEY = 'aurafit_m_refresh_token';
const apiJsonCache = new Map<
  string,
  {
    ts: number;
    data: unknown;
  }
>();

let refreshPromise: Promise<string> | null = null;

function cacheKey(path: string, accessToken: string) {
  return `${accessToken.slice(0, 16)}::${path}`;
}

async function silentRefresh(): Promise<string> {
  const rt = localStorage.getItem(REFRESH_KEY);
  if (!rt) throw new Error('No refresh token');

  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  });
  if (!res.ok) throw new Error('Refresh failed');

  const data: RefreshResponse = await res.json();
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_KEY, data.refresh_token);
  window.dispatchEvent(
    new CustomEvent('aurafit:token-refreshed', {
      detail: { accessToken: data.access_token, refreshToken: data.refresh_token },
    }),
  );
  return data.access_token;
}

export async function apiFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<Response> {
  const doFetch = (token: string) =>
    fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

  const res = await doFetch(accessToken);

  if (res.status === 401) {
    if (!refreshPromise) {
      refreshPromise = silentRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    try {
      const newToken = await refreshPromise;
      return doFetch(newToken);
    } catch {
      /* refresh failed — return original 401 */
    }
  }

  return res;
}

export function getApiCache<T>(
  path: string,
  accessToken: string,
  ttlMs = 30000,
): { data: T; isStale: boolean; ageMs: number } | null {
  const hit = apiJsonCache.get(cacheKey(path, accessToken));
  if (!hit) return null;

  const ageMs = Date.now() - hit.ts;
  return {
    data: hit.data as T,
    isStale: ageMs > ttlMs,
    ageMs,
  };
}

export function invalidateApiCache(pathPrefix: string, accessToken?: string) {
  for (const key of apiJsonCache.keys()) {
    const tokenPart = accessToken ? `${accessToken.slice(0, 16)}::` : '';
    const needsTokenMatch = accessToken ? key.startsWith(tokenPart) : true;
    const pathPart = key.split('::')[1] ?? '';
    if (needsTokenMatch && pathPart.startsWith(pathPrefix)) {
      apiJsonCache.delete(key);
    }
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetchJson<T>(
  path: string,
  accessToken: string,
  options: {
    timeoutMs?: number;
    retries?: number;
    forceRefresh?: boolean;
    cacheTtlMs?: number;
  } = {},
): Promise<T> {
  const {
    timeoutMs = 10000,
    retries = 1,
    forceRefresh = false,
    cacheTtlMs = 30000,
  } = options;

  if (!forceRefresh) {
    const cached = getApiCache<T>(path, accessToken, cacheTtlMs);
    if (cached && !cached.isStale) return cached.data;
  }

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    try {
      const res = await fetchWithTimeout(
        `${API_URL}${path}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        timeoutMs,
      );

      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 300 * attempt));
          continue;
        }
        throw new Error(`Request failed: ${res.status}`);
      }

      const data = (await res.json()) as T;
      apiJsonCache.set(cacheKey(path, accessToken), { ts: Date.now(), data });
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      attempt += 1;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Request failed');
}
