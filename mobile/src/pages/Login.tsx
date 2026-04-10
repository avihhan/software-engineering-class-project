import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, signup, user, loading, initialized } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [error, setError] = useState('');

  if (!initialized) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="login-loading">Loading&hellip;</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const isLogin = mode === 'login';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    if (!isLogin && !registrationCode.trim()) {
      setError('Please enter your 6-digit registration code.');
      return;
    }

    if (!isLogin && !/^\d{6}$/.test(registrationCode.trim())) {
      setError('Registration code must be 6 digits.');
      return;
    }

    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await signup(email.trim(), password, registrationCode.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">A</div>
          <h1>AuraFit</h1>
          <p>{isLogin ? 'Welcome back' : 'Create your account'}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              autoFocus
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
              placeholder={isLogin ? 'Your password' : 'Create a password'}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              disabled={loading}
            />
          </div>

          {!isLogin && (
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
              ? isLogin
                ? 'Signing in\u2026'
                : 'Creating account\u2026'
              : isLogin
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        <p className="login-toggle">
          {isLogin ? "Don\u2019t have an account? " : 'Already have an account? '}
          <button
            type="button"
            className="toggle-btn"
            onClick={() => {
              setMode(isLogin ? 'signup' : 'login');
              setError('');
            }}
            disabled={loading}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}
