import type { ChannelDto, ReadStateDto, VoiceParticipantDto } from '@voxa/shared';
import {
  Hash,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Volume2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router';

import { useReadStates } from '../hooks/useReadStates';
import { allChannelsOf, useStructure } from '../hooks/useStructure';
import { participantsOf, useVoiceStates } from '../hooks/useVoiceStates';
import { useAuthStore } from '../stores/auth';
import { useVoiceStore } from '../stores/voice';
import SettingsModal from './SettingsModal';

function VoiceParticipants({ participants }: { participants: VoiceParticipantDto[] }) {
  const speaking = useVoiceStore((s) => s.speaking);
  if (participants.length === 0) return null;

  return (
    <div className="voice-participants">
      {participants.map((p) => (
        <div key={p.userId} className={`voice-participant${speaking[p.userId] ? ' speaking' : ''}`}>
          <div className="avatar voice-participant-avatar" aria-hidden>
            {p.username.slice(0, 1).toUpperCase()}
          </div>
          <span className="voice-participant-name">{p.username}</span>
          {p.muted && <MicOff size={12} />}
          {p.deafened && <HeadphoneOff size={12} />}
        </div>
      ))}
    </div>
  );
}

function ChannelItem({
  channel,
  state,
  voiceParticipants,
}: {
  channel: ChannelDto;
  state?: ReadStateDto;
  voiceParticipants?: VoiceParticipantDto[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const join = useVoiceStore((s) => s.join);
  const myVoiceChannel = useVoiceStore((s) => s.channelId);

  if (channel.type === 'VOICE') {
    return (
      <div>
        <button
          className={`channel-link voice-link${myVoiceChannel === channel.id ? ' active' : ''}`}
          title={t('voice.join')}
          onClick={() => {
            void navigate(`/channels/${channel.id}`);
            void join(channel.id).catch(() => undefined);
          }}
        >
          <Volume2 size={16} />
          <span className="channel-name">{channel.name}</span>
        </button>
        <VoiceParticipants participants={voiceParticipants ?? []} />
      </div>
    );
  }

  const unread = (state?.unreadCount ?? 0) > 0;
  const mentions = state?.mentionCount ?? 0;

  return (
    <NavLink
      to={`/channels/${channel.id}`}
      className={({ isActive }) =>
        `channel-link${isActive ? ' active' : ''}${unread ? ' unread' : ''}`
      }
    >
      <Hash size={16} />
      <span className="channel-name">{channel.name}</span>
      {mentions > 0 && (
        <span className="mention-badge" title={t('channels.mentions')}>
          {mentions}
        </span>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { data: structure } = useStructure();
  const { data: readStates } = useReadStates();
  const { data: voiceStates } = useVoiceStates();
  const user = useAuthStore((s) => s.user);
  const voice = useVoiceStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const stateOf = new Map((readStates ?? []).map((s) => [s.channelId, s]));
  const voiceChannelName = voice.channelId
    ? (allChannelsOf(structure).find((c) => c.id === voice.channelId)?.name ?? '')
    : null;

  const renderChannel = (channel: ChannelDto) => (
    <ChannelItem
      key={channel.id}
      channel={channel}
      state={stateOf.get(channel.id)}
      voiceParticipants={participantsOf(voiceStates, channel.id)}
    />
  );

  return (
    <nav className="sidebar">
      <div className="sidebar-header">{t('app.communityName')}</div>

      <div className="channel-tree">
        {structure?.categories.map((category) => (
          <div key={category.id}>
            <div className="category-name">{category.name}</div>
            {category.channels.map(renderChannel)}
          </div>
        ))}
        {structure && structure.uncategorized.length > 0 && (
          <div>
            <div className="category-name">{t('channels.uncategorized')}</div>
            {structure.uncategorized.map(renderChannel)}
          </div>
        )}
      </div>

      {voice.channelId && (
        <div className="voice-panel">
          <div className="voice-panel-info">
            <Volume2 size={15} />
            <span className="voice-panel-name">
              {voice.connecting ? t('voice.connecting') : voiceChannelName}
            </span>
          </div>
          <button
            className="icon-button danger"
            title={t('voice.leave')}
            onClick={() => void voice.leave()}
          >
            <PhoneOff size={16} />
          </button>
        </div>
      )}

      <div className="user-card">
        <div className="avatar" aria-hidden>
          {user?.username.slice(0, 1).toUpperCase()}
        </div>
        <span className="username">{user?.username}</span>
        <button
          className={`icon-button${voice.muted ? ' engaged' : ''}`}
          title={voice.muted ? t('voice.unmute') : t('voice.mute')}
          disabled={!voice.channelId}
          onClick={() => void voice.toggleMute()}
        >
          {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
        <button
          className={`icon-button${voice.deafened ? ' engaged' : ''}`}
          title={voice.deafened ? t('voice.undeafen') : t('voice.deafen')}
          disabled={!voice.channelId}
          onClick={() => void voice.toggleDeafen()}
        >
          {voice.deafened ? <HeadphoneOff size={17} /> : <Headphones size={17} />}
        </button>
        <button
          className="icon-button"
          title={t('settings.title')}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={17} />
        </button>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </nav>
  );
}
