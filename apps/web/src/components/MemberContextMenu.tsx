import { hasPermission, Permissions, type MemberDto } from '@voxa/shared';
import {
  AtSign,
  Check,
  ChevronRight,
  Clock,
  Copy,
  MessageSquare,
  Pencil,
  Phone,
  Shield,
  ShieldBan,
  ShieldCheck,
  UserRound,
  UserX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { ApiError } from '../api/client';
import { useUnban } from '../hooks/useAdmin';
import { useOpenDm } from '../hooks/useDm';
import { useAssignRole, useGuildRoles, useSetNickname } from '../hooks/useGuildAdmin';
import { useMyGuildPermissions } from '../hooks/useGuilds';
import { useModeration } from '../hooks/useModeration';
import { useAuthStore } from '../stores/auth';
import { useCallStore } from '../stores/call';
import { useChatStore } from '../stores/chat';
import { openProfile } from '../stores/profileView';
import PromptModal from './PromptModal';

export interface MenuState {
  x: number;
  y: number;
  member: MemberDto;
}

/** Контекст-меню участника: профиль, общение, роли и модерация */
export default function MemberContextMenu({
  menu,
  onClose,
}: {
  menu: MenuState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const { guildId } = useParams<{ guildId: string }>();
  const myId = useAuthStore((s) => s.user?.id);

  const { kick, ban, timeout, clearTimeout } = useModeration();
  const unban = useUnban(guildId);
  const openDm = useOpenDm();
  const setNickname = useSetNickname(guildId);
  const assignRole = useAssignRole(guildId);
  const startCall = useCallStore((s) => s.startCall);
  const callStatus = useCallStore((s) => s.status);

  const [rolesOpen, setRolesOpen] = useState(false);
  const [timeoutOpen, setTimeoutOpen] = useState(false);
  const [nickOpen, setNickOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const mask = useMyGuildPermissions(guildId);
  const canMute = hasPermission(mask, Permissions.MUTE_MEMBERS);
  const canKick = hasPermission(mask, Permissions.KICK_MEMBERS);
  const canBan = hasPermission(mask, Permissions.BAN_MEMBERS);
  const canRoles = hasPermission(mask, Permissions.MANAGE_ROLES);
  const { data: roles } = useGuildRoles(guildId, canRoles);

  const member = menu.member;
  const isSelf = member.id === myId;
  const isTimedOut = Boolean(member.timedOutUntil && new Date(member.timedOutUntil) > new Date());
  const myRoleIds = new Set(member.roles.map((r) => r.id));
  // Меню у правого края: подменю ролей и сроков раскрываем влево
  const flipLeft = menu.x > window.innerWidth - 480;

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

  const copyHandle = async (): Promise<void> => {
    await navigator.clipboard.writeText(`@${member.username}`).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const timeoutOptions: { key: string; minutes: number }[] = [
    { key: 'timeout10m', minutes: 10 },
    { key: 'timeout1h', minutes: 60 },
    { key: 'timeout1d', minutes: 60 * 24 },
    { key: 'timeout7d', minutes: 60 * 24 * 7 },
  ];

  return (
    <>
      <div
        className={`context-menu${flipLeft ? ' flip-left' : ''}`}
        ref={ref}
        style={{
          left: flipLeft ? undefined : menu.x,
          right: flipLeft ? 12 : undefined,
          top: menu.y,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="menu-title">{member.nickname ?? member.displayName}</div>

        <button
          className="menu-item"
          onClick={() => {
            onClose();
            openProfile(member.id);
          }}
        >
          <UserRound size={15} /> {t('profile.title')}
        </button>

        {!isSelf && (
          <button
            className="menu-item"
            onClick={() => {
              onClose();
              useChatStore.getState().requestInsert(`@${member.username}`);
            }}
          >
            <AtSign size={15} /> {t('members.mention')}
          </button>
        )}

        <button className="menu-item" onClick={() => void copyHandle()}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {t('members.copyHandle')}
        </button>

        {isSelf && (
          <button className="menu-item" onClick={() => setNickOpen(true)}>
            <Pencil size={15} /> {t('members.changeNickname')}
          </button>
        )}

        {!isSelf && (
          <>
            <div className="menu-divider" />
            <button
              className="menu-item"
              onClick={() => {
                onClose();
                openDm
                  .mutateAsync(member.id)
                  .then(({ id }) => navigate(`/dm/${id}`))
                  .catch(() => undefined);
              }}
            >
              <MessageSquare size={15} /> {t('dm.write')}
            </button>
            <button
              className="menu-item"
              disabled={callStatus !== 'idle'}
              onClick={() => {
                onClose();
                openDm
                  .mutateAsync(member.id)
                  .then(({ id }) => {
                    navigate(`/dm/${id}`);
                    void startCall(id, member.displayName, false, member.avatarUrl);
                  })
                  .catch(() => undefined);
              }}
            >
              <Phone size={15} /> {t('dm.startCallShort')}
            </button>
          </>
        )}

        {/* Роли: подменю с галочками, клик выдаёт или снимает */}
        {canRoles && !isSelf && (roles?.length ?? 0) > 0 && (
          <>
            <div className="menu-divider" />
            <div
              className="menu-sub"
              onMouseEnter={() => setRolesOpen(true)}
              onMouseLeave={() => setRolesOpen(false)}
            >
              <button className="menu-item" onClick={() => setRolesOpen(true)}>
                <Shield size={15} /> {t('members.roles')}
                <ChevronRight size={15} className="menu-chevron" />
              </button>
              {rolesOpen && (
                <div className="menu-sub-list">
                  {(roles ?? [])
                    .filter((role) => !role.isOwnerRole)
                    .map((role) => {
                      const has = myRoleIds.has(role.id);
                      return (
                        <button
                          key={role.id}
                          className="menu-item"
                          onClick={() =>
                            run(
                              assignRole.mutateAsync({
                                userId: member.id,
                                roleId: role.id,
                                assign: !has,
                              }),
                            )
                          }
                        >
                          <span
                            className="role-dot"
                            style={role.color ? { background: role.color } : undefined}
                          />
                          {role.name}
                          {has && <Check size={14} className="menu-chevron" />}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          </>
        )}

        {!isSelf && (canMute || canKick || canBan) && <div className="menu-divider" />}

        {canMute && !isSelf && !isTimedOut && (
          <div
            className="menu-sub"
            onMouseEnter={() => setTimeoutOpen(true)}
            onMouseLeave={() => setTimeoutOpen(false)}
          >
            <button className="menu-item" onClick={() => setTimeoutOpen(true)}>
              <Clock size={15} /> {t('moderation.timeout')}
              <ChevronRight size={15} className="menu-chevron" />
            </button>
            {timeoutOpen && (
              <div className="menu-sub-list">
                {timeoutOptions.map((option) => (
                  <button
                    key={option.key}
                    className="menu-item"
                    onClick={() =>
                      run(timeout.mutateAsync({ userId: member.id, minutes: option.minutes }))
                    }
                  >
                    {t(`moderation.${option.key}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {canMute && !isSelf && isTimedOut && (
          <button className="menu-item" onClick={() => run(clearTimeout.mutateAsync(member.id))}>
            <Clock size={15} /> {t('moderation.clearTimeout')}
          </button>
        )}

        {canKick && !isSelf && (
          <button
            className="menu-item danger"
            onClick={() =>
              withReason(t('moderation.kickReason'), (reason) =>
                kick.mutateAsync({ userId: member.id, reason }),
              )
            }
          >
            <UserX size={15} /> {t('moderation.kick')}
          </button>
        )}
        {canBan && !isSelf && !member.banned && (
          <button
            className="menu-item danger"
            onClick={() =>
              withReason(t('moderation.banReason'), (reason) =>
                ban.mutateAsync({ userId: member.id, reason }),
              )
            }
          >
            <ShieldBan size={15} /> {t('moderation.ban')}
          </button>
        )}
        {canBan && !isSelf && member.banned && (
          <button className="menu-item" onClick={() => run(unban.mutateAsync(member.id))}>
            <ShieldCheck size={15} /> {t('community.unban')}
          </button>
        )}
      </div>

      {nickOpen && (
        <PromptModal
          title={t('members.changeNickname')}
          label={t('members.nicknameLabel')}
          initialValue={member.nickname ?? ''}
          allowEmpty
          maxLength={32}
          onClose={() => setNickOpen(false)}
          onSubmit={(value) => {
            onClose();
            setNickname.mutate(value);
          }}
        />
      )}
    </>
  );
}
