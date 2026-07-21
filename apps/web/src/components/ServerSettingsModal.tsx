import { hasPermission, Permissions } from '@voxa/shared';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useGuild } from '../hooks/useGuilds';
import { Audit, Bans, Invites } from './CommunityTab';
import MembersTab from './MembersTab';
import RolesTab from './RolesTab';
import ServerProfileTab from './ServerProfileTab';

type Tab = 'profile' | 'roles' | 'members' | 'invites' | 'bans' | 'audit';

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
  const isAdmin = hasPermission(mask, Permissions.ADMINISTRATOR);

  const tabs: [Tab, string, boolean][] = [
    ['profile', t('serverSettings.profile'), true],
    ['roles', t('roles.title'), canRoles],
    ['members', t('serverSettings.members'), canRoles],
    ['invites', t('community.invites'), canInvite],
    ['bans', t('community.bans'), canBan],
    ['audit', t('community.audit'), isAdmin],
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div className="settings-nav-title">{guild?.name ?? t('serverSettings.title')}</div>
          {tabs
            .filter(([, , show]) => show)
            .map(([id, label]) => (
              <button
                key={id}
                className={`settings-tab${tab === id ? ' active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
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
