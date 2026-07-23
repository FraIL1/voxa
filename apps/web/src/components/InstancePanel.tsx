import type { InstanceUserDto } from '@voxa/shared';
import { Ban, LogOut, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useCleanupStorage,
  useInstanceBan,
  useInstanceBans,
  useInstanceDeleteGuild,
  useInstanceGuilds,
  useInstanceLogout,
  useInstanceOverview,
  useInstanceSettings,
  useInstanceStorage,
  useInstanceUnban,
  useInstanceUsers,
  useUpdateInstanceSettings,
} from '../hooks/useInstance';

type Tab = 'overview' | 'users' | 'bans' | 'guilds' | 'settings' | 'storage';

const dateFormat = new Intl.DateTimeFormat('ru', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function Overview() {
  const { t } = useTranslation();
  const { data } = useInstanceOverview(true);
  if (!data) return null;

  const tiles: [string, string | number][] = [
    [t('instance.users'), data.usersTotal],
    [t('instance.online'), data.onlineNow],
    [t('instance.guilds'), data.guildsTotal],
    [t('instance.messages'), data.messagesTotal + data.dmMessagesTotal],
    [t('instance.sessions'), data.activeSessions],
    [t('instance.banned'), data.bannedTotal],
    [t('instance.storage'), `${data.storageMb} МБ`],
    [t('community.version'), data.serverVersion],
    [t('community.uptime'), `${Math.floor(data.uptimeSeconds / 3600)} ч`],
  ];

  return (
    <div className="admin-tiles">
      {tiles.map(([label, value]) => (
        <div key={label} className="admin-tile">
          <div className="admin-tile-value">{value}</div>
          <div className="admin-tile-label">{label}</div>
        </div>
      ))}
    </div>
  );
}

function Users() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { data: users } = useInstanceUsers(query, true);
  const ban = useInstanceBan();
  const unban = useInstanceUnban();
  const logout = useInstanceLogout();

  const doBan = (user: InstanceUserDto): void => {
    const reason = window.prompt(t('instance.banReason', { name: user.displayName }));
    if (reason === null) return;
    ban.mutate({ userId: user.id, reason: reason.trim() || undefined });
  };

  return (
    <>
      <div className="dm-panel-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('instance.searchPlaceholder')}
          maxLength={40}
        />
      </div>

      {(users ?? []).map((user) => (
        <div key={user.id} className="admin-row">
          <span className="admin-row-name">
            {user.displayName}
            <span className="dm-profile-username"> @{user.username}</span>
          </span>
          <span className="admin-row-info">
            {t('instance.userStats', {
              owned: user.guildsOwned,
              joined: user.guildsJoined,
              sessions: user.activeSessions,
            })}
            {user.bannedReason !== null && ` · ${t('instance.isBanned')}`}
            {user.isInstanceOwner && ` · ${t('instance.owner')}`}
          </span>
          {!user.isInstanceOwner && (
            <>
              <button
                className="icon-button"
                title={t('instance.forceLogout')}
                onClick={() => logout.mutate(user.id)}
              >
                <LogOut size={15} />
              </button>
              {user.bannedReason === null ? (
                <button
                  className="icon-button danger"
                  title={t('instance.ban')}
                  onClick={() => doBan(user)}
                >
                  <Ban size={15} />
                </button>
              ) : (
                <button className="btn-secondary" onClick={() => unban.mutate(user.id)}>
                  {t('instance.unban')}
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
}

function Bans() {
  const { t } = useTranslation();
  const { data: bans } = useInstanceBans(true);
  const unban = useInstanceUnban();

  if (!bans || bans.length === 0) return <p className="settings-hint">{t('instance.noBans')}</p>;

  return (
    <>
      {bans.map((ban) => (
        <div key={ban.id} className="admin-row">
          <span className="admin-row-name">
            {ban.displayName}
            <span className="dm-profile-username"> @{ban.username}</span>
          </span>
          <span className="admin-row-info">
            {ban.reason || t('community.noReason')}
            {ban.bannedByUsername && ` · ${ban.bannedByUsername}`}
          </span>
          <button className="btn-secondary" onClick={() => unban.mutate(ban.id)}>
            {t('instance.unban')}
          </button>
        </div>
      ))}
    </>
  );
}

function Guilds() {
  const { t } = useTranslation();
  const { data: guilds } = useInstanceGuilds(true);
  const remove = useInstanceDeleteGuild();

  return (
    <>
      {(guilds ?? []).map((guild) => (
        <div key={guild.id} className="admin-row">
          <span className="admin-row-name">{guild.name}</span>
          <span className="admin-row-info">
            {t('instance.guildStats', {
              owner: guild.ownerUsername ?? '—',
              members: guild.members,
              channels: guild.channels,
            })}{' '}
            · {dateFormat.format(new Date(guild.createdAt))}
          </span>
          <button
            className="icon-button danger"
            title={t('instance.deleteGuild')}
            onClick={() => {
              if (window.confirm(t('instance.deleteGuildConfirm', { name: guild.name }))) {
                remove.mutate(guild.id);
              }
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </>
  );
}

function Settings() {
  const { t } = useTranslation();
  const { data: settings } = useInstanceSettings(true);
  const update = useUpdateInstanceSettings();
  if (!settings) return null;

  return (
    <>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings.registrationOpen}
          onChange={(e) => update.mutate({ registrationOpen: e.target.checked })}
        />
        {t('instance.registrationOpen')}
      </label>
      <p className="settings-hint">{t('instance.registrationHint')}</p>

      <label>
        {t('instance.maxGuilds')}
        <input
          type="number"
          min={1}
          max={500}
          defaultValue={settings.maxGuildsPerUser}
          onBlur={(e) => {
            const value = Number(e.target.value);
            if (value >= 1 && value !== settings.maxGuildsPerUser) {
              update.mutate({ maxGuildsPerUser: value });
            }
          }}
        />
      </label>
    </>
  );
}

function Storage() {
  const { t } = useTranslation();
  const { data: storage } = useInstanceStorage(true);
  const cleanup = useCleanupStorage();
  if (!storage) return null;

  return (
    <>
      <div className="admin-tiles">
        <div className="admin-tile">
          <div className="admin-tile-value">{storage.totalMb} МБ</div>
          <div className="admin-tile-label">{t('instance.storageTotal')}</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile-value">{storage.filesTotal}</div>
          <div className="admin-tile-label">{t('instance.filesTotal')}</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile-value">{storage.orphanFiles}</div>
          <div className="admin-tile-label">{t('instance.orphans')}</div>
        </div>
      </div>

      <button
        className="btn-secondary"
        disabled={cleanup.isPending || storage.orphanFiles === 0}
        onClick={() => cleanup.mutate()}
      >
        {t('instance.cleanup', { mb: storage.orphanMb })}
      </button>

      {storage.top.length > 0 && <h2>{t('instance.topUploaders')}</h2>}
      {storage.top.map((row) => (
        <div key={row.username} className="admin-row">
          <span className="admin-row-name">@{row.username}</span>
          <span className="admin-row-info">
            {row.mb} МБ · {row.files}
          </span>
        </div>
      ))}
    </>
  );
}

/** Панель владельца приложения: глобальные баны, серверы, лимиты, хранилище */
export default function InstancePanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: [Tab, string][] = [
    ['overview', t('instance.tabOverview')],
    ['users', t('instance.tabUsers')],
    ['bans', t('instance.tabBans')],
    ['guilds', t('instance.tabGuilds')],
    ['settings', t('instance.tabSettings')],
    ['storage', t('instance.tabStorage')],
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div className="settings-nav-title">{t('instance.title')}</div>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              className={`settings-nav-item${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
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
            <X size={18} />
          </button>

          {tab === 'overview' && <Overview />}
          {tab === 'users' && <Users />}
          {tab === 'bans' && <Bans />}
          {tab === 'guilds' && <Guilds />}
          {tab === 'settings' && <Settings />}
          {tab === 'storage' && <Storage />}
        </div>
      </div>
    </div>
  );
}
