import type { UserProfileDto } from '@voxa/shared';
import {
  Ban,
  Crown,
  MessageSquare,
  Phone,
  ShieldCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useOpenDm } from '../hooks/useDm';
import {
  useBlockUser,
  useRemoveFriend,
  useSendFriendRequest,
  useUnblockUser,
} from '../hooks/useFriends';
import { useProfile, useRefreshProfile } from '../hooks/useProfile';
import { useCallStore } from '../stores/call';
import Avatar from './Avatar';

const joinedFormat = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Инициалы для аватара-заглушки */
function initials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

/** Акцент профиля: свой цвет пользователя либо фирменный цвет приложения */
function accentStyle(profile: UserProfileDto): React.CSSProperties {
  return profile.accentColor
    ? ({ '--profile-accent': profile.accentColor } as React.CSSProperties)
    : {};
}

/** Наполнение карточки профиля: обложка, опознавательные знаки, действия */
export function ProfileBody({ userId, onNavigate }: { userId: string; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: profile, isLoading } = useProfile(userId);
  const refreshProfile = useRefreshProfile();

  const openDm = useOpenDm();
  const addFriend = useSendFriendRequest();
  const removeFriend = useRemoveFriend();
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const startCall = useCallStore((s) => s.startCall);
  const callStatus = useCallStore((s) => s.status);

  if (isLoading || !profile) {
    return (
      <div className="profile-card loading">
        <div className="profile-cover" />
        <div className="profile-body">
          <div className="skeleton-line" style={{ width: '55%' }} />
          <div className="skeleton-line" style={{ width: '35%' }} />
          <div className="skeleton-line" style={{ width: '80%' }} />
        </div>
      </div>
    );
  }

  const isSelf = profile.relation === 'self';
  const after = (): void => refreshProfile(profile.id);

  const message = (): void => {
    openDm.mutate(profile.id, {
      onSuccess: ({ id }) => {
        onNavigate?.();
        navigate(`/dm/${id}`);
      },
    });
  };

  const call = (): void => {
    openDm.mutate(profile.id, {
      onSuccess: ({ id }) => {
        onNavigate?.();
        navigate(`/dm/${id}`);
        void startCall(id, profile.displayName, false, profile.avatarUrl);
      },
    });
  };

  return (
    <div className="profile-card" style={accentStyle(profile)}>
      <div className="profile-cover" />

      <div className="profile-head">
        <Avatar
          name={profile.displayName}
          url={profile.avatarUrl}
          status={profile.status}
          className="profile-avatar"
        />
        <div className="profile-titles">
          <div className="profile-name">
            {profile.displayName}
            {profile.isInstanceOwner && (
              <span className="profile-badge owner" title={t('profile.ownerBadge')}>
                <Crown size={12} /> {t('profile.ownerBadge')}
              </span>
            )}
            {profile.relation === 'friends' && (
              <span className="profile-badge friend" title={t('profile.friendBadge')}>
                <ShieldCheck size={12} /> {t('profile.friendBadge')}
              </span>
            )}
          </div>
          <div className="profile-username">@{profile.username}</div>
          {profile.statusText && <p className="profile-status-text">{profile.statusText}</p>}
        </div>
      </div>

      <div className="profile-body">
        {profile.bio && (
          <section className="profile-section">
            <h4>{t('profile.about')}</h4>
            <p className="profile-bio">{profile.bio}</p>
          </section>
        )}

        <section className="profile-section">
          <h4>{t('profile.joined')}</h4>
          <p className="profile-fact">{joinedFormat.format(new Date(profile.createdAt))}</p>
        </section>

        {profile.mutualGuilds.length > 0 && (
          <section className="profile-section">
            <h4>
              {t('profile.mutualServers')} — {profile.mutualGuilds.length}
            </h4>
            <div className="profile-guilds">
              {profile.mutualGuilds.map((guild) => (
                <button
                  key={guild.id}
                  className="profile-guild"
                  onClick={() => {
                    onNavigate?.();
                    navigate(`/guilds/${guild.id}`);
                  }}
                >
                  <span className="profile-guild-icon" aria-hidden>
                    {guild.iconUrl ? <img src={guild.iconUrl} alt="" /> : initials(guild.name)}
                  </span>
                  <span className="profile-guild-name">{guild.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {profile.mutualFriends > 0 && (
          <section className="profile-section">
            <h4>{t('profile.mutualFriends')}</h4>
            <p className="profile-fact">{profile.mutualFriends}</p>
          </section>
        )}

        {!isSelf && (
          <div className="profile-actions">
            <button className="btn-primary" onClick={message} disabled={openDm.isPending}>
              <MessageSquare size={15} /> {t('profile.message')}
            </button>
            <button
              className="btn-secondary"
              onClick={call}
              disabled={openDm.isPending || callStatus !== 'idle'}
            >
              <Phone size={15} /> {t('profile.call')}
            </button>

            {profile.relation === 'none' && !profile.blocked && (
              <button
                className="btn-secondary"
                onClick={() => addFriend.mutate(profile.username, { onSuccess: after })}
                disabled={addFriend.isPending}
              >
                <UserPlus size={15} /> {t('profile.addFriend')}
              </button>
            )}
            {profile.relation === 'outgoing' && (
              <button className="btn-secondary" disabled>
                {t('profile.requestSent')}
              </button>
            )}
            {profile.relation === 'incoming' && (
              <button
                className="btn-secondary"
                onClick={() => addFriend.mutate(profile.username, { onSuccess: after })}
                disabled={addFriend.isPending}
              >
                <UserPlus size={15} /> {t('profile.acceptRequest')}
              </button>
            )}
            {profile.relation === 'friends' && (
              <button
                className="btn-secondary danger-text"
                onClick={() => removeFriend.mutate(profile.id, { onSuccess: after })}
                disabled={removeFriend.isPending}
              >
                <UserMinus size={15} /> {t('profile.removeFriend')}
              </button>
            )}

            {profile.blocked ? (
              <button
                className="btn-secondary"
                onClick={() => unblock.mutate(profile.id, { onSuccess: after })}
              >
                <Ban size={15} /> {t('profile.unblock')}
              </button>
            ) : (
              <button
                className="btn-secondary danger-text"
                onClick={() => block.mutate(profile.id, { onSuccess: after })}
              >
                <Ban size={15} /> {t('profile.block')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Профиль поверх интерфейса: открывается кликом по участнику или автору */
export default function ProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="profile-modal">
        <button className="icon-button profile-close" title={t('settings.close')} onClick={onClose}>
          <X size={16} />
        </button>
        <ProfileBody userId={userId} onNavigate={onClose} />
      </div>
    </div>
  );
}
