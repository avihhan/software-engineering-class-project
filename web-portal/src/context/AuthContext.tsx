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
  apiLogin,
  apiSignup,
  apiLogout,
  apiGetMe,
  apiRefresh,
  apiRegisterTenant,
  isOwnerOrAbove,
  isSuperAdmin,
  isMember,
} from '../lib/api';

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  accessToken: string | null;
  loading: boolean;
  initialized: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, tenantId: string) => Promise<void>;
  registerTenant: (
    tenantName: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  isMemberRole: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'aurafit_access_token';
const REFRESH_KEY = 'aurafit_refresh_token';

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
                accessToken: refreshed.access_token,
                loading: false,
                initialized: true,
              });
            }
            return;
          } catch {
            /* fall through to clear */
          }
        }
        clearTokens();
        if (!cancelled) {
          setState({
            user: null,
            tenant: null,
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
    async (email: string, password: string, tenantId: string) => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const data = await apiSignup(email, password, tenantId);
        persistTokens(data.access_token, data.refresh_token);

        const me = await apiGetMe(data.access_token);
        setState({
          user: me.user,
          tenant: me.tenant,
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

  const registerTenant = useCallback(
    async (tenantName: string, email: string, password: string) => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const data = await apiRegisterTenant(tenantName, email, password);
        persistTokens(data.access_token, data.refresh_token);
        setState({
          user: data.user,
          tenant: data.tenant,
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
      accessToken: null,
      loading: false,
      initialized: true,
    });
  }, [state.accessToken]);

  const role = state.user?.role ?? '';
  const isAdmin = isOwnerOrAbove(role);
  const isPlatformAdmin = isSuperAdmin(role);
  const isMemberRole = isMember(role);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        signup,
        registerTenant,
        logout,
        isAdmin,
        isPlatformAdmin,
        isMemberRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
