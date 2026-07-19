import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { useDmConversations } from '../hooks/useDm';
import UserCard from './UserCard';

/** Вторая колонка в «домашнем» контексте: друзья + список личных диалогов. */
export default function DmSidebar() {
  const { t } = useTranslation();
  const { data: conversations } = useDmConversations();
  const list = conversations ?? [];

  return (
    <nav className="sidebar">
      <div className="sidebar-header">{t('nav.home')}</div>

      <div className="channel-tree">
        <NavLink
          to="/home"
          end
          className={({ isActive }) => `channel-link home-link${isActive ? ' active' : ''}`}
        >
          <Users size={18} />
          <span className="channel-name">{t('nav.friends')}</span>
        </NavLink>

        <div className="category-name">{t('dm.section')}</div>
        {list.length === 0 && <p className="sidebar-empty">{t('dm.noConversations')}</p>}
        {list.map((c) => (
          <NavLink
            key={c.id}
            to={`/dm/${c.id}`}
            className={({ isActive }) =>
              `channel-link${isActive ? ' active' : ''}${c.unreadCount > 0 ? ' unread' : ''}`
            }
          >
            <div className="dm-avatar" aria-hidden>
              {c.peer.username.slice(0, 1).toUpperCase()}
            </div>
            <span className="channel-name">{c.peer.username}</span>
            {c.unreadCount > 0 && <span className="mention-badge">{c.unreadCount}</span>}
          </NavLink>
        ))}
      </div>

      <UserCard />
    </nav>
  );
}
