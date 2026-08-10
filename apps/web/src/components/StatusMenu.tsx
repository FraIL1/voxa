import type { MeDto, PresenceMode } from '@voxa/shared';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

/** Порядок в меню: от «я тут» к «меня нет» */
const MODES: PresenceMode[] = ['ONLINE', 'IDLE', 'DND', 'INVISIBLE'];

/** Класс точки присутствия для выбранного режима */
export function dotOf(mode: PresenceMode): string {
  if (mode === 'DND') return 'dnd';
  if (mode === 'IDLE') return 'idle';
  if (mode === 'INVISIBLE') return 'offline';
  return 'online';
}

/** Меню выбора присутствия: разворачивается над карточкой пользователя */
export default function StatusMenu({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div className="status-menu" ref={ref}>
      {MODES.map((mode) => (
        <button
          key={mode}
          className={`status-menu-item${user?.presenceMode === mode ? ' active' : ''}`}
          onClick={() => void pick(mode)}
        >
          <span className={`status-dot ${dotOf(mode)}`} />
          <span className="status-menu-text">
            <span className="status-menu-title">{t(`presence.${mode}`)}</span>
            <span className="status-menu-hint">{t(`presence.${mode}_hint`)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
