import type { FriendDto } from '@voxa/shared';
import { Ban, Check, MessageSquare, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useOpenDm } from '../hooks/useDm';
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

function Avatar({ username, status }: { username: string; status?: FriendDto['status'] }) {
  return (
    <div className="avatar friend-avatar" aria-hidden>
      {username.slice(0, 1).toUpperCase()}
      {status && <span className={`status-dot ${status}`} />}
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

  const shown = (friends ?? []).filter((f) => !online || f.status === 'online');

  const write = (userId: string): void => {
    openDm
      .mutateAsync(userId)
      .then(({ id }) => navigate(`/dm/${id}`))
      .catch(() => undefined);
  };

  const remove = (friend: FriendDto): void => {
    if (window.confirm(t('friends.removeConfirm', { name: friend.username }))) {
      removeFriend.mutate(friend.id);
    }
  };

  const block = (friend: FriendDto): void => {
    if (window.confirm(t('friends.blockConfirm', { name: friend.username }))) {
      blockUser.mutate(friend.id);
    }
  };

  return (
    <>
      <div className="friends-count">
        {(online ? t('friends.online') : t('friends.all')).toUpperCase()} — {shown.length}
      </div>
      {shown.length === 0 && <p className="empty-state">{t('friends.empty')}</p>}
      {shown.map((friend) => (
        <div key={friend.id} className="friend-row">
          <Avatar username={friend.username} status={friend.status} />
          <span className="friend-name">{friend.username}</span>
          <span className="friend-status">
            {friend.status === 'online' ? t('members.online') : t('members.offline')}
          </span>
          <button className="icon-button" title={t('dm.write')} onClick={() => write(friend.id)}>
            <MessageSquare size={18} />
          </button>
          <button
            className="icon-button"
            title={t('friends.remove')}
            onClick={() => remove(friend)}
          >
            <UserMinus size={18} />
          </button>
          <button
            className="icon-button danger"
            title={t('friends.block')}
            onClick={() => block(friend)}
          >
            <Ban size={18} />
          </button>
        </div>
      ))}
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
    return <p className="empty-state">{t('friends.noRequests')}</p>;
  }

  return (
    <>
      {incoming.length > 0 && (
        <div className="friends-count">
          {t('friends.incoming').toUpperCase()} — {incoming.length}
        </div>
      )}
      {incoming.map((request) => (
        <div key={request.id} className="friend-row">
          <Avatar username={request.user.username} />
          <span className="friend-name">{request.user.username}</span>
          <span className="friend-status">{t('friends.incomingHint')}</span>
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
        </div>
      ))}
      {outgoing.length > 0 && (
        <div className="friends-count">
          {t('friends.outgoing').toUpperCase()} — {outgoing.length}
        </div>
      )}
      {outgoing.map((request) => (
        <div key={request.id} className="friend-row">
          <Avatar username={request.user.username} />
          <span className="friend-name">{request.user.username}</span>
          <span className="friend-status">{t('friends.outgoingHint')}</span>
          <button
            className="icon-button danger"
            title={t('friends.cancelRequest')}
            onClick={() => remove.mutate(request.id)}
          >
            <X size={18} />
          </button>
        </div>
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
        <div key={user.id} className="friend-row">
          <Avatar username={user.username} />
          <span className="friend-name">{user.username}</span>
          <span className="friend-status" />
          <button className="btn-secondary" onClick={() => unblock.mutate(user.id)}>
            {t('friends.unblock')}
          </button>
        </div>
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

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'online', label: t('friends.online') },
    { key: 'all', label: t('friends.all') },
    { key: 'requests', label: t('friends.requests'), badge: incomingCount },
    { key: 'blocked', label: t('friends.blocked') },
  ];

  return (
    <div className="friends-view">
      <header className="friends-header">
        <span className="friends-title">
          <Users size={18} /> {t('nav.friends')}
        </span>
        <div className="friends-tabs">
          {tabs.map(({ key, label, badge }) => (
            <button
              key={key}
              className={`friends-tab${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
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
