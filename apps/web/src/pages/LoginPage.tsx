import { loginSchema } from '@voxa/shared';
import { Eye, EyeOff, KeyRound, Sparkles, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';

import { login } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';
import AuthShield from '../components/AuthShield';

export default function LoginPage() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const logoutNotice = useAuthStore((s) => s.logoutNotice);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);

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

  const points = [
    { name: t('auth.shield1'), rest: t('auth.shield1Rest') },
    { name: t('auth.shield2'), rest: t('auth.shield2Rest') },
    { name: t('auth.shield3'), rest: t('auth.shield3Rest') },
    { name: t('auth.shield4'), rest: t('auth.shield4Rest') },
  ];

  return (
    <div className="auth-screen">
      <AuthShield
        title={t('auth.heroTitle')}
        accent={t('auth.heroAccent')}
        lead={t('auth.heroLead')}
        points={points}
      />

      <div className="auth-right">
        <form className="auth-card" onSubmit={(e) => void onSubmit(e)}>
          <h2>{t('auth.welcomeBack')}</h2>
          <p className="auth-card-hint">{t('auth.welcomeHint')}</p>

          <label>
            {t('auth.username')}
            <span className="auth-field">
              <UserRound size={15} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </span>
          </label>

          <label>
            {t('auth.password')}
            <span className="auth-field">
              <KeyRound size={15} />
              <input
                type={shown ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              {/* Показать пароль: опечатку в скрытом поле иначе не найти */}
              <button
                type="button"
                className="auth-eye"
                title={t(shown ? 'auth.hidePassword' : 'auth.showPassword')}
                onClick={() => setShown((on) => !on)}
              >
                {shown ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>

          {(error || logoutNotice) && (
            <p className="auth-error auth-error-box">
              <span className="auth-error-mark" aria-hidden>
                !
              </span>
              {error || logoutNotice}
            </p>
          )}

          <button className="btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? t('auth.working') : t('auth.loginButton')}
          </button>

          <div className="auth-or">{t('auth.or')}</div>

          <Link className="btn-secondary auth-code" to="/register">
            <Sparkles size={15} />
            {t('auth.haveCode')}
          </Link>

          <p className="auth-note">
            <span className="auth-note-mark" aria-hidden>
              i
            </span>
            {t('auth.onlyByCode')}
          </p>
        </form>
      </div>

      <p className="auth-rights">{t('auth.rights')}</p>
    </div>
  );
}
