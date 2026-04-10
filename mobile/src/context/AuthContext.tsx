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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tenant: null,
    billingGate: null,
    accessToken: null,
    loading: false,
    initialized: false,
  });

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
          setState({
            user: data.user,
            tenant: data.tenant,
            billingGate: data.billing_gate ?? null,
            accessToken,
            loading: false,
            initialized: true,
          });
        }
      } catch {
        if (refreshToken) {
          try {
            const refreshed = await apiRefresh(refreshToken);
            const data = await apiGetMe(refreshed.access_token);
            if (!cancelled) {
              persistTokens(refreshed.access_token, refreshed.refresh_token);
              setState({
                user: data.user,
                tenant: data.tenant,
                billingGate: data.billing_gate ?? null,
                accessToken: refreshed.access_token,
                loading: false,
                initialized: true,
              });
            }
            return;
          } catch {
            /* fall through */
          }
        }
        clearTokens();
        if (!cancelled) {
          setState({
            user: null,
            tenant: null,
            billingGate: null,
            accessToken: null,
            loading: false,
            initialized: true,
          });
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
        billingGate: data.billing_gate ?? null,
        accessToken: data.access_token,
        loading: false,
        initialized: true,
      });
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

        const me = await apiGetMe(data.access_token);
        setState({
          user: me.user,
          tenant: me.tenant,
          billingGate: me.billing_gate ?? null,
          accessToken: data.access_token,
          loading: false,
          initialized: true,
        });
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
