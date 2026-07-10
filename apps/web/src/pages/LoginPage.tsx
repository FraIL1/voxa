import { loginSchema } from '@voxa/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';

import { login } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';

export default function LoginPage() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'authed') return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('auth.genericError'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(parsed.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={(e) => void onSubmit(e)}>
        <h1>
          <span className="brand">{t('app.name')}</span> — {t('auth.loginTitle')}
        </h1>
        <label>
          {t('auth.username')}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <p className="auth-error">{error}</p>
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? t('auth.working') : t('auth.loginButton')}
        </button>
        <p className="auth-switch">
          {t('auth.noAccount')} <Link to="/register">{t('auth.registerLink')}</Link>
        </p>
      </form>
    </div>
  );
}
