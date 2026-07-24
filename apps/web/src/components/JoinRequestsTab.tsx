import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useGuildJoinRequests, useResolveJoinRequest } from '../hooks/useGuilds';

const dateFormat = new Intl.DateTimeFormat('ru', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Вкладка «Заявки»: кто просится на сервер в режиме «по заявке» */
export default function JoinRequestsTab({ guildId }: { guildId: string }) {
  const { t } = useTranslation();
  const { data: requests } = useGuildJoinRequests(guildId, true);
  const resolve = useResolveJoinRequest(guildId);

  if (!requests || requests.length === 0) {
    return <p className="settings-hint">{t('serverSettings.noRequests')}</p>;
  }

  return (
    <>
      {requests.map((request) => (
        <div key={request.user.id} className="admin-row">
          <span className="admin-row-name">
            {request.user.displayName}
            <span className="dm-profile-username"> @{request.user.username}</span>
          </span>
          <span className="admin-row-info">
            {request.message || t('serverSettings.noMessage')} ·{' '}
            {dateFormat.format(new Date(request.createdAt))}
          </span>
          <button
            className="icon-button success"
            title={t('serverSettings.approve')}
            onClick={() => resolve.mutate({ userId: request.user.id, approve: true })}
          >
            <Check size={16} />
          </button>
          <button
            className="icon-button danger"
            title={t('serverSettings.reject')}
            onClick={() => resolve.mutate({ userId: request.user.id, approve: false })}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </>
  );
}
