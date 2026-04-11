import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  type User,
  type Tenant,
  type BillingGate,
  apiLogin,
  apiSignup,
  apiLogout,
  apiGetMe,
  apiRefresh,
} from '../lib/api';

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  brandingTenant: Tenant | null;
  billingGate: BillingGate | null;
  accessToken: string | null;
  loading: boolean;
  initialized: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, registrationCode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'aurafit_m_access_token';
const REFRESH_KEY = 'aurafit_m_refresh_token';
const BRANDING_KEY = 'aurafit_m_tenant_branding';
const DEFAULT_PRIMARY = '#333333';
const DEFAULT_SECONDARY = '#f5f5f5';
const DEFAULT_BACKGROUND = '#ffffff';
const DEFAULT_WIDGET_BACKGROUND = '#f5f5f5';

function persistTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function getStoredTokens() {
  return {
    accessToken: localStorage.getItem(TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
  };
}

function getStoredBrandingTenant(): Tenant | null {
  const raw = localStorage.getItem(BRANDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tenant;
  } catch {
    return null;
  }
}

function persistBrandingTenant(tenant: Tenant | null) {
  if (!tenant) return;
  localStorage.setItem(BRANDING_KEY, JSON.stringify(tenant));
}

function isHexColor(value: string | null | undefined): value is string {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value.trim()));
}

function hexToRgb(hex: string): [number, number, number] {
  const trimmed = hex.replace('#', '');
  return [
    Number.parseInt(trimmed.slice(0, 2), 16),
    Number.parseInt(trimmed.slice(2, 4), 16),
    Number.parseInt(trimmed.slice(4, 6), 16),
  ];
}

function tint(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (n: number) => Math.round(n + (255 - n) * ratio);
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
}

function applyBrandingCssVars(tenant: Tenant | null) {
  const primary = isHexColor(tenant?.primary_color) ? tenant.primary_color : DEFAULT_PRIMARY;
  const secondary = isHexColor(tenant?.secondary_color)
    ? tenant.secondary_color
    : DEFAULT_SECONDARY;
  const background = isHexColor(tenant?.background_color)
    ? tenant.background_color
    : DEFAULT_BACKGROUND;
  const widgetBg = isHexColor(tenant?.widget_background_color)
    ? tenant.widget_background_color
    : null;
  const [r, g, b] = hexToRgb(primary);
  const root = document.documentElement;
  root.style.setProperty('--tenant-primary', primary);
  root.style.setProperty('--tenant-secondary', secondary);
  root.style.setProperty('--tenant-primary-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--tenant-background', background);
  root.style.setProperty(
    '--tenant-widget-background',
    widgetBg ? widgetBg : DEFAULT_WIDGET_BACKGROUND,
  );
  root.style.setProperty('--bg', background);
  root.style.setProperty(
    '--bg-card',
    widgetBg ? widgetBg : DEFAULT_WIDGET_BACKGROUND,
  );
  root.style.setProperty('--accent', primary);
  root.style.setProperty('--accent-light', tint(primary, 0.35));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tenant: null,
    brandingTenant: getStoredBrandingTenant(),
    billingGate: null,
    accessToken: null,
    loading: false,
    initialized: false,
  });

  useEffect(() => {
    applyBrandingCssVars(state.brandingTenant);
  }, [state.brandingTenant]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { accessToken: at } = (e as CustomEvent).detail;
      persistTokens(at, (e as CustomEvent).detail.refreshToken);
      setState((s) => ({ ...s, accessToken: at }));
    };
    window.addEventListener('aurafit:token-refreshed', handler);
    return () => window.removeEventListener('aurafit:token-refreshed', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const { accessToken, refreshToken } = getStoredTokens();

      if (!accessToken) {
        if (!cancelled) setState((s) => ({ ...s, initialized: true }));
        return;
      }

      try {
        const data = await apiGetMe(accessToken);
        if (!cancelled) {
          setState((prev) => ({
            user: data.user,
            tenant: data.tenant,
            brandingTenant: data.tenant ?? prev.brandingTenant,
            billingGate: data.billing_gate ?? null,
            accessToken,
            loading: false,
            initialized: true,
          }));
          persistBrandingTenant(data.tenant ?? null);
        }
      } catch {
        if (refreshToken) {
          try {
            const refreshed = await apiRefresh(refreshToken);
            const data = await apiGetMe(refreshed.access_token);
            if (!cancelled) {
              persistTokens(refreshed.access_token, refreshed.refresh_token);
              setState((prev) => ({
                user: data.user,
                tenant: data.tenant,
                brandingTenant: data.tenant ?? prev.brandingTenant,
                billingGate: data.billing_gate ?? null,
                accessToken: refreshed.access_token,
                loading: false,
                initialized: true,
              }));
              persistBrandingTenant(data.tenant ?? null);
            }
            return;
          } catch {
            /* fall through */
          }
        }
        clearTokens();
        if (!cancelled) {
          setState((prev) => ({
            user: null,
            tenant: null,
            brandingTenant: prev.brandingTenant,
            billingGate: null,
            accessToken: null,
            loading: false,
            initialized: true,
          }));
        }
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await apiLogin(email, password);
      persistTokens(data.access_token, data.refresh_token);
      setState({
        user: data.user,
        tenant: data.tenant,
        brandingTenant: data.tenant,
        billingGate: data.billing_gate ?? null,
        accessToken: data.access_token,
        loading: false,
        initialized: true,
      });
      persistBrandingTenant(data.tenant);
    } catch (err) {
      setState((s) => ({ ...s, loading: false }));
      throw err;
    }
  }, []);

  const signup = useCallback(
    async (email: string, password: string, registrationCode: string) => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const data = await apiSignup(email, password, registrationCode);
        persistTokens(data.access_token, data.refresh_token);
        setState({
          user: data.user,
          tenant: data.tenant,
          brandingTenant: data.tenant,
          billingGate: null,
          accessToken: data.access_token,
          loading: false,
          initialized: true,
        });
        persistBrandingTenant(data.tenant);
      } catch (err) {
        setState((s) => ({ ...s, loading: false }));
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    if (state.accessToken) {
      await apiLogout(state.accessToken);
    }
    clearTokens();
    setState({
      user: null,
      tenant: null,
      brandingTenant: state.brandingTenant,
      billingGate: null,
      accessToken: null,
      loading: false,
      initialized: true,
    });
  }, [state.accessToken]);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
