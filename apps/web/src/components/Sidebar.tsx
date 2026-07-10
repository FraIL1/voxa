import type { ChannelDto } from '@voxa/shared';
import { Hash, LogOut, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { logout } from '../api/auth';
import { useStructure } from '../hooks/useStructure';
import { useAuthStore } from '../stores/auth';

function ChannelItem({ channel }: { channel: ChannelDto }) {
  const { t } = useTranslation();

  if (channel.type === 'VOICE') {
    return (
      <span className="channel-link voice" title={t('channels.voiceComingSoon')}>
        <Volume2 size={16} />
        {channel.name}
      </span>
    );
  }
  return (
    <NavLink
      to={`/channels/${channel.id}`}
      className={({ isActive }) => `channel-link${isActive ? ' active' : ''}`}
    >
      <Hash size={16} />
      {channel.name}
    </NavLink>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { data: structure } = useStructure();
  const user = useAuthStore((s) => s.user);

  return (
    <nav className="sidebar">
      <div className="sidebar-header">{t('app.communityName')}</div>

      <div className="channel-tree">
        {structure?.categories.map((category) => (
          <div key={category.id}>
            <div className="category-name">{category.name}</div>
            {category.channels.map((channel) => (
              <ChannelItem key={channel.id} channel={channel} />
            ))}
          </div>
        ))}
        {structure && structure.uncategorized.length > 0 && (
          <div>
            <div className="category-name">{t('channels.uncategorized')}</div>
            {structure.uncategorized.map((channel) => (
              <ChannelItem key={channel.id} channel={channel} />
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
