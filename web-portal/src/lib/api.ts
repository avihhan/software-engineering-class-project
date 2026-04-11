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
  background_color: string | null;
  widget_background_color: string | null;
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

export function isSuperAdmin(role: string): boolean {
  return role === ROLES.SUPER_ADMIN;
}

export function isOwnerOrAbove(role: string): boolean {
  return role === ROLES.OWNER || role === ROLES.SUPER_ADMIN;
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
  tenant: Tenant | null;
}

export async function apiSignup(
  email: string,
  password: string,
  registrationCode: string,
): Promise<SignupResponse> {
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, registration_code: registrationCode }),
  });

  const body = await res.json().catch(() => ({ error: 'Unexpected server error' }));

  if (!res.ok) {
    throw new Error(body.error || 'Signup failed');
  }

  return body as SignupResponse;
}

export interface RegisterTenantResponse {
  access_token: string;
  refresh_token: string;
  user: User;
  tenant: Tenant;
}

export async function apiRegisterTenant(
  tenantName: string,
  email: string,
  password: string,
): Promise<RegisterTenantResponse> {
  const res = await fetch(`${API_URL}/api/auth/register-tenant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_name: tenantName, email, password }),
  });

  const body = await res.json().catch(() => ({ error: 'Unexpected server error' }));

  if (!res.ok) {
    throw new Error(body.error || 'Registration failed');
  }

  return body as RegisterTenantResponse;
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

export interface FeedPost {
  id: number;
  tenant_id: number;
  author_user_id: number;
  author_email?: string | null;
  type: 'video' | 'article' | 'post' | 'resource';
  title: string | null;
  body: string | null;
  media_url: string | null;
  media_path: string | null;
  media_mime: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
}

export interface UploadSignResponse {
  bucket: string;
  object_path: string;
  signed_upload_url: string | null;
  token?: string | null;
  public_url: string | null;
}

export interface ClientsReportMember {
  id: number;
  email: string;
  created_at: string | null;
  workouts: {
    count: number;
    active_days: number;
    latest_date: string | null;
  };
  nutrition: {
    log_count: number;
    avg_calories: number | null;
    avg_protein_g: number | null;
  };
  body_metrics: {
    latest_weight_lbs: number | null;
    latest_body_fat_pct: number | null;
    weight_change_lbs: number | null;
  };
  goals: {
    open: number;
    completed: number;
    total: number;
  };
}

export interface ClientsReportResponse {
  tenant: {
    id: number;
    name: string;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
  };
  window: {
    start_date: string;
    end_date: string;
  };
  totals: {
    members: number;
    workouts: number;
    nutrition_logs: number;
    goals_open: number;
    goals_completed: number;
  };
  members: ClientsReportMember[];
}

export async function apiOwnerGetFeedPosts(
  accessToken: string,
): Promise<FeedPost[]> {
  const res = await apiFetch('/api/content-feed/posts?include_unpublished=true', accessToken);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to load content posts');
  }
  return (body.posts ?? []) as FeedPost[];
}

export async function apiOwnerCreateFeedPost(
  accessToken: string,
  payload: {
    type: 'video' | 'article' | 'post' | 'resource';
    title?: string | null;
    body?: string | null;
    media_url?: string | null;
    media_path?: string | null;
    media_mime?: string | null;
    is_published?: boolean;
  },
): Promise<FeedPost> {
  const res = await apiFetch('/api/content-feed/posts', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.post) {
    throw new Error(body.error || 'Unable to create post');
  }
  return body.post as FeedPost;
}

export async function apiOwnerDeleteFeedPost(
  accessToken: string,
  postId: number,
): Promise<void> {
  const res = await apiFetch(`/api/content-feed/posts/${postId}`, accessToken, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to delete post');
  }
}

export async function apiOwnerCreateUploadSignUrl(
  accessToken: string,
  filename: string,
): Promise<UploadSignResponse> {
  const res = await apiFetch('/api/content-feed/upload-sign-url', accessToken, {
    method: 'POST',
    body: JSON.stringify({ filename }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to create upload URL');
  }
  return body as UploadSignResponse;
}

export async function apiOwnerCreateBrandingLogoUploadSignUrl(
  accessToken: string,
  filename: string,
): Promise<UploadSignResponse> {
  const res = await apiFetch('/api/admin/branding/logo-upload-sign-url', accessToken, {
    method: 'POST',
    body: JSON.stringify({ filename }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to create logo upload URL');
  }
  return body as UploadSignResponse;
}

export async function apiOwnerGetClientsReport(
  accessToken: string,
  params: { startDate?: string; endDate?: string } = {},
): Promise<ClientsReportResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set('start_date', params.startDate);
  if (params.endDate) query.set('end_date', params.endDate);
  const qs = query.toString();
  const res = await apiFetch(
    `/api/admin/reports/clients${qs ? `?${qs}` : ''}`,
    accessToken,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to load clients report');
  }
  return body as ClientsReportResponse;
}

const TOKEN_KEY = 'aurafit_access_token';
const REFRESH_KEY = 'aurafit_refresh_token';

let refreshPromise: Promise<string> | null = null;

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
      const retried = await doFetch(newToken);
      if (retried.status === 401) {
        // Token refresh succeeded but backend still rejects auth (e.g. user removed/mismatch).
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        window.dispatchEvent(new CustomEvent('aurafit:auth-invalid'));
      }
      return retried;
    } catch {
      /* refresh failed — return original 401 */
    }
  }

  return res;
}
