import { Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';

import { allChannelsOf, useStructure } from '../hooks/useStructure';
import Composer from './Composer';
import MessageList from './MessageList';
import TypingIndicator from './TypingIndicator';
import VoiceView from './VoiceView';

export default function ChannelView() {
  const { t } = useTranslation();
  const { channelId } = useParams<{ channelId: string }>();
  const { data: structure, isLoading } = useStructure();

  if (!channelId) return <Navigate to="/" replace />;
  if (isLoading) return <div className="empty-state">{t('app.loading')}</div>;

  const channel = allChannelsOf(structure).find((c) => c.id === channelId);
  if (!channel) return <Navigate to="/" replace />;
  if (channel.type === 'VOICE') return <VoiceView channel={channel} />;

  return (
    <div className="channel-view">
      <header className="channel-header">
        <Hash size={18} />
        {channel.name}
        {channel.topic && <span className="topic">— {channel.topic}</span>}
      </header>
      <MessageList channelId={channel.id} />
      <TypingIndicator channelId={channel.id} />
      <Composer channelId={channel.id} channelName={channel.name} />
    </div>
  );
}
