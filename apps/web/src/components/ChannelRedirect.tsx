import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';

import { allChannelsOf, useStructure } from '../hooks/useStructure';

/** Открытие приложения: переход в первый доступный текстовый канал */
export default function ChannelRedirect() {
  const { t } = useTranslation();
  const { data: structure, isLoading } = useStructure();

  if (isLoading) return <div className="empty-state">{t('app.loading')}</div>;

  const firstText = allChannelsOf(structure).find((c) => c.type === 'TEXT');
  if (firstText) return <Navigate to={`/channels/${firstText.id}`} replace />;

  return <div className="empty-state">{t('channels.selectChannel')}</div>;
}
