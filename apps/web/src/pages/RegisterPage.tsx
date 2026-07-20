import { registerSchema, type InviteCheckDto } from '@voxa/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';

import { register } from '../api/auth';
import { api, ApiError } from '../api/client';
import { useJoinGuild } from '../hooks/useGuilds';
import { useAuthStore } from '../stores/auth';

/** Вошедший пользователь по ссылке-приглашению вступает на сервер */
function JoinByInvite({ code }: { code: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const joinGuild = useJoinGuild();
  const [error, setError] = useState('');

  const { data: check, isLoading } = useQuery({
    queryKey: ['inviteCheck', code],
    queryFn: () => api<InviteCheckDto>(`/invites/check/${code}`),
  });

  const join = (): void => {
    joinGuild
      .mutateAsync(code)
      .then(({ guildId }) => navigate(`/guilds/${guildId}`, { replace: true }))
      .catch((err: Error) => setError(err.message));
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>
          <span className="brand">{t('app.name')}</span> — {t('guild.joinTitle')}
        </h1>
        {isLoading && <p>{t('app.loading')}</p>}
        {check && !check.valid && <p className="auth-error">{t('guild.invalidInvite')}</p>}
        {check?.valid && (
          <>
            <p>{t('guild.joinPrompt', { name: check.guildName })}</p>
            <p className="auth-error">{error}</p>
            <button className="btn-primary" disabled={joinGuild.isPending} onClick={join}>
              {t('guild.joinButton')}
            </button>
          </>
        )}
        <p className="auth-switch">
          <Link to="/home">{t('guild.backHome')}</Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const { code } = useParams<{ code: string }>();

  const [inviteCode, setInviteCode] = useState(code ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'authed') {
    // Ссылка-приглашение для уже вошедшего — предложение вступить на сервер
    if (code) return <JoinByInvite code={code} />;
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const parsed = registerSchema.safeParse({ inviteCode, username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('auth.genericError'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await register(parsed.data);
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
          <span className="brand">{t('app.name')}</span> — {t('auth.registerTitle')}
        </h1>
        <label>
          {t('auth.inviteCode')}
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            autoFocus={!code}
          />
        </label>
        <label>
          {t('auth.username')}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus={Boolean(code)}
          />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={t('auth.passwordHint')}
          />
        </label>
        <p className="auth-error">{error}</p>
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? t('auth.working') : t('auth.registerButton')}
        </button>
        <p className="auth-switch">
          {t('auth.haveAccount')} <Link to="/login">{t('auth.loginLink')}</Link>
        </p>
      </form>
    </div>
  );
}
