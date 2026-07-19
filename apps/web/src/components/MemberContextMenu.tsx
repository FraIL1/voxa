import { hasPermission, Permissions, type MemberDto } from '@voxa/shared';
import { Clock, MessageSquare, ShieldBan, ShieldCheck, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { ApiError } from '../api/client';
import { useUnban } from '../hooks/useAdmin';
import { useOpenDm } from '../hooks/useDm';
import { useModeration } from '../hooks/useModeration';
import { useAuthStore } from '../stores/auth';

export interface MenuState {
  x: number;
  y: number;
  member: MemberDto;
}

/** Контекст-меню модерации (правый клик по участнику) */
export default function MemberContextMenu({
  menu,
  onClose,
}: {
  menu: MenuState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const { kick, ban, timeout, clearTimeout } = useModeration();
  const unban = useUnban();
  const openDm = useOpenDm();

  const mask = me?.permissions ?? 0;
  const canMute = hasPermission(mask, Permissions.MUTE_MEMBERS);
  const canKick = hasPermission(mask, Permissions.KICK_MEMBERS);
  const canBan = hasPermission(mask, Permissions.BAN_MEMBERS);
  const isTimedOut = Boolean(
    menu.member.timedOutUntil && new Date(menu.member.timedOutUntil) > new Date(),
  );

  const run = (action: Promise<unknown>): void => {
    onClose();
    action.catch((error: unknown) => {
      window.alert(error instanceof ApiError ? error.message : t('auth.genericError'));
    });
  };

  const withReason = (message: string, fn: (reason?: string) => Promise<unknown>): void => {
    const reason = window.prompt(message) ?? undefined;
    // Отмена диалога — отмена действия; пустая строка — действие без причины
    if (reason === undefined) {
      onClose();
      return;
    }
    run(fn(reason.trim() || undefined));
  };

  const timeoutItem = (label: string, minutes: number) => (
    <button
      className="menu-item"
      onClick={() => run(timeout.mutateAsync({ userId: menu.member.id, minutes }))}
    >
      <Clock size={14} /> {label}
    </button>
  );

  return (
    <>
      <div
        className="picker-backdrop"
        onClick={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="context-menu" style={{ left: menu.x, top: menu.y }}>
        <div className="menu-title">{menu.member.username}</div>

        <button
          className="menu-item"
          onClick={() => {
            onClose();
            openDm
              .mutateAsync(menu.member.id)
              .then(({ id }) => navigate(`/dm/${id}`))
              .catch(() => undefined);
          }}
        >
          <MessageSquare size={14} /> {t('dm.write')}
        </button>

        {canMute && !isTimedOut && (
          <>
            {timeoutItem(t('moderation.timeout10m'), 10)}
            {timeoutItem(t('moderation.timeout1h'), 60)}
            {timeoutItem(t('moderation.timeout1d'), 60 * 24)}
          </>
        )}
        {canMute && isTimedOut && (
          <button
            className="menu-item"
            onClick={() => run(clearTimeout.mutateAsync(menu.member.id))}
          >
            <Clock size={14} /> {t('moderation.clearTimeout')}
          </button>
        )}

        {canKick && (
          <button
            className="menu-item danger"
            onClick={() =>
              withReason(t('moderation.kickReason'), (reason) =>
                kick.mutateAsync({ userId: menu.member.id, reason }),
              )
            }
          >
            <UserX size={14} /> {t('moderation.kick')}
          </button>
        )}
        {canBan && !menu.member.banned && (
          <button
            className="menu-item danger"
            onClick={() =>
              withReason(t('moderation.banReason'), (reason) =>
                ban.mutateAsync({ userId: menu.member.id, reason }),
              )
            }
          >
            <ShieldBan size={14} /> {t('moderation.ban')}
          </button>
        )}
        {canBan && menu.member.banned && (
          <button className="menu-item" onClick={() => run(unban.mutateAsync(menu.member.id))}>
            <ShieldCheck size={14} /> {t('community.unban')}
          </button>
        )}
      </div>
    </>
  );
}
