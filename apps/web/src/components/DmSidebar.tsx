import type { DmConversationDto } from '@voxa/shared';
import { BellOff, Pin, PinOff, Users, UsersRound } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { dmAvatarLetter, dmTitle } from '../api/dm-cache';
import { useDmConversations, useToggleConversationPin } from '../hooks/useDm';
import CreateGroupModal from './CreateGroupModal';
import DmContextMenu, { type DmMenuState } from './DmContextMenu';
import UserCard from './UserCard';

function DmLink({
  conversation,
  onContextMenu,
}: {
  conversation: DmConversationDto;
  onContextMenu: (e: MouseEvent<HTMLElement>, conversation: DmConversationDto) => void;
}) {
  const { t } = useTranslation();
  const togglePin = useToggleConversationPin();
  const muted = Boolean(conversation.mutedUntil && new Date(conversation.mutedUntil) > new Date());

  return (
    <NavLink
      to={`/dm/${conversation.id}`}
      onContextMenu={(e) => onContextMenu(e, conversation)}
      className={({ isActive }) =>
        `channel-link dm-link${isActive ? ' active' : ''}${
          conversation.unreadCount > 0 ? ' unread' : ''
        }${muted ? ' muted' : ''}`
      }
    >
      <div className="dm-avatar" aria-hidden>
        {conversation.isGroup ? <UsersRound size={14} /> : dmAvatarLetter(conversation)}
      </div>
      <span className="channel-name">{dmTitle(conversation)}</span>
      {muted && <BellOff size={13} className="dm-muted-mark" />}
      {conversation.unreadCount > 0 && (
        <span className="mention-badge">{conversation.unreadCount}</span>
      )}
      <button
        className="icon-button dm-pin-button"
        title={conversation.pinned ? t('dm.unpinChat') : t('dm.pinChat')}
        onClick={(e) => {
          // Клик по кнопке не должен открывать диалог
          e.preventDefault();
          e.stopPropagation();
          togglePin.mutate({ conversationId: conversation.id, pinned: conversation.pinned });
        }}
      >
        {conversation.pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
    </NavLink>
  );
}

/** Вторая колонка в «домашнем» контексте: друзья + список личных диалогов. */
export default function DmSidebar() {
  const { t } = useTranslation();
  const { data: conversations } = useDmConversations();
  const [groupOpen, setGroupOpen] = useState(false);
  const [menu, setMenu] = useState<DmMenuState | null>(null);
  const list = conversations ?? [];

  const openMenu = (e: MouseEvent<HTMLElement>, conversation: DmConversationDto): void => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, conversation });
  };
  const pinned = list.filter((c) => c.pinned);
  const rest = list.filter((c) => !c.pinned);

  return (
    <nav className="sidebar">
      <div className="sidebar-header dm-sidebar-header">
        {t('nav.home')}
        <button
          className="icon-button"
          title={t('dm.createGroup')}
          onClick={() => setGroupOpen(true)}
        >
          <UsersRound size={16} />
        </button>
      </div>

      <div className="channel-tree">
        <NavLink
          to="/home"
          end
          className={({ isActive }) => `channel-link home-link${isActive ? ' active' : ''}`}
        >
          <Users size={18} />
          <span className="channel-name">{t('nav.friends')}</span>
        </NavLink>

        {pinned.length > 0 && (
          <>
            <div className="category-name">{t('dm.pinnedChats')}</div>
            {pinned.map((c) => (
              <DmLink key={c.id} conversation={c} onContextMenu={openMenu} />
            ))}
          </>
        )}

        <div className="category-name">{t('dm.section')}</div>
        {list.length === 0 && <p className="sidebar-empty">{t('dm.noConversations')}</p>}
        {rest.map((c) => (
          <DmLink key={c.id} conversation={c} onContextMenu={openMenu} />
        ))}
      </div>

      <UserCard />
      {groupOpen && <CreateGroupModal onClose={() => setGroupOpen(false)} />}
      {menu && <DmContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </nav>
  );
}
