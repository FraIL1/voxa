import type { InviteCheckDto } from '@voxa/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';

import { api } from '../api/client';
import { useJoinGuild } from '../hooks/useGuilds';
import { useAuthStore } from '../stores/auth';

/** Серверный инвайт: только для уже вошедшего пользователя — вступление на сервер. */
export default function ServerInvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const { code } = useParams<{ code: string }>();
  const joinGuild = useJoinGuild();
  const [error, setError] = useState('');

  const { data: check, isLoading } = useQuery({
    queryKey: ['inviteCheck', code],
    queryFn: () => api<InviteCheckDto>(`/invites/check/${code}`),
    enabled: status === 'authed' && Boolean(code),
  });

  if (status === 'loading') return <div className="splash">{t('app.loading')}</div>;
  // Гость по серверному инвайту не может зарегистрироваться — только войти
  if (status === 'guest') {
    return <Navigate to="/login" state={{ inviteCode: code }} replace />;
  }

  const join = (): void => {
    if (!code) return;
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
