import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../lib/api';

const MOBILE_APP_URL = import.meta.env.VITE_MOBILE_URL || 'http://localhost:3001';

type Mode = 'login' | 'signup' | 'register';

export default function Login() {
  const { login, signup, registerTenant, user, loading, initialized } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState('');

  if (!initialized) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p style={{ textAlign: 'center', color: '#94a3b8' }}>
            Loading&hellip;
          </p>
        </div>
      </div>
    );
  }

  if (user) {
    if (user.role === ROLES.MEMBER) {
      window.location.href = MOBILE_APP_URL;
      return null;
    }
    if (user.role === ROLES.SUPER_ADMIN) {
      return <Navigate to="/platform-admin/dashboard" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else if (mode === 'signup') {
        if (!registrationCode.trim()) {
          setError('Please enter your 6-digit registration code.');
          return;
        }
        if (!/^\d{6}$/.test(registrationCode.trim())) {
          setError('Registration code must be 6 digits.');
          return;
        }
        await signup(email.trim(), password, registrationCode.trim());
      } else {
        if (!tenantName.trim()) {
          setError('Please enter your organization name.');
          return;
        }
        await registerTenant(tenantName.trim(), email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const subtitle =
    mode === 'login'
      ? 'Sign in to your account'
      : mode === 'signup'
        ? 'Join an existing organization'
        : 'Create your fitness brand';

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">A</div>
          <h1>AuraFit</h1>
          <p>{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="tenantName">Organization Name</label>
              <input
                id="tenantName"
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="e.g. FitStudio Pro"
                disabled={loading}
                autoFocus
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus={mode !== 'register'}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === 'login' ? 'Enter your password' : 'Create a password'
              }
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              disabled={loading}
            />
          </div>

          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="registrationCode">Registration Code</label>
              <input
                id="registrationCode"
                type="text"
                value={registrationCode}
                onChange={(e) =>
                  setRegistrationCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))
                }
                placeholder="6-digit code from your coach or gym"
                inputMode="numeric"
                pattern="\d{6}"
                disabled={loading}
              />
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading
              ? mode === 'login'
                ? 'Signing in\u2026'
                : mode === 'signup'
                  ? 'Creating account\u2026'
                  : 'Setting up\u2026'
              : mode === 'login'
                ? 'Sign In'
                : mode === 'signup'
                  ? 'Create Account'
                  : 'Create Organization'}
          </button>
        </form>

        <div className="login-toggle-group">
          {mode === 'login' && (
            <>
              <p className="login-toggle">
                Don&rsquo;t have an account?{' '}
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => switchMode('signup')}
                  disabled={loading}
                >
                  Sign Up
                </button>
              </p>
              <p className="login-toggle">
                Want to create a fitness brand?{' '}
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => switchMode('register')}
                  disabled={loading}
                >
                  Register as Creator
                </button>
              </p>
            </>
          )}
          {mode === 'signup' && (
            <p className="login-toggle">
              Already have an account?{' '}
              <button
                type="button"
                className="toggle-btn"
                onClick={() => switchMode('login')}
                disabled={loading}
              >
                Sign In
              </button>
            </p>
          )}
          {mode === 'register' && (
            <p className="login-toggle">
              Already have an account?{' '}
              <button
                type="button"
                className="toggle-btn"
                onClick={() => switchMode('login')}
                disabled={loading}
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
