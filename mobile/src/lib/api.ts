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
  billing_gate?: BillingGate;
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
  tenant: Tenant | null;
}

export interface BillingGate {
  requires_payment: boolean;
  billing_enabled: boolean;
  status: string;
  trial_ends_at: string | null;
}

export interface BillingSnapshot {
  billing_enabled: boolean;
  requires_payment: boolean;
  status: string;
  trial_days: number;
  trial_ends_at: string | null;
  now: string;
  plan: {
    name: string | null;
    description: string | null;
    offer_description: string | null;
    price_cents: number | null;
    currency: string;
    discount_type: 'none' | 'percent' | 'amount';
    discount_value: number | null;
    effective_price_cents: number;
  };
  provider: {
    name: string;
    variant_id: string | null;
  };
  checkout: {
    last_checkout_url: string | null;
    last_checkout_at: string | null;
  };
}

export interface WorkoutLog {
  id: number;
  workout_date: string;
  notes: string | null;
  created_at: string;
}

export interface WorkoutExercise {
  id: number;
  workout_log_id: number;
  exercise_name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  duration_minutes: number | null;
  rpe: number | null;
}

export interface WorkoutDetailResponse {
  workout: WorkoutLog;
  exercises: WorkoutExercise[];
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

export interface FeedComment {
  id: number;
  tenant_id: number;
  post_id: number;
  user_id: number;
  user_email?: string | null;
  body: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface NutritionTargets {
  recommended_calories: number | null;
  recommended_protein_g: number | null;
  is_estimate: boolean;
  missing_fields: string[];
  inputs_used: {
    sex: string | null;
    age_years: number | null;
    activity_level: string | null;
    goal: string | null;
    weight_lbs: number | null;
    height_inches: number | null;
  };
}

export interface NutritionLogPayload {
  logged_at: string;
  meal_type?: string | null;
  meal_items: string;
  calories: number;
  protein: number;
  carbs?: number;
  fats?: number;
}

export interface NutritionLogEntry {
  id: number;
  meal_type: string | null;
  meal_items: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  logged_at: string;
}

export interface NutritionLogsResponse {
  nutrition_logs: NutritionLogEntry[];
  targets: NutritionTargets;
}

export type FavoriteItemType = 'workout' | 'nutrition';

export interface FavoriteItem {
  id: number;
  item_type: FavoriteItemType;
  item_id: number;
  created_at: string;
  item: WorkoutLog | NutritionLogEntry;
}

export interface BodyMetricsQuestionnaire {
  sex: 'male' | 'female';
  age_years: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active';
  goal: 'lose' | 'maintain' | 'gain';
}

export interface BodyMetricsQuestionnaireResponse {
  questionnaire: BodyMetricsQuestionnaire | null;
  recommendations: NutritionTargets;
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

export async function apiGetMe(
  accessToken: string,
): Promise<{ user: User; tenant: Tenant | null; billing_gate?: BillingGate }> {
  const res = await fetch(`${API_URL}/api/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error('Unauthorized');

  return res.json();
}

export async function apiGetBillingMe(
  accessToken: string,
): Promise<BillingSnapshot> {
  const res = await apiFetch('/api/billing/me', accessToken);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.billing) {
    throw new Error(body.error || 'Unable to load billing status');
  }
  return body.billing as BillingSnapshot;
}

export async function apiCreateBillingCheckout(
  accessToken: string,
): Promise<string> {
  const res = await apiFetch('/api/billing/checkout', accessToken, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.checkout_url) {
    throw new Error(body.error || 'Unable to start checkout');
  }
  return body.checkout_url as string;
}

export async function apiCreateWorkout(
  accessToken: string,
  payload: { workout_date: string; notes?: string | null },
): Promise<WorkoutLog> {
  const res = await apiFetch('/api/workouts', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.workout) {
    throw new Error(body.error || 'Unable to create workout');
  }
  return body.workout as WorkoutLog;
}

export async function apiUpdateEmailNotifications(
  accessToken: string,
  enabled: boolean,
): Promise<boolean> {
  const res = await apiFetch('/api/users/me', accessToken, {
    method: 'PUT',
    body: JSON.stringify({ email_notifications_enabled: enabled }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.user) {
    throw new Error(body.error || 'Unable to update notifications preference');
  }
  return Boolean(body.user.email_notifications_enabled);
}

export async function apiGetWorkoutDetail(
  accessToken: string,
  workoutId: number,
): Promise<WorkoutDetailResponse> {
  const res = await apiFetch(`/api/workouts/${workoutId}`, accessToken);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.workout) {
    throw new Error(body.error || 'Unable to load workout details');
  }
  return {
    workout: body.workout as WorkoutLog,
    exercises: (body.exercises ?? []) as WorkoutExercise[],
  };
}

export async function apiAddWorkoutExercise(
  accessToken: string,
  workoutId: number,
  payload: {
    exercise_name: string;
    sets?: number;
    reps?: number;
    weight?: number;
    duration_minutes?: number;
    rpe?: number;
  },
): Promise<WorkoutExercise> {
  const res = await apiFetch(`/api/workouts/${workoutId}/exercises`, accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.exercise) {
    throw new Error(body.error || 'Unable to add exercise');
  }
  return body.exercise as WorkoutExercise;
}

export async function apiGetFeedPosts(
  accessToken: string,
): Promise<FeedPost[]> {
  const res = await apiFetch('/api/content-feed/posts', accessToken);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to load content feed');
  }
  return (body.posts ?? []) as FeedPost[];
}

export async function apiLikeFeedPost(
  accessToken: string,
  postId: number,
): Promise<void> {
  const res = await apiFetch(`/api/content-feed/posts/${postId}/likes`, accessToken, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to like post');
  }
}

export async function apiUnlikeFeedPost(
  accessToken: string,
  postId: number,
): Promise<void> {
  const res = await apiFetch(`/api/content-feed/posts/${postId}/likes/me`, accessToken, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to unlike post');
  }
}

export async function apiGetFeedComments(
  accessToken: string,
  postId: number,
): Promise<FeedComment[]> {
  const res = await apiFetch(`/api/content-feed/posts/${postId}/comments`, accessToken);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to load comments');
  }
  return (body.comments ?? []) as FeedComment[];
}

export async function apiCreateFeedComment(
  accessToken: string,
  postId: number,
  commentBody: string,
): Promise<FeedComment> {
  const res = await apiFetch(`/api/content-feed/posts/${postId}/comments`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ body: commentBody }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.comment) {
    throw new Error(body.error || 'Unable to add comment');
  }
  return body.comment as FeedComment;
}

export async function apiGetNutritionLogs(
  accessToken: string,
): Promise<NutritionLogsResponse> {
  const res = await apiFetch('/api/nutrition', accessToken);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to load nutrition logs');
  }
  return {
    nutrition_logs: (body.nutrition_logs ?? []) as NutritionLogEntry[],
    targets: (body.targets ?? {
      recommended_calories: null,
      recommended_protein_g: null,
      is_estimate: true,
      missing_fields: [],
      inputs_used: {},
    }) as NutritionTargets,
  };
}

export async function apiCreateNutritionLog(
  accessToken: string,
  payload: NutritionLogPayload,
): Promise<NutritionLogEntry> {
  const res = await apiFetch('/api/nutrition', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.nutrition_log) {
    throw new Error(body.error || 'Unable to save nutrition log');
  }
  return body.nutrition_log as NutritionLogEntry;
}

export async function apiGetBodyMetricsQuestionnaire(
  accessToken: string,
): Promise<BodyMetricsQuestionnaireResponse> {
  const res = await apiFetch('/api/body-metrics/questionnaire', accessToken);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to load questionnaire');
  }
  return body as BodyMetricsQuestionnaireResponse;
}

export async function apiUpdateBodyMetricsQuestionnaire(
  accessToken: string,
  payload: BodyMetricsQuestionnaire,
): Promise<BodyMetricsQuestionnaireResponse> {
  const res = await apiFetch('/api/body-metrics/questionnaire', accessToken, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to update questionnaire');
  }
  return body as BodyMetricsQuestionnaireResponse;
}

export async function apiGetFavoriteIds(
  accessToken: string,
): Promise<{ workout: number[]; nutrition: number[] }> {
  const res = await apiFetch('/api/favorites/items/ids', accessToken);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to load favorite ids');
  }
  return {
    workout: (body.workout ?? []) as number[],
    nutrition: (body.nutrition ?? []) as number[],
  };
}

export async function apiGetFavoriteItems(
  accessToken: string,
): Promise<FavoriteItem[]> {
  const res = await apiFetch('/api/favorites/items', accessToken);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Unable to load favorites');
  }
  return (body.favorites ?? []) as FavoriteItem[];
}

export async function apiAddFavoriteItem(
  accessToken: string,
  itemType: FavoriteItemType,
  itemId: number,
): Promise<void> {
  const res = await apiFetch('/api/favorites/items', accessToken, {
    method: 'POST',
    body: JSON.stringify({ item_type: itemType, item_id: itemId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to add favorite');
  }
}

export async function apiRemoveFavoriteItem(
  accessToken: string,
  itemType: FavoriteItemType,
  itemId: number,
): Promise<void> {
  const res = await apiFetch(`/api/favorites/items/${itemType}/${itemId}`, accessToken, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to remove favorite');
  }
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
