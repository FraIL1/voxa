import type { DmConversationDto, PresenceStatus } from '@voxa/shared';
import { BellOff, Pin, PinOff, Users, UsersRound } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { dmTitle } from '../api/dm-cache';
import { useDmConversations, useToggleConversationPin } from '../hooks/useDm';
import { useFriends } from '../hooks/useFriends';
import Avatar from './Avatar';
import CreateGroupModal from './CreateGroupModal';
import DmContextMenu, { type DmMenuState } from './DmContextMenu';
import UserCard from './UserCard';

function DmLink({
  conversation,
  status,
  onContextMenu,
}: {
  conversation: DmConversationDto;
  /** Присутствие собеседника; для группы не показываем */
  status?: PresenceStatus;
  onContextMenu: (e: MouseEvent<HTMLElement>, conversation: DmConversationDto) => void;
}) {
  const { t } = useTranslation();
  const togglePin = useToggleConversationPin();
  const muted = Boolean(conversation.mutedUntil && new Date(conversation.mutedUntil) > new Date());

  /* Под именем — присутствие собеседника, а не последнее сообщение:
     в списке важнее «на месте ли он», чем «о чём говорили». */
  const secondLine = (c: DmConversationDto): string => {
    if (c.isGroup) return `${t('dm.groupMembers')}: ${c.members.length}`;
    // Не друзья — присутствие неизвестно; писать «не в сети» было бы неправдой
    if (!status) return '';
    return t(`presence.${status}`);
  };

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
      {conversation.isGroup ? (
        <div className="avatar dm-avatar group" aria-hidden>
          <UsersRound size={16} />
        </div>
      ) : (
        <Avatar
          name={dmTitle(conversation)}
          url={conversation.peer?.avatarUrl}
          status={status}
          className="dm-avatar"
        />
      )}
      {/* Две строки: имя и о чём был разговор — по списку видно, куда заходить */}
      <span className="dm-lines">
        <span className="dm-line-top">
          <span className="channel-name">{dmTitle(conversation)}</span>
          {muted && <BellOff size={13} className="dm-muted-mark" />}
        </span>
        <span className="dm-preview">{secondLine(conversation)}</span>
      </span>
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
  const { data: friends } = useFriends();
  const [groupOpen, setGroupOpen] = useState(false);
  const [menu, setMenu] = useState<DmMenuState | null>(null);
  const list = conversations ?? [];

  const openMenu = (e: MouseEvent<HTMLElement>, conversation: DmConversationDto): void => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, conversation });
  };
  // Присутствие берём из списка друзей: с кем не дружим — точки нет
  const statusOf = (conversation: DmConversationDto): PresenceStatus | undefined =>
    friends?.find((f) => f.id === conversation.peer?.id)?.status;

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
              <DmLink key={c.id} conversation={c} status={statusOf(c)} onContextMenu={openMenu} />
            ))}
          </>
        )}

        <div className="category-name">{t('dm.section')}</div>
        {list.length === 0 && <p className="sidebar-empty">{t('dm.noConversations')}</p>}
        {rest.map((c) => (
          <DmLink key={c.id} conversation={c} status={statusOf(c)} onContextMenu={openMenu} />
        ))}
      </div>

      <UserCard />
      {groupOpen && <CreateGroupModal onClose={() => setGroupOpen(false)} />}
      {menu && <DmContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </nav>
  );
}
