import type { DmConversationDto, DmMessageDto } from '@voxa/shared';
import { LogOut, Search, UserPlus, UserMinus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useFriends } from '../hooks/useFriends';
import {
  useAddGroupMembers,
  useDmPins,
  useDmSearch,
  useLeaveGroup,
  useRemoveGroupMember,
  useRenameGroup,
} from '../hooks/useDm';
import { useAuthStore } from '../stores/auth';

const dateFormat = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

function MessageRow({ message }: { message: DmMessageDto }) {
  const { t } = useTranslation();
  return (
    <div className="dm-panel-row">
      <div className="dm-panel-row-head">
        <span className="message-author">
          {message.author?.displayName ?? t('chat.unknownUser')}
        </span>
        <span className="message-time">{dateFormat.format(new Date(message.createdAt))}</span>
      </div>
      <div className="dm-panel-row-text">{message.content || '—'}</div>
    </div>
  );
}

/** Выпадающая панель закреплённых сообщений диалога */
export function PinnedPanel({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: pins, isLoading } = useDmPins(conversationId, true);

  return (
    <div className="dm-panel">
      <div className="dm-panel-head">
        <span>{t('dm.pinnedTitle')}</span>
        <button className="icon-button" onClick={onClose} title={t('settings.close')}>
          <X size={16} />
        </button>
      </div>
      {isLoading && <p className="empty-state">{t('app.loading')}</p>}
      {pins && pins.length === 0 && <p className="empty-state">{t('dm.noPinned')}</p>}
      {pins?.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
}

/** Выпадающая панель поиска по переписке */
export function SearchPanel({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { data: results, isFetching } = useDmSearch(conversationId, query);

  return (
    <div className="dm-panel">
      <div className="dm-panel-head">
        <span>{t('dm.searchTitle')}</span>
        <button className="icon-button" onClick={onClose} title={t('settings.close')}>
          <X size={16} />
        </button>
      </div>
      <div className="dm-panel-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('dm.searchPlaceholder')}
          maxLength={100}
          autoFocus
        />
      </div>
      {query.trim() && isFetching && <p className="empty-state">{t('app.loading')}</p>}
      {results && results.length === 0 && <p className="empty-state">{t('dm.searchEmpty')}</p>}
      {results?.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
}

/** Карточка профиля собеседника (для 1-на-1) */
export function PeerProfilePanel({
  peer,
  onClose,
}: {
  peer: NonNullable<DmConversationDto['peer']>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="dm-panel">
      <div className="dm-panel-head">
        <span>{t('dm.profileTitle')}</span>
        <button className="icon-button" onClick={onClose} title={t('settings.close')}>
          <X size={16} />
        </button>
      </div>
      <div className="dm-profile">
        <div className="avatar dm-profile-avatar" aria-hidden>
          {peer.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="dm-profile-name">{peer.displayName}</div>
        <div className="dm-profile-username">@{peer.username}</div>
      </div>
    </div>
  );
}

/** Панель управления группой: участники, добавление, переименование, выход */
export function GroupPanel({
  conversation,
  onClose,
}: {
  conversation: DmConversationDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = useAuthStore((s) => s.user?.id);
  const { data: friends } = useFriends();
  const addMembers = useAddGroupMembers(conversation.id);
  const removeMember = useRemoveGroupMember(conversation.id);
  const renameGroup = useRenameGroup(conversation.id);
  const leaveGroup = useLeaveGroup();
  const [adding, setAdding] = useState(false);

  const isOwner = conversation.ownerId === myId;
  const memberIds = new Set(conversation.members.map((m) => m.id));
  const candidates = (friends ?? []).filter((f) => !memberIds.has(f.id));

  const rename = (): void => {
    const next = window.prompt(t('dm.groupNameLabel'), conversation.name ?? '');
    if (next && next.trim()) renameGroup.mutate(next.trim());
  };

  const leave = (): void => {
    if (window.confirm(t('dm.groupLeaveConfirm'))) {
      leaveGroup.mutate(conversation.id, { onSuccess: () => navigate('/home') });
    }
  };

  return (
    <div className="dm-panel">
      <div className="dm-panel-head">
        <span>{t('dm.groupSettings')}</span>
        <button className="icon-button" onClick={onClose} title={t('settings.close')}>
          <X size={16} />
        </button>
      </div>

      <button className="btn-secondary" onClick={rename}>
        {t('dm.groupRename')}
      </button>

      <div className="friends-count">
        {t('dm.groupMembers').toUpperCase()} — {conversation.members.length}
      </div>
      {conversation.members.map((m) => (
        <div key={m.id} className="friend-row">
          <div className="avatar friend-avatar" aria-hidden>
            {m.displayName.slice(0, 1).toUpperCase()}
          </div>
          <span className="friend-name">{m.displayName}</span>
          {conversation.ownerId === m.id && (
            <span className="friend-status">{t('dm.groupOwner')}</span>
          )}
          {isOwner && m.id !== myId && (
            <button
              className="icon-button danger"
              title={t('dm.groupKick')}
              onClick={() => removeMember.mutate(m.id)}
            >
              <UserMinus size={16} />
            </button>
          )}
        </div>
      ))}

      <button className="btn-secondary" onClick={() => setAdding((v) => !v)}>
        <UserPlus size={15} /> {t('dm.groupAdd')}
      </button>
      {adding && (
        <div className="group-pick-list">
          {candidates.length === 0 && <p className="settings-hint">{t('dm.groupNoFriends')}</p>}
          {candidates.map((f) => (
            <button
              key={f.id}
              className="group-pick-row"
              onClick={() => addMembers.mutate([f.id], { onSuccess: () => setAdding(false) })}
            >
              <div className="avatar friend-avatar" aria-hidden>
                {f.displayName.slice(0, 1).toUpperCase()}
              </div>
              <span className="friend-name">{f.displayName}</span>
            </button>
          ))}
        </div>
      )}

      <button className="btn-secondary danger-text" onClick={leave}>
        <LogOut size={15} /> {t('dm.groupLeave')}
      </button>
    </div>
  );
}
