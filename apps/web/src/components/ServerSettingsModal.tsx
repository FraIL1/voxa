import { hasPermission, Permissions } from '@voxa/shared';
import {
  Ban,
  Link2,
  ScrollText,
  Settings2,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useGuild } from '../hooks/useGuilds';
import { useAuthStore } from '../stores/auth';
import { Audit, Bans, Invites } from './CommunityTab';
import JoinRequestsTab from './JoinRequestsTab';
import MembersTab from './MembersTab';
import RolesTab from './RolesTab';
import ServerProfileTab from './ServerProfileTab';

type Tab = 'profile' | 'roles' | 'members' | 'requests' | 'invites' | 'bans' | 'audit';

/** Настройки сервера (guild): профиль, роли, участники, приглашения, баны, журнал */
export default function ServerSettingsModal({
  guildId,
  initialTab = 'profile',
  onClose,
}: {
  guildId: string;
  initialTab?: Tab;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const guild = useGuild(guildId);
  const mask = guild?.myPermissions ?? 0;
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canRoles = hasPermission(mask, Permissions.MANAGE_ROLES);
  const canInvite = hasPermission(mask, Permissions.CREATE_INVITES);
  const canBan = hasPermission(mask, Permissions.BAN_MEMBERS);
  const canKick = hasPermission(mask, Permissions.KICK_MEMBERS);
  const isAdmin = hasPermission(mask, Permissions.ADMINISTRATOR);
  const myId = useAuthStore((state) => state.user?.id);
  const isOwner = guild?.ownerId === myId;
  /* Заявки нужны одному режиму из трёх. В остальных раздел висел пустым и
     непонятным — прячем его, пока сервер не пускает людей по заявке. */
  const byRequest = guild?.joinMode === 'REQUEST';

  /* Разделы собраны по смыслу: сам сервер, люди, порядок, опасное.
     Семь одинаковых строк подряд не дают понять, где что искать. */
  const groups: { label: string; items: [Tab, string, boolean, LucideIcon][] }[] = [
    {
      label: t('serverSettings.groupServer'),
      items: [['profile', t('serverSettings.profile'), true, Settings2]],
    },
    {
      label: t('serverSettings.groupPeople'),
      items: [
        ['roles', t('roles.title'), canRoles, Shield],
        ['members', t('serverSettings.members'), canRoles, Users],
        ['requests', t('serverSettings.requests'), canKick && byRequest, UserPlus],
        ['invites', t('community.invites'), canInvite, Link2],
      ],
    },
    {
      label: t('serverSettings.groupOrder'),
      items: [
        ['bans', t('community.bans'), canBan, Ban],
        ['audit', t('community.audit'), isAdmin, ScrollText],
      ],
    },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel server" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          {/* Шапка отвечает на вопрос «чей это сервер» до чтения разделов */}
          <div className="srv-head">
            <span className="srv-head-icon" aria-hidden>
              {guild?.iconUrl ? (
                <img src={guild.iconUrl} alt="" />
              ) : (
                (guild?.name ?? '?').slice(0, 1).toUpperCase()
              )}
            </span>
            <div>
              <b>{guild?.name ?? t('serverSettings.title')}</b>
            </div>
          </div>

          {groups.map((group) => {
            const visible = group.items.filter(([, , show]) => show);
            if (visible.length === 0) return null;
            return (
              <div key={group.label} className="settings-nav-group">
                <div className="settings-nav-group-name">{group.label}</div>
                {visible.map(([id, label, , Icon]) => (
                  <button
                    key={id}
                    className={`settings-tab${tab === id ? ' active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </div>
            );
          })}

          <div className="settings-nav-spacer" />

          {/* Удаление сервера — красным и в самом низу: промахнуться не должно быть куда */}
          {isOwner && (
            <div className="settings-nav-group">
              {/* Без заголовка: красная строка внизу и так читается как опасная */}
              <button className="settings-tab danger" onClick={() => setTab('profile')}>
                <Trash2 size={17} />
                {t('serverSettings.delete')}
              </button>
            </div>
          )}
        </nav>

        <div className="settings-content">
          <button
            className="icon-button settings-close"
            title={t('settings.close')}
            onClick={onClose}
          >
            <X size={20} />
          </button>
          {tab === 'profile' && <ServerProfileTab guildId={guildId} onClose={onClose} />}
          {tab === 'roles' && <RolesTab guildId={guildId} />}
          {tab === 'members' && <MembersTab guildId={guildId} />}
          {tab === 'requests' && <JoinRequestsTab guildId={guildId} />}
          {tab === 'invites' && (
            <>
              <h2>{t('community.invites')}</h2>
              <Invites />
            </>
          )}
          {tab === 'bans' && (
            <>
              <h2>{t('community.bans')}</h2>
              <Bans />
            </>
          )}
          {tab === 'audit' && (
            <>
              <h2>{t('community.audit')}</h2>
              <Audit />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
