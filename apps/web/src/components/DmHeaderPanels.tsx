import type { DmConversationDto, DmMessageDto } from '@voxa/shared';
import {
  Crown,
  LogOut,
  Pencil,
  Search,
  UserCog,
  UserPlus,
  UserMinus,
  UsersRound,
  X,
} from 'lucide-react';
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
import { openProfile } from '../stores/profileView';
import Avatar from './Avatar';
import ConfirmModal from './ConfirmModal';
import { ProfileBody } from './ProfileCard';
import PromptModal from './PromptModal';

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

/**
 * Профиль собеседника колонкой справа от переписки. Выпадающей полосой во
 * всю ширину карточка выглядела растянутой, а её шапка налезала на заголовок.
 */
export function PeerProfileAside({
  peer,
  onClose,
}: {
  peer: NonNullable<DmConversationDto['peer']>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="dm-profile-aside">
      <button className="icon-button profile-close" onClick={onClose} title={t('settings.close')}>
        <X size={16} />
      </button>
      <ProfileBody userId={peer.id} onNavigate={onClose} compact />
    </aside>
  );
}

/**
 * Управление беседой колонкой справа: состав, добавление, переименование,
 * выход. Полосой во всю ширину список участников не читался — строки
 * растягивались через весь экран, а кнопки внизу обрезались.
 */
export function GroupAside({
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
  const [renaming, setRenaming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const isOwner = conversation.ownerId === myId;
  const memberIds = new Set(conversation.members.map((m) => m.id));
  const candidates = (friends ?? []).filter((f) => !memberIds.has(f.id));

  return (
    <aside className="dm-profile-aside group-aside">
      <div className="group-aside-head">
        <span className="group-aside-head-title">
          <UserCog size={15} />
          {t('dm.groupSettings')}
        </span>
        <button className="icon-button" onClick={onClose} title={t('settings.close')}>
          <X size={16} />
        </button>
      </div>

      {/* Кто это: имя беседы и её размер — чтобы колонка сама себя объясняла */}
      <div className="group-aside-hero">
        <div className="group-aside-avatar" aria-hidden>
          <UsersRound size={26} />
        </div>
        <div className="group-aside-name">{conversation.name}</div>
        <div className="group-aside-sub">
          {t('dm.groupMembers')}: {conversation.members.length}
        </div>
        <button className="btn-secondary" onClick={() => setRenaming(true)}>
          <Pencil size={15} /> {t('dm.groupRename')}
        </button>
      </div>

      <div className="group-aside-section">
        <span className="group-aside-section-title">
          <UsersRound size={13} />
          {t('dm.groupMembers')}
        </span>
        <span className="group-aside-section-count">{conversation.members.length}</span>
      </div>

      <div className="group-member-list">
        {conversation.members.map((m) => (
          <div
            key={m.id}
            className="group-member-row"
            role="button"
            tabIndex={0}
            title={t('dm.profileTitle')}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('button')) openProfile(m.id, e);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openProfile(m.id);
              }
            }}
          >
            <Avatar name={m.displayName} url={m.avatarUrl} className="friend-avatar" />
            <span className="group-member-lines">
              <span className="group-member-name">
                {m.displayName}
                {conversation.ownerId === m.id && (
                  <span className="group-owner-badge" title={t('dm.groupOwner')}>
                    <Crown size={12} />
                    {t('dm.groupOwner')}
                  </span>
                )}
              </span>
              <span className="group-member-login">@{m.username}</span>
            </span>
            {isOwner && m.id !== myId && (
              <button
                className="icon-button danger group-member-kick"
                title={t('dm.groupKick')}
                onClick={() => removeMember.mutate(m.id)}
              >
                <UserMinus size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="group-aside-actions">
        <button
          className={`btn-secondary${adding ? ' engaged' : ''}`}
          onClick={() => setAdding((v) => !v)}
        >
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
                <Avatar name={f.displayName} url={f.avatarUrl} className="friend-avatar" />
                <span className="friend-name">{f.displayName}</span>
              </button>
            ))}
          </div>
        )}

        <button className="btn-secondary danger-text" onClick={() => setLeaving(true)}>
          <LogOut size={15} /> {t('dm.groupLeave')}
        </button>
      </div>

      {renaming && (
        <PromptModal
          title={t('dm.groupRename')}
          label={t('dm.groupNameLabel')}
          placeholder={t('dm.groupNamePlaceholder')}
          initialValue={conversation.name ?? ''}
          maxLength={64}
          onClose={() => setRenaming(false)}
          onSubmit={(value) => renameGroup.mutate(value)}
        />
      )}

      {leaving && (
        <ConfirmModal
          title={t('dm.groupLeaveTitle')}
          message={t('dm.groupLeaveConfirm')}
          confirmLabel={t('dm.groupLeave')}
          danger
          onConfirm={() =>
            leaveGroup.mutate(conversation.id, { onSuccess: () => navigate('/home') })
          }
          onClose={() => setLeaving(false)}
        />
      )}
    </aside>
  );
}
