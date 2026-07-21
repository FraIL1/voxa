import { hasPermission, Permissions } from '@voxa/shared';
import type { ChannelDto, ReadStateDto, VoiceParticipantDto } from '@voxa/shared';
import { ChevronDown, Hash, HeadphoneOff, MicOff, Plus, Settings, Volume2 } from 'lucide-react';
import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate, useParams } from 'react-router';

import { useGuild } from '../hooks/useGuilds';
import { useMembers } from '../hooks/useMembers';
import { useReadStates } from '../hooks/useReadStates';
import { useStructure } from '../hooks/useStructure';
import { participantsOf, useVoiceStates } from '../hooks/useVoiceStates';
import { useAuthStore } from '../stores/auth';
import { useVoiceStore } from '../stores/voice';
import ChannelSettingsModal from './ChannelSettingsModal';
import CreateChannelModal from './CreateChannelModal';
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
  canManage,
  onSettings,
  onVoiceContextMenu,
}: {
  channel: ChannelDto;
  state?: ReadStateDto;
  voiceParticipants?: VoiceParticipantDto[];
  canManage: boolean;
  onSettings: (channel: ChannelDto) => void;
  onVoiceContextMenu: (e: ReactMouseEvent, userId: string, username: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const join = useVoiceStore((s) => s.join);
  const myVoiceChannel = useVoiceStore((s) => s.channelId);

  const gear = canManage && (
    <button
      className="channel-gear"
      title={t('channels.settingsTitle')}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSettings(channel);
      }}
    >
      <Settings size={14} />
    </button>
  );

  if (channel.type === 'VOICE') {
    return (
      <div>
        <div className="channel-row">
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
          {gear}
        </div>
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
    <div className="channel-row">
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
      {gear}
    </div>
  );
}

function CategorySection({
  name,
  categoryId,
  guildId,
  canManage,
  onCreateChannel,
  children,
}: {
  name: string;
  categoryId: string | null;
  guildId: string | undefined;
  canManage: boolean;
  onCreateChannel: (categoryId: string | null) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const storageKey = `voxa:cat-collapsed:${guildId}:${categoryId ?? 'none'}`;
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(storageKey) === '1');

  const toggle = (): void => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, next ? '1' : '0');
      return next;
    });
  };

  return (
    <div className="category-block">
      <div className="category-head">
        <button className="category-name category-toggle" onClick={toggle}>
          <ChevronDown size={12} className={collapsed ? 'chevron-collapsed' : ''} />
          {name}
        </button>
        {canManage && (
          <button
            className="category-add"
            title={t('guild.menuCreateChannel')}
            onClick={() => onCreateChannel(categoryId)}
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { guildId } = useParams<{ guildId: string }>();
  const guild = useGuild(guildId);
  const { data: structure } = useStructure(guildId);
  const { data: readStates } = useReadStates();
  const { data: voiceStates } = useVoiceStates();
  const user = useAuthStore((s) => s.user);
  const { data: members } = useMembers(guildId);
  const [memberMenu, setMemberMenu] = useState<MenuState | null>(null);
  const [channelSettings, setChannelSettings] = useState<ChannelDto | null>(null);
  const [createIn, setCreateIn] = useState<{ categoryId: string | null } | null>(null);

  const canManage = hasPermission(guild?.myPermissions ?? 0, Permissions.MANAGE_CHANNELS);

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
      canManage={canManage}
      onSettings={setChannelSettings}
      onVoiceContextMenu={openVoiceMemberMenu}
    />
  );

  return (
    <nav className="sidebar">
      {guildId && <ServerMenu guildId={guildId} />}

      <div className="channel-tree">
        {structure?.categories.map((category) => (
          <CategorySection
            key={category.id}
            name={category.name}
            categoryId={category.id}
            guildId={guildId}
            canManage={canManage}
            onCreateChannel={(categoryId) => setCreateIn({ categoryId })}
          >
            {category.channels.map(renderChannel)}
          </CategorySection>
        ))}
        {structure && structure.uncategorized.length > 0 && (
          <CategorySection
            name={t('channels.uncategorized')}
            categoryId={null}
            guildId={guildId}
            canManage={canManage}
            onCreateChannel={(categoryId) => setCreateIn({ categoryId })}
          >
            {structure.uncategorized.map(renderChannel)}
          </CategorySection>
        )}
      </div>

      <UserCard />

      {memberMenu && <MemberContextMenu menu={memberMenu} onClose={() => setMemberMenu(null)} />}
      {channelSettings && (
        <ChannelSettingsModal channel={channelSettings} onClose={() => setChannelSettings(null)} />
      )}
      {createIn && guildId && (
        <CreateChannelModal
          guildId={guildId}
          categoryId={createIn.categoryId}
          onClose={() => setCreateIn(null)}
        />
      )}
    </nav>
  );
}
