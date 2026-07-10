import { Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';

import { allChannelsOf, useStructure } from '../hooks/useStructure';
import Composer from './Composer';
import MessageList from './MessageList';

export default function ChannelView() {
  const { t } = useTranslation();
  const { channelId } = useParams<{ channelId: string }>();
  const { data: structure, isLoading } = useStructure();

  if (!channelId) return <Navigate to="/" replace />;
  if (isLoading) return <div className="empty-state">{t('app.loading')}</div>;

  const channel = allChannelsOf(structure).find((c) => c.id === channelId);
  if (!channel || channel.type !== 'TEXT') return <Navigate to="/" replace />;

  return (
    <div className="channel-view">
      <header className="channel-header">
        <Hash size={18} />
        {channel.name}
        {channel.topic && <span className="topic">— {channel.topic}</span>}
      </header>
      <MessageList channelId={channel.id} />
      <Composer channelId={channel.id} channelName={channel.name} />
    </div>
  );
}
