import type { ChannelDto, ReadStateDto, VoiceParticipantDto } from '@voxa/shared';
import { Hash, HeadphoneOff, MicOff, Volume2 } from 'lucide-react';
import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate, useParams } from 'react-router';

import { useMembers } from '../hooks/useMembers';
import { useReadStates } from '../hooks/useReadStates';
import { useStructure } from '../hooks/useStructure';
import { participantsOf, useVoiceStates } from '../hooks/useVoiceStates';
import { useAuthStore } from '../stores/auth';
import { useVoiceStore } from '../stores/voice';
import MemberContextMenu, { type MenuState } from './MemberContextMenu';
import ServerMenu from './ServerMenu';
import UserCard from './UserCard';

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
            void navigate(`/guilds/${channel.guildId}/channels/${channel.id}`);
            void join(channel.id, channel.name).catch(() => undefined);
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
      to={`/guilds/${channel.guildId}/channels/${channel.id}`}
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
  const { guildId } = useParams<{ guildId: string }>();
  const { data: structure } = useStructure(guildId);
  const { data: readStates } = useReadStates();
  const { data: voiceStates } = useVoiceStates();
  const user = useAuthStore((s) => s.user);
  const { data: members } = useMembers(guildId);
  const [memberMenu, setMemberMenu] = useState<MenuState | null>(null);

  const openVoiceMemberMenu = (e: ReactMouseEvent, userId: string, username: string): void => {
    if (userId === user?.id) return;
    e.preventDefault();
    const member = members?.find((m) => m.id === userId) ?? {
      id: userId,
      username,
      displayName: username,
      nickname: null,
      avatarUrl: null,
      status: 'online' as const,
      roles: [],
      timedOutUntil: null,
      banned: false,
    };
    setMemberMenu({ x: e.clientX, y: e.clientY, member });
  };

  const stateOf = new Map((readStates ?? []).map((s) => [s.channelId, s]));

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
      {guildId && <ServerMenu guildId={guildId} />}

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

      <UserCard />

      {memberMenu && <MemberContextMenu menu={memberMenu} onClose={() => setMemberMenu(null)} />}
    </nav>
  );
}
