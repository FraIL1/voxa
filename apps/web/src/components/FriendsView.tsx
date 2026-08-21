import type { FriendDto, PresenceStatus } from '@voxa/shared';
import {
  Ban,
  Check,
  Circle,
  Handshake,
  Inbox,
  MessageSquare,
  UserMinus,
  UserPlus,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useOpenDm } from '../hooks/useDm';
import { useVoiceStates, voiceLocationOf } from '../hooks/useVoiceStates';
import { openProfile } from '../stores/profileView';
import Avatar from './Avatar';
import ConfirmModal from './ConfirmModal';
import { EmptyBlock } from './Skeletons';
import {
  useAcceptFriendRequest,
  useBlockUser,
  useBlockedUsers,
  useDeleteFriendRequest,
  useFriendRequests,
  useFriends,
  useRemoveFriend,
  useSendFriendRequest,
  useUnblockUser,
} from '../hooks/useFriends';

type Tab = 'online' | 'all' | 'requests' | 'blocked' | 'add';

/**
 * Присутствие друга в строке списка. Если он сидит в голосовом канале, куда
 * нам тоже можно, вместо «в сети» показываем это и уводим прямо в канал —
 * не надо обходить общие серверы и искать, где он.
 */
function FriendPresence({ userId, status }: { userId: string; status: PresenceStatus }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: voiceStates } = useVoiceStates();
  const voice = voiceLocationOf(voiceStates, userId);

  if (!voice) return <span className="friend-status">{t(`presence.${status}`)}</span>;

  return (
    <button
      type="button"
      className="friend-status friend-in-voice"
      title={t('dm.joinVoiceHint')}
      onClick={() => void navigate(`/guilds/${voice.guildId}/channels/${voice.channelId}`)}
    >
      <Volume2 size={13} />
      {t('dm.inVoice')}
    </button>
  );
}

/**
 * Строка человека. Клик по ней открывает профиль — кроме клика по кнопкам
 * действий внутри: у них своё дело.
 */
function PersonRow({ userId, children }: { userId: string; children: ReactNode }) {
  const open = (event?: { currentTarget: Element }): void => openProfile(userId, event);
  return (
    <div
      className="friend-row clickable"
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) open(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      {children}
    </div>
  );
}

function FriendRows({ online }: { online: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: friends } = useFriends();
  const openDm = useOpenDm();
  const removeFriend = useRemoveFriend();
  const blockUser = useBlockUser();

  // «Отошёл» и «не беспокоить» — это присутствие, а не офлайн: во вкладке
  // «В сети» такие люди должны быть. Скрыт только тот, кто действительно ушёл
  // или включил невидимку
  const shown = (friends ?? []).filter((f) => !online || f.status !== 'offline');

  const write = (userId: string): void => {
    openDm
      .mutateAsync(userId)
      .then(({ id }) => navigate(`/dm/${id}`))
      .catch(() => undefined);
  };

  // Что подтверждаем: убрать из друзей или заблокировать — и кого
  const [ask, setAsk] = useState<{ action: 'remove' | 'block'; friend: FriendDto } | null>(null);

  return (
    <>
      <div className="friends-count">
        {(online ? t('friends.online') : t('friends.all')).toUpperCase()} — {shown.length}
      </div>
      {shown.length === 0 && (
        <EmptyBlock
          icon={<Handshake size={26} />}
          title={t('friends.emptyTitle')}
          hint={t('friends.empty')}
        />
      )}
      {shown.map((friend) => (
        <PersonRow key={friend.id} userId={friend.id}>
          <Avatar
            name={friend.displayName}
            url={friend.avatarUrl}
            status={friend.status}
            className="friend-avatar"
          />
          <span className="friend-name">{friend.displayName}</span>
          <FriendPresence userId={friend.id} status={friend.status} />
          <button className="icon-button" title={t('dm.write')} onClick={() => write(friend.id)}>
            <MessageSquare size={18} />
          </button>
          <button
            className="icon-button"
            title={t('friends.remove')}
            onClick={() => setAsk({ action: 'remove', friend })}
          >
            <UserMinus size={18} />
          </button>
          <button
            className="icon-button danger"
            title={t('friends.block')}
            onClick={() => setAsk({ action: 'block', friend })}
          >
            <Ban size={18} />
          </button>
        </PersonRow>
      ))}

      {ask && (
        <ConfirmModal
          title={ask.action === 'remove' ? t('friends.removeTitle') : t('friends.blockTitle')}
          message={t(ask.action === 'remove' ? 'friends.removeConfirm' : 'friends.blockConfirm', {
            name: ask.friend.displayName,
          })}
          confirmLabel={ask.action === 'remove' ? t('friends.remove') : t('friends.block')}
          danger
          onConfirm={() =>
            ask.action === 'remove'
              ? removeFriend.mutate(ask.friend.id)
              : blockUser.mutate(ask.friend.id)
          }
          onClose={() => setAsk(null)}
        />
      )}
    </>
  );
}

function RequestRows() {
  const { t } = useTranslation();
  const { data: requests } = useFriendRequests();
  const accept = useAcceptFriendRequest();
  const remove = useDeleteFriendRequest();

  const incoming = (requests ?? []).filter((r) => r.direction === 'incoming');
  const outgoing = (requests ?? []).filter((r) => r.direction === 'outgoing');

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyBlock
        icon={<UserPlus size={26} />}
        title={t('friends.noRequestsTitle')}
        hint={t('friends.noRequests')}
      />
    );
  }

  return (
    <>
      {incoming.length > 0 && (
        <div className="friends-count">
          {t('friends.incoming').toUpperCase()} — {incoming.length}
        </div>
      )}
      {incoming.map((request) => (
        <PersonRow key={request.id} userId={request.user.id}>
          <Avatar
            name={request.user.displayName}
            url={request.user.avatarUrl}
            className="friend-avatar"
          />
          <span className="friend-name">{request.user.displayName}</span>
          <span className="friend-status">@{request.user.username}</span>
          <button
            className="icon-button success"
            title={t('friends.accept')}
            onClick={() => accept.mutate(request.id)}
          >
            <Check size={18} />
          </button>
          <button
            className="icon-button danger"
            title={t('friends.decline')}
            onClick={() => remove.mutate(request.id)}
          >
            <X size={18} />
          </button>
        </PersonRow>
      ))}
      {outgoing.length > 0 && (
        <div className="friends-count">
          {t('friends.outgoing').toUpperCase()} — {outgoing.length}
        </div>
      )}
      {outgoing.map((request) => (
        <PersonRow key={request.id} userId={request.user.id}>
          <Avatar
            name={request.user.displayName}
            url={request.user.avatarUrl}
            className="friend-avatar"
          />
          <span className="friend-name">{request.user.displayName}</span>
          <span className="friend-status">@{request.user.username}</span>
          <button
            className="icon-button danger"
            title={t('friends.cancelRequest')}
            onClick={() => remove.mutate(request.id)}
          >
            <X size={18} />
          </button>
        </PersonRow>
      ))}
    </>
  );
}

function BlockedRows() {
  const { t } = useTranslation();
  const { data: blocked } = useBlockedUsers();
  const unblock = useUnblockUser();

  if (!blocked || blocked.length === 0) {
    return <p className="empty-state">{t('friends.noBlocked')}</p>;
  }
  return (
    <>
      <div className="friends-count">
        {t('friends.blocked').toUpperCase()} — {blocked.length}
      </div>
      {blocked.map((user) => (
        <PersonRow key={user.id} userId={user.id}>
          <Avatar name={user.displayName} url={user.avatarUrl} className="friend-avatar" />
          <span className="friend-name">{user.displayName}</span>
          <span className="friend-status" />
          <button className="btn-secondary" onClick={() => unblock.mutate(user.id)}>
            {t('friends.unblock')}
          </button>
        </PersonRow>
      ))}
    </>
  );
}

function AddFriend() {
  const { t } = useTranslation();
  const send = useSendFriendRequest();
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    send
      .mutateAsync(name)
      .then(({ autoAccepted }) => {
        setResult({
          ok: true,
          text: autoAccepted
            ? t('friends.nowFriends', { name })
            : t('friends.requestSent', { name }),
        });
        setUsername('');
      })
      .catch((err: Error) => setResult({ ok: false, text: err.message }));
  };

  return (
    <div className="friends-add">
      <h3>{t('friends.addTitle')}</h3>
      <p className="settings-hint">{t('friends.addHint')}</p>
      <form className="friends-add-form" onSubmit={submit}>
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setResult(null);
          }}
          placeholder={t('friends.addPlaceholder')}
          maxLength={24}
        />
        <button className="btn-primary" disabled={send.isPending || !username.trim()}>
          {t('friends.sendRequest')}
        </button>
      </form>
      {result && (
        <p className={result.ok ? 'friends-add-ok' : 'friends-add-error'}>{result.text}</p>
      )}
    </div>
  );
}

/** Домашний экран «Друзья»: В сети / Все / Заявки / Заблокированные / Добавить */
export default function FriendsView() {
  const { t } = useTranslation();
  const { data: requests } = useFriendRequests();
  const [tab, setTab] = useState<Tab>('online');

  const incomingCount = (requests ?? []).filter((r) => r.direction === 'incoming').length;

  const tabs: { key: Tab; label: string; icon: LucideIcon; badge?: number }[] = [
    { key: 'online', label: t('friends.online'), icon: Circle },
    { key: 'all', label: t('friends.all'), icon: Handshake },
    { key: 'requests', label: t('friends.requests'), icon: Inbox, badge: incomingCount },
    { key: 'blocked', label: t('friends.blocked'), icon: Ban },
  ];

  return (
    <div className="friends-view">
      <header className="friends-header">
        <span className="friends-title">
          <Handshake size={18} /> {t('nav.friends')}
        </span>
        <div className="friends-tabs">
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              className={`friends-tab${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={15} />
              {label}
              {badge ? <span className="mention-badge">{badge}</span> : null}
            </button>
          ))}
          <button
            className={`friends-tab add-friend${tab === 'add' ? ' active' : ''}`}
            onClick={() => setTab('add')}
          >
            <UserPlus size={15} /> {t('friends.add')}
          </button>
        </div>
      </header>

      <div className="friends-list">
        {tab === 'online' && <FriendRows online />}
        {tab === 'all' && <FriendRows online={false} />}
        {tab === 'requests' && <RequestRows />}
        {tab === 'blocked' && <BlockedRows />}
        {tab === 'add' && <AddFriend />}
      </div>
    </div>
  );
}
