import type { ChannelDto, ReadStateDto, VoiceParticipantDto } from '@voxa/shared';
import {
  AtSign,
  Hash,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Volume2,
} from 'lucide-react';
import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router';

import { useDmConversations } from '../hooks/useDm';
import { useMembers } from '../hooks/useMembers';
import { useReadStates } from '../hooks/useReadStates';
import { allChannelsOf, useStructure } from '../hooks/useStructure';
import { participantsOf, useVoiceStates } from '../hooks/useVoiceStates';
import { useAuthStore } from '../stores/auth';
import { useVoiceStore } from '../stores/voice';
import MemberContextMenu, { type MenuState } from './MemberContextMenu';
import SettingsModal from './SettingsModal';

function DmSection() {
  const { t } = useTranslation();
  const { data: conversations } = useDmConversations();
  const list = conversations ?? [];
  if (list.length === 0) return null;

  return (
    <div>
      <div className="category-name">{t('dm.section')}</div>
      {list.map((c) => (
        <NavLink
          key={c.id}
          to={`/dm/${c.id}`}
          className={({ isActive }) =>
            `channel-link${isActive ? ' active' : ''}${c.unreadCount > 0 ? ' unread' : ''}`
          }
        >
          <AtSign size={16} />
          <span className="channel-name">{c.peer.username}</span>
          {c.unreadCount > 0 && <span className="mention-badge">{c.unreadCount}</span>}
        </NavLink>
      ))}
    </div>
  );
}

function VoiceParticipants({
  participants,
  onContextMenu,
}: {
  participants: VoiceParticipantDto[];
  onContextMenu: (e: ReactMouseEvent, userId: string, username: string) => void;
}) {
  const speaking = useVoiceStore((s) => s.speaking);
  if (participants.length === 0) return null;

  return (
    <div className="voice-participants">
      {participants.map((p) => (
        <div
          key={p.userId}
          className={`voice-participant${speaking[p.userId] ? ' speaking' : ''}`}
          onContextMenu={(e) => onContextMenu(e, p.userId, p.username)}
        >
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
  onVoiceContextMenu,
}: {
  channel: ChannelDto;
  state?: ReadStateDto;
  voiceParticipants?: VoiceParticipantDto[];
  onVoiceContextMenu: (e: ReactMouseEvent, userId: string, username: string) => void;
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
        <VoiceParticipants
          participants={voiceParticipants ?? []}
          onContextMenu={onVoiceContextMenu}
        />
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
  const { data: members } = useMembers();
  const [memberMenu, setMemberMenu] = useState<MenuState | null>(null);

  const openVoiceMemberMenu = (e: ReactMouseEvent, userId: string, username: string): void => {
    if (userId === user?.id) return;
    e.preventDefault();
    const member = members?.find((m) => m.id === userId) ?? {
      id: userId,
      username,
      avatarUrl: null,
      status: 'online' as const,
      roles: [],
      timedOutUntil: null,
      banned: false,
    };
    setMemberMenu({ x: e.clientX, y: e.clientY, member });
  };

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
      onVoiceContextMenu={openVoiceMemberMenu}
    />
  );

  return (
    <nav className="sidebar">
      <div className="sidebar-header">{t('app.communityName')}</div>

      <div className="channel-tree">
        <DmSection />
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
      {memberMenu && <MemberContextMenu menu={memberMenu} onClose={() => setMemberMenu(null)} />}
    </nav>
  );
}
