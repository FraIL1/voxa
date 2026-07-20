import { MessageCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router';

import { useDmConversations } from '../hooks/useDm';
import { useFriendRequests } from '../hooks/useFriends';
import { useGuilds } from '../hooks/useGuilds';
import AddServerModal from './AddServerModal';

/** Левый столбец иконок (как в Discord): Дом (личка+друзья) + серверы + «+» */
export default function ServerRail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: conversations } = useDmConversations();
  const { data: requests } = useFriendRequests();
  const { data: guilds } = useGuilds();
  const [addOpen, setAddOpen] = useState(false);

  const homeActive = location.pathname.startsWith('/home') || location.pathname.startsWith('/dm');
  const dmUnread = (conversations ?? []).reduce((sum, c) => sum + c.unreadCount, 0);
  const incomingRequests = (requests ?? []).filter((r) => r.direction === 'incoming').length;
  const totalUnread = dmUnread + incomingRequests;

  return (
    <nav className="server-rail">
      <button
        className={`rail-icon home${homeActive ? ' active' : ''}`}
        title={t('nav.home')}
        onClick={() => navigate('/home')}
      >
        <MessageCircle size={24} />
        {totalUnread > 0 && <span className="rail-badge">{totalUnread}</span>}
      </button>

      <div className="rail-divider" />

      {(guilds ?? []).map((guild) => (
        <NavLink
          key={guild.id}
          to={`/guilds/${guild.id}`}
          className={({ isActive }) => `rail-icon server${isActive ? ' active' : ''}`}
          title={guild.name}
        >
          {guild.name.slice(0, 1).toUpperCase()}
        </NavLink>
      ))}

      <button className="rail-icon add" title={t('nav.addServer')} onClick={() => setAddOpen(true)}>
        <Plus size={22} />
      </button>

      {addOpen && <AddServerModal onClose={() => setAddOpen(false)} />}
    </nav>
  );
}
