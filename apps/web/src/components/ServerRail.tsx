import { MessageCircle, Plus, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router';

import { useDmConversations } from '../hooks/useDm';
import { useFriendRequests } from '../hooks/useFriends';
import { useGuilds, useReorderGuilds } from '../hooks/useGuilds';
import { useSupportNewCount } from '../hooks/useSupport';
import { useAuthStore } from '../stores/auth';
import AddServerModal from './AddServerModal';
import InstancePanel from './InstancePanel';

/** Левый столбец иконок (как в Discord): Дом (личка+друзья) + серверы + «+» */
export default function ServerRail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: conversations } = useDmConversations();
  const { data: requests } = useFriendRequests();
  const { data: guilds } = useGuilds();
  const reorder = useReorderGuilds();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [instanceOpen, setInstanceOpen] = useState(false);
  const isInstanceOwner = useAuthStore((s) => s.user?.isInstanceOwner ?? false);
  const { data: supportNew } = useSupportNewCount(isInstanceOwner);

  /** Перетащили один сервер на место другого — сохраняем новый порядок */
  const drop = (targetId: string): void => {
    const ids = (guilds ?? []).map((g) => g.id);
    const from = ids.indexOf(dragId ?? '');
    const to = ids.indexOf(targetId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    reorder.mutate(next);
  };

  // Колонка каналов разворачивается от выбранной иконки, а не от середины
  useEffect(() => {
    const active = document.querySelector('.rail-icon.active');
    if (!active) return;
    const box = active.getBoundingClientRect();
    document.documentElement.style.setProperty('--unfold-y', `${box.top + box.height / 2}px`);
  }, [location.pathname]);

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
        {/* Без подписи кнопку не находят: её искали внизу столбца */}
        <span className="rail-caption">{t('nav.homeShort')}</span>
      </button>

      <div className="rail-divider" />

      {(guilds ?? []).map((guild) => (
        <NavLink
          key={guild.id}
          to={`/guilds/${guild.id}`}
          className={({ isActive }) =>
            `rail-icon server${isActive ? ' active' : ''}${dragId === guild.id ? ' dragging' : ''}${
              overId === guild.id && dragId !== guild.id ? ' drop-target' : ''
            }`
          }
          title={guild.name}
          draggable
          onDragStart={(e) => {
            setDragId(guild.id);
            e.dataTransfer.effectAllowed = 'move';
            // Без этого Firefox не начинает перетаскивание
            e.dataTransfer.setData('text/plain', guild.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOverId(guild.id);
          }}
          onDragLeave={() => setOverId((id) => (id === guild.id ? null : id))}
          onDrop={(e) => {
            e.preventDefault();
            drop(guild.id);
          }}
        >
          {guild.iconUrl ? (
            <img className="rail-icon-img" src={guild.iconUrl} alt="" />
          ) : (
            guild.name.slice(0, 1).toUpperCase()
          )}
        </NavLink>
      ))}

      <button className="rail-icon add" title={t('nav.addServer')} onClick={() => setAddOpen(true)}>
        <Plus size={22} />
      </button>

      {isInstanceOwner && (
        <button
          className="rail-icon owner"
          title={t('instance.title')}
          onClick={() => setInstanceOpen(true)}
        >
          <Shield size={22} />
          {/* Точка на кнопке: новое обращение видно, не открывая панель */}
          {(supportNew?.newCount ?? 0) > 0 && (
            <span className="rail-badge">{supportNew?.newCount}</span>
          )}
        </button>
      )}

      {addOpen && <AddServerModal onClose={() => setAddOpen(false)} />}
      {instanceOpen && <InstancePanel onClose={() => setInstanceOpen(false)} />}
    </nav>
  );
}
