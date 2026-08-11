import type { MeDto, PresenceMode } from '@voxa/shared';
import { Check, ChevronRight, Copy, LogOut, Pencil, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSubmenuFlip } from '../hooks/useMenuPlacement';
import { logout } from '../api/auth';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import Avatar from './Avatar';

/** Порядок в подменю: от «я тут» к «меня нет» */
const MODES: PresenceMode[] = ['ONLINE', 'IDLE', 'DND', 'INVISIBLE'];

/** Класс точки присутствия для выбранного режима */
export function dotOf(mode: PresenceMode): string {
  if (mode === 'DND') return 'dnd';
  if (mode === 'IDLE') return 'idle';
  if (mode === 'INVISIBLE') return 'offline';
  return 'online';
}

/**
 * Меню своего профиля над карточкой пользователя: кто я, быстрый переход
 * в настройки, выбор статуса подменю и своя строчка статуса.
 */
export default function ProfileMenu({
  onClose,
  onEditProfile,
}: {
  onClose: () => void;
  onEditProfile: () => void;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const ref = useRef<HTMLDivElement>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const submenu = useSubmenuFlip(statusOpen);

  // Закрытие по клику мимо и по Escape — как у остальных всплывающих меню
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const pick = async (mode: PresenceMode): Promise<void> => {
    onClose();
    if (mode === user?.presenceMode) return;
    const me = await api<MeDto>('/users/me/presence', { method: 'PATCH', body: { mode } }).catch(
      () => null,
    );
    if (me) setUser(me);
  };

  const copyHandle = async (): Promise<void> => {
    await navigator.clipboard.writeText(`@${user?.username ?? ''}`).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const mode = user?.presenceMode ?? 'ONLINE';

  return (
    <div className="profile-menu" ref={ref}>
      <div className="profile-menu-head">
        <Avatar
          name={user?.displayName ?? '?'}
          url={user?.avatarUrl}
          className={`profile-menu-avatar dot-${dotOf(mode)}`}
        />
        <div className="profile-menu-name">{user?.displayName}</div>
        <button className="profile-menu-handle" onClick={() => void copyHandle()}>
          @{user?.username}
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        {user?.statusText && <div className="profile-menu-status">{user.statusText}</div>}
      </div>

      <div className="profile-menu-group">
        <button
          className="menu-item"
          onClick={() => {
            onClose();
            onEditProfile();
          }}
        >
          <Pencil size={15} /> {t('profile.editProfile')}
        </button>

        {/* Статус — подменю: в свёрнутом виде показывает текущий выбор */}
        <div
          className="menu-sub"
          onMouseEnter={() => setStatusOpen(true)}
          onMouseLeave={() => setStatusOpen(false)}
        >
          <button className="menu-item" onClick={() => setStatusOpen(true)}>
            <span className={`status-dot ${dotOf(mode)}`} />
            {t(`presence.${mode}`)}
            <ChevronRight size={15} className="menu-chevron" />
          </button>

          {statusOpen && (
            <div className={`menu-sub-list${submenu.up ? ' up' : ''}`} ref={submenu.ref}>
              {MODES.map((item) => (
                <button
                  key={item}
                  className={`status-menu-item${mode === item ? ' active' : ''}`}
                  onClick={() => void pick(item)}
                >
                  <span className={`status-dot ${dotOf(item)}`} />
                  <span className="status-menu-text">
                    <span className="status-menu-title">{t(`presence.${item}`)}</span>
                    <span className="status-menu-hint">{t(`presence.${item}_hint`)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="menu-item"
          onClick={() => {
            onClose();
            onEditProfile();
          }}
        >
          <Sparkles size={15} /> {t('profile.setStatusText')}
        </button>
      </div>

      <div className="profile-menu-group">
        <button className="menu-item danger" onClick={() => void logout()}>
          <LogOut size={15} /> {t('settings.logout')}
        </button>
      </div>
    </div>
  );
}
