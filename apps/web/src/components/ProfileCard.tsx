import type { UserProfileDto } from '@voxa/shared';
import {
  Ban,
  Crown,
  Info,
  MessageSquare,
  Phone,
  ShieldCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useOpenDm } from '../hooks/useDm';
import {
  useBlockUser,
  useRemoveFriend,
  useSendFriendRequest,
  useUnblockUser,
} from '../hooks/useFriends';
import { useProfile, useRefreshProfile, useSetUserNote } from '../hooks/useProfile';
import { useCallStore } from '../stores/call';
import { useProfileViewStore } from '../stores/profileView';
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

/** Сколько человек здесь: «4 месяца», «второй год» — понятнее точной даты */
function sinceLabel(iso: string): string {
  const months = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / (30 * 24 * 3600 * 1000)),
  );
  if (months < 1) return 'меньше месяца';
  if (months < 12) return `${months} мес.`;
  const years = Math.floor(months / 12);
  return `${years} г.`;
}

/** Акцент профиля: свой цвет пользователя либо фирменный цвет приложения */
function accentStyle(profile: UserProfileDto): React.CSSProperties {
  return profile.accentColor
    ? ({ '--profile-accent': profile.accentColor } as React.CSSProperties)
    : {};
}

type ProfileTab = 'about' | 'guilds' | 'note';

/**
 * Карточка профиля из двух половин: слева кто это и что с ним можно сделать,
 * справа подробности по вкладкам. Одной колонкой карточка росла вниз и
 * кнопки действий уезжали под сгиб — до них надо было прокручивать.
 */
export function ProfileBody({
  userId,
  onNavigate,
  compact = false,
}: {
  userId: string;
  onNavigate?: () => void;
  /** Боковая панель: только кнопки, подробности открываются отдельным окном */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: profile, isLoading } = useProfile(userId);
  const refreshProfile = useRefreshProfile();

  const openDm = useOpenDm();
  const addFriend = useSendFriendRequest();
  const removeFriend = useRemoveFriend();
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const setNote = useSetUserNote();
  const startCall = useCallStore((s) => s.startCall);
  const callStatus = useCallStore((s) => s.status);
  const [tab, setTab] = useState<ProfileTab>('about');
  const openProfile = useProfileViewStore((state) => state.open);

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
    <div className={`profile-card${compact ? ' compact' : ''}`} style={accentStyle(profile)}>
      <div className="profile-cover" />

      <div className="profile-left">
        <Avatar
          name={profile.displayName}
          url={profile.avatarUrl}
          status={profile.status}
          className="profile-avatar"
        />

        <div className="profile-name">
          {profile.myAlias ?? profile.displayName}
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

        <div className="profile-username">
          @{profile.username}
          {profile.myAlias ? ' · ' + profile.displayName : ''}
        </div>

        {profile.statusText && <p className="profile-status-text">{profile.statusText}</p>}

        {!isSelf && (
          <div className="profile-actions">
            {compact && (
              <button className="btn-secondary" onClick={() => openProfile(profile.id)}>
                <Info size={15} /> {t('profile.openFull')}
              </button>
            )}
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
                <UserPlus size={15} /> {t('profile.requestSent')}
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

      {!compact && (
        <div className="profile-right">
          <nav className="profile-tabs">
            <button
              className={`profile-tab${tab === 'about' ? ' active' : ''}`}
              onClick={() => setTab('about')}
            >
              {t('profile.tabAbout')}
            </button>
            <button
              className={`profile-tab${tab === 'guilds' ? ' active' : ''}`}
              onClick={() => setTab('guilds')}
            >
              {t('profile.tabGuilds')}
              {profile.mutualGuilds.length > 0 && (
                <span className="profile-tab-count">{profile.mutualGuilds.length}</span>
              )}
            </button>
            {!isSelf && (
              <button
                className={`profile-tab${tab === 'note' ? ' active' : ''}`}
                onClick={() => setTab('note')}
              >
                {t('profile.tabNote')}
              </button>
            )}
          </nav>

          <div className="profile-panel">
            {tab === 'about' && (
              <>
                {/* Две плитки сверху: сколько человек здесь и насколько вы пересекаетесь */}
                <div className="profile-stats">
                  <div className="profile-stat">
                    <b>{sinceLabel(profile.createdAt)}</b>
                    <span>{joinedFormat.format(new Date(profile.createdAt))}</span>
                  </div>
                  <div className="profile-stat">
                    <b>{profile.mutualGuilds.length}</b>
                    <span>{t('profile.mutualCount')}</span>
                  </div>
                </div>

                {profile.bio && (
                  <section className="profile-section">
                    <h4>{t('profile.about')}</h4>
                    <p className="profile-bio">{profile.bio}</p>
                  </section>
                )}

                {profile.mutualGuilds.length > 0 && (
                  <section className="profile-section">
                    <h4>{t('profile.tabGuilds')}</h4>
                    <div className="profile-chips">
                      {profile.mutualGuilds.map((guild) => (
                        <button
                          key={guild.id}
                          className="profile-chip"
                          onClick={() => {
                            onNavigate?.();
                            navigate(`/guilds/${guild.id}`);
                          }}
                        >
                          <span className="profile-chip-icon" aria-hidden>
                            {guild.iconUrl ? (
                              <img src={guild.iconUrl} alt="" />
                            ) : (
                              initials(guild.name)
                            )}
                          </span>
                          {guild.name}
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
              </>
            )}

            {tab === 'guilds' &&
              (profile.mutualGuilds.length === 0 ? (
                <p className="empty-state">{t('profile.noGuilds')}</p>
              ) : (
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
              ))}

            {tab === 'note' && !isSelf && (
              <section className="profile-section">
                <h4>{t('profile.personalNote')}</h4>
                {/* Заметку видит только тот, кто её написал */}
                <textarea
                  className="profile-note-input"
                  defaultValue={profile.myNote ?? ''}
                  placeholder={t('profile.notePlaceholder')}
                  rows={7}
                  onBlur={(e) =>
                    setNote.mutate({ userId: profile.id, note: e.target.value.trim() })
                  }
                />
                <p className="settings-hint">{t('profile.noteOnlyYou')}</p>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Профиль поверх интерфейса: открывается кликом по участнику или автору */
export default function ProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  // Escape закрывает карточку — так закрываются все остальные окна
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { t } = useTranslation();
  const origin = useProfileViewStore((s) => s.origin);
  const cardRef = useRef<HTMLDivElement>(null);

  /**
   * Карточка вылетает из того места, по которому кликнули. Считаем смещение
   * от её центра до этой точки и стартуем оттуда.
   *
   * transform-origin тут не годится: он отсчитывается от угла самого окна, а
   * точка клика — в координатах экрана. Из-за этого прошлая версия сжималась
   * из случайного места, и движения было не видно.
   *
   * Класс вешаем здесь же, до первого кадра: иначе анимация успевает начаться
   * со значениями по умолчанию.
   */
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !origin) return;
    /* Мерим offset-геометрию, а не getBoundingClientRect: последняя учитывает
       уже наложенное преобразование. В разработке React прогоняет эффект
       дважды, второй проход мерил уже сдвинутую анимацией карточку — смещение
       обнулялось, и движения было не видно. */
    const centerX = card.offsetLeft + card.offsetWidth / 2;
    const centerY = card.offsetTop + card.offsetHeight / 2;
    card.style.setProperty('--dx', `${origin.x - centerX}px`);
    card.style.setProperty('--dy', `${origin.y - centerY}px`);
    card.classList.add('grows');
  }, [origin]);

  return (
    <div
      className="settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="profile-modal" ref={cardRef}>
        <button className="icon-button profile-close" title={t('settings.close')} onClick={onClose}>
          <X size={16} />
        </button>
        <ProfileBody userId={userId} onNavigate={onClose} />
      </div>
    </div>
  );
}
