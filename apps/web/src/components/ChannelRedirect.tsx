import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';

import { allChannelsOf, useStructure } from '../hooks/useStructure';

/** Открытие сервера: переход в первый доступный текстовый канал */
export default function ChannelRedirect() {
  const { t } = useTranslation();
  const { guildId } = useParams<{ guildId: string }>();
  const { data: structure, isLoading } = useStructure(guildId);

  if (isLoading) return <div className="empty-state">{t('app.loading')}</div>;

  const firstText = allChannelsOf(structure).find((c) => c.type === 'TEXT');
  if (firstText) {
    return <Navigate to={`/guilds/${guildId}/channels/${firstText.id}`} replace />;
  }

  return <div className="empty-state">{t('channels.selectChannel')}</div>;
}
