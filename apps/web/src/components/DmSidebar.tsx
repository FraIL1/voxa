import type { DmConversationDto } from '@voxa/shared';
import { Pin, PinOff, Users, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { dmAvatarLetter, dmTitle } from '../api/dm-cache';
import { useDmConversations, useToggleConversationPin } from '../hooks/useDm';
import CreateGroupModal from './CreateGroupModal';
import UserCard from './UserCard';

function DmLink({ conversation }: { conversation: DmConversationDto }) {
  const { t } = useTranslation();
  const togglePin = useToggleConversationPin();

  return (
    <NavLink
      to={`/dm/${conversation.id}`}
      className={({ isActive }) =>
        `channel-link dm-link${isActive ? ' active' : ''}${
          conversation.unreadCount > 0 ? ' unread' : ''
        }`
      }
    >
      <div className="dm-avatar" aria-hidden>
        {conversation.isGroup ? <UsersRound size={14} /> : dmAvatarLetter(conversation)}
      </div>
      <span className="channel-name">{dmTitle(conversation)}</span>
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
  const list = conversations ?? [];
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
              <DmLink key={c.id} conversation={c} />
            ))}
          </>
        )}

        <div className="category-name">{t('dm.section')}</div>
        {list.length === 0 && <p className="sidebar-empty">{t('dm.noConversations')}</p>}
        {rest.map((c) => (
          <DmLink key={c.id} conversation={c} />
        ))}
      </div>

      <UserCard />
      {groupOpen && <CreateGroupModal onClose={() => setGroupOpen(false)} />}
    </nav>
  );
}
