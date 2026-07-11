import type { ChannelDto, ReadStateDto } from '@voxa/shared';
import { Hash, LogOut, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { logout } from '../api/auth';
import { useReadStates } from '../hooks/useReadStates';
import { useStructure } from '../hooks/useStructure';
import { useAuthStore } from '../stores/auth';

function ChannelItem({ channel, state }: { channel: ChannelDto; state?: ReadStateDto }) {
  const { t } = useTranslation();

  if (channel.type === 'VOICE') {
    return (
      <span className="channel-link voice" title={t('channels.voiceComingSoon')}>
        <Volume2 size={16} />
        {channel.name}
      </span>
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
  const user = useAuthStore((s) => s.user);

  const stateOf = new Map((readStates ?? []).map((s) => [s.channelId, s]));

  return (
    <nav className="sidebar">
      <div className="sidebar-header">{t('app.communityName')}</div>

      <div className="channel-tree">
        {structure?.categories.map((category) => (
          <div key={category.id}>
            <div className="category-name">{category.name}</div>
            {category.channels.map((channel) => (
              <ChannelItem key={channel.id} channel={channel} state={stateOf.get(channel.id)} />
            ))}
          </div>
        ))}
        {structure && structure.uncategorized.length > 0 && (
          <div>
            <div className="category-name">{t('channels.uncategorized')}</div>
            {structure.uncategorized.map((channel) => (
              <ChannelItem key={channel.id} channel={channel} state={stateOf.get(channel.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="user-card">
        <div className="avatar" aria-hidden>
          {user?.username.slice(0, 1).toUpperCase()}
        </div>
        <span className="username">{user?.username}</span>
        <button className="icon-button" title={t('auth.logout')} onClick={() => void logout()}>
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );
}
