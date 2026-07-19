import { MessageCircle, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router';

import { useDmConversations } from '../hooks/useDm';

/** Левый столбец иконок (как в Discord): Дом (личка+друзья) + серверы.
 *  Пока сервер один — иконка сообщества. Создание серверов появится позже. */
export default function ServerRail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: conversations } = useDmConversations();

  const homeActive = location.pathname.startsWith('/home') || location.pathname.startsWith('/dm');
  const totalUnread = (conversations ?? []).reduce((sum, c) => sum + c.unreadCount, 0);

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

      <NavLink
        to="/channels"
        className={({ isActive }) => `rail-icon server${isActive ? ' active' : ''}`}
        title={t('app.communityName')}
      >
        V
      </NavLink>

      <button className="rail-icon add" title={t('nav.addServer')} disabled>
        <Plus size={22} />
      </button>
    </nav>
  );
}
