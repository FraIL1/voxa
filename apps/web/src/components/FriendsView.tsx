import type { MemberDto } from '@voxa/shared';
import { MessageSquare, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useOpenDm } from '../hooks/useDm';
import { useMembers } from '../hooks/useMembers';
import { useAuthStore } from '../stores/auth';

type Tab = 'online' | 'all';

/** Домашний экран: участники сообщества как «друзья» (В сети / Все) + «Написать».
 *  Полноценная система друзей (заявки/блок) появится в отдельной фазе. */
export default function FriendsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: members } = useMembers();
  const myId = useAuthStore((s) => s.user?.id);
  const openDm = useOpenDm();
  const [tab, setTab] = useState<Tab>('online');

  const others = (members ?? []).filter((m) => m.id !== myId);
  const shown = tab === 'online' ? others.filter((m) => m.status === 'online') : others;

  const write = (member: MemberDto): void => {
    openDm
      .mutateAsync(member.id)
      .then(({ id }) => navigate(`/dm/${id}`))
      .catch(() => undefined);
  };

  return (
    <div className="friends-view">
      <header className="friends-header">
        <span className="friends-title">
          <Users size={18} /> {t('nav.friends')}
        </span>
        <div className="friends-tabs">
          <button
            className={`friends-tab${tab === 'online' ? ' active' : ''}`}
            onClick={() => setTab('online')}
          >
            {t('friends.online')}
          </button>
          <button
            className={`friends-tab${tab === 'all' ? ' active' : ''}`}
            onClick={() => setTab('all')}
          >
            {t('friends.all')}
          </button>
        </div>
      </header>

      <div className="friends-list">
        <div className="friends-count">
          {(tab === 'online' ? t('friends.online') : t('friends.all')).toUpperCase()} —{' '}
          {shown.length}
        </div>
        {shown.length === 0 && <p className="empty-state">{t('friends.empty')}</p>}
        {shown.map((member) => {
          const color =
            member.status === 'online' ? (member.roles[0]?.color ?? undefined) : undefined;
          return (
            <div key={member.id} className="friend-row">
              <div className="avatar friend-avatar" aria-hidden>
                {member.username.slice(0, 1).toUpperCase()}
                <span className={`status-dot ${member.status}`} />
              </div>
              <span className="friend-name" style={color ? { color } : undefined}>
                {member.username}
              </span>
              <span className="friend-status">
                {member.status === 'online' ? t('members.online') : t('members.offline')}
              </span>
              <button className="icon-button" title={t('dm.write')} onClick={() => write(member)}>
                <MessageSquare size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
