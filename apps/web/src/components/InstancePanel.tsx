import type { InstanceUserDto } from '@voxa/shared';
import {
  Activity,
  Ban,
  Check,
  Clock,
  Copy,
  Crown,
  FileQuestion,
  Files,
  HardDrive,
  LayoutDashboard,
  LogOut,
  KeyRound,
  MessageSquare,
  Search,
  Server,
  ShieldBan,
  SlidersHorizontal,
  Tag,
  Ticket,
  Trash2,
  Users as UsersIcon,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from './Avatar';
import ConfirmModal from './ConfirmModal';
import PromptModal from './PromptModal';
import Select from './Select';

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
  useRegistrationInvites,
  useCreateRegistrationInvite,
  useRevokeRegistrationInvite,
} from '../hooks/useInstance';

type Tab = 'overview' | 'users' | 'regInvites' | 'bans' | 'guilds' | 'settings' | 'storage';

const dateFormat = new Intl.DateTimeFormat('ru', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function Overview() {
  const { t } = useTranslation();
  const { data } = useInstanceOverview(true);
  if (!data) return null;

  const tiles: [string, string | number, LucideIcon, boolean?][] = [
    [t('instance.users'), data.usersTotal, UsersIcon],
    [t('instance.online'), data.onlineNow, Activity, true],
    [t('instance.guilds'), data.guildsTotal, Server],
    [t('instance.messages'), data.messagesTotal + data.dmMessagesTotal, MessageSquare],
    [t('instance.sessions'), data.activeSessions, KeyRound],
    [t('instance.banned'), data.bannedTotal, ShieldBan],
    [t('instance.storage'), `${data.storageMb} МБ`, HardDrive],
    [t('community.version'), data.serverVersion, Tag],
    [t('community.uptime'), `${Math.floor(data.uptimeSeconds / 3600)} ч`, Clock],
  ];

  return (
    <>
      <h2>{t('instance.tabOverview')}</h2>
      <p className="settings-hint">{t('instance.overviewHint')}</p>

      <div className="admin-tiles">
        {tiles.map(([label, value, Icon, accent]) => (
          <div key={label} className={`admin-tile${accent ? ' accent' : ''}`}>
            <span className="admin-tile-icon">
              <Icon size={15} />
            </span>
            <div className="admin-tile-value">{value}</div>
            <div className="admin-tile-label">{label}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Users() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { data: users } = useInstanceUsers(query, true);
  const ban = useInstanceBan();
  const unban = useInstanceUnban();
  const logout = useInstanceLogout();

  const [banning, setBanning] = useState<InstanceUserDto | null>(null);

  return (
    <>
      <h2>{t('instance.tabUsers')}</h2>
      <p className="settings-hint">{t('instance.usersHint')}</p>

      <div className="dm-panel-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('instance.searchPlaceholder')}
          maxLength={40}
        />
      </div>

      {(users ?? []).length === 0 && <p className="empty-state">{t('instance.noUsers')}</p>}
      {(users ?? []).map((user) => (
        <div key={user.id} className="admin-row">
          <Avatar
            name={user.displayName}
            url={user.avatarUrl}
            status={user.status}
            className="friend-avatar"
          />
          <span className="owner-row-main">
            <span className="admin-row-name">{user.displayName}</span>
            <span className="admin-row-info">
              @{user.username} ·{' '}
              {t('instance.userStats', {
                owned: user.guildsOwned,
                joined: user.guildsJoined,
                sessions: user.activeSessions,
              })}
            </span>
          </span>
          {user.isInstanceOwner && (
            <span className="owner-chip gold">
              <Crown size={12} /> {t('instance.owner')}
            </span>
          )}
          {user.bannedReason !== null && (
            <span className="owner-chip danger">{t('instance.isBanned')}</span>
          )}
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
                  onClick={() => setBanning(user)}
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

      {banning && (
        <PromptModal
          title={t('instance.banTitle')}
          label={t('instance.banReason', { name: banning.displayName })}
          placeholder={t('instance.banLabel')}
          allowEmpty
          maxLength={200}
          confirmLabel={t('instance.ban')}
          onClose={() => setBanning(null)}
          onSubmit={(reason) => ban.mutate({ userId: banning.id, reason: reason || undefined })}
        />
      )}
    </>
  );
}

function Bans() {
  const { t } = useTranslation();
  const { data: bans } = useInstanceBans(true);
  const unban = useInstanceUnban();

  return (
    <>
      <h2>{t('instance.tabBans')}</h2>
      <p className="settings-hint">{t('instance.bansHint')}</p>

      {(bans ?? []).length === 0 && <p className="empty-state">{t('instance.noBans')}</p>}
      {(bans ?? []).map((ban) => (
        <div key={ban.id} className="admin-row">
          <Avatar name={ban.displayName} url={ban.avatarUrl} className="friend-avatar" />
          <span className="owner-row-main">
            <span className="admin-row-name">
              {ban.displayName}
              <span className="dm-profile-username"> @{ban.username}</span>
            </span>
            <span className="admin-row-info">
              {ban.reason || t('community.noReason')}
              {ban.bannedByUsername && ` · ${ban.bannedByUsername}`}
            </span>
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
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      <h2>{t('instance.tabGuilds')}</h2>
      <p className="settings-hint">{t('instance.guildsHint')}</p>

      {(guilds ?? []).length === 0 && <p className="empty-state">{t('instance.noGuilds')}</p>}
      {(guilds ?? []).map((guild) => (
        <div key={guild.id} className="admin-row">
          <Avatar name={guild.name} url={guild.iconUrl} className="friend-avatar guild" />
          <span className="owner-row-main">
            <span className="admin-row-name">{guild.name}</span>
            <span className="admin-row-info">
              {t('instance.guildStats', {
                owner: guild.ownerUsername ? `@${guild.ownerUsername}` : '—',
                members: guild.members,
                channels: guild.channels,
              })}{' '}
              · {dateFormat.format(new Date(guild.createdAt))}
            </span>
          </span>
          <button
            className="icon-button danger"
            title={t('instance.deleteGuild')}
            onClick={() => setDeleting({ id: guild.id, name: guild.name })}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      {deleting && (
        <ConfirmModal
          title={t('instance.deleteGuildTitle')}
          message={t('instance.deleteGuildConfirm', { name: deleting.name })}
          confirmLabel={t('instance.deleteGuild')}
          danger
          onConfirm={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
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
      <h2>{t('instance.tabSettings')}</h2>
      <p className="settings-hint">{t('instance.settingsHint')}</p>

      <label className="owner-setting">
        <span className="owner-setting-text">
          <span className="owner-setting-name">{t('instance.registrationOpen')}</span>
          <span className="settings-hint">{t('instance.registrationHint')}</span>
        </span>
        <span className="owner-switch">
          <input
            type="checkbox"
            checked={settings.registrationOpen}
            onChange={(e) => update.mutate({ registrationOpen: e.target.checked })}
          />
          <span className="owner-switch-track" />
        </span>
      </label>

      <label className="owner-setting">
        <span className="owner-setting-text">
          <span className="owner-setting-name">{t('instance.maxGuilds')}</span>
          <span className="settings-hint">{t('instance.maxGuildsHint')}</span>
        </span>
        <input
          className="owner-setting-input"
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

function RegistrationInvites() {
  const { t } = useTranslation();
  const { data: invites } = useRegistrationInvites(true);
  const create = useCreateRegistrationInvite();
  const revoke = useRevokeRegistrationInvite();
  const [maxUses, setMaxUses] = useState('');
  const [expires, setExpires] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const doCreate = (): void => {
    create.mutate({
      maxUses: maxUses ? Number(maxUses) : null,
      expiresInHours: expires ? Number(expires) : null,
    });
  };

  const copy = (id: string, code: string): void => {
    void navigator.clipboard.writeText(`${window.location.origin}/register/${code}`).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const active = (invites ?? []).filter((i) => i.isActive);

  return (
    <>
      <h2>{t('instance.tabReg')}</h2>
      <p className="settings-hint">{t('instance.regHint')}</p>

      <div className="invite-form">
        <input
          type="number"
          min={1}
          placeholder={t('community.maxUsesPlaceholder')}
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
        />
        <Select
          value={expires}
          options={[
            { value: '', label: t('community.expiresNever') },
            { value: '24', label: `24 ${t('community.hour')}` },
            { value: '168', label: `7 ${t('community.days')}` },
            { value: '720', label: `30 ${t('community.days')}` },
          ]}
          onChange={setExpires}
        />
        <button className="btn-primary" disabled={create.isPending} onClick={doCreate}>
          {t('instance.regCreate')}
        </button>
      </div>

      {active.length === 0 && <p className="empty-state">{t('instance.noRegInvites')}</p>}
      {active.map((invite) => (
        <div key={invite.id} className="admin-row">
          <code className="invite-code">{invite.code}</code>
          <span className="admin-row-info">
            {t('instance.regUses', { uses: invite.uses, max: invite.maxUses ?? '∞' })}
          </span>
          <button
            className="icon-button"
            title={t('community.copyLink')}
            onClick={() => copy(invite.id, invite.code)}
          >
            {copiedId === invite.id ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            className="icon-button danger"
            title={t('community.revoke')}
            onClick={() => revoke.mutate(invite.id)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
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
      <h2>{t('instance.tabStorage')}</h2>
      <p className="settings-hint">{t('instance.storageHint')}</p>

      <div className="admin-tiles">
        <div className="admin-tile">
          <span className="admin-tile-icon">
            <HardDrive size={15} />
          </span>
          <div className="admin-tile-value">{storage.totalMb} МБ</div>
          <div className="admin-tile-label">{t('instance.storageTotal')}</div>
        </div>
        <div className="admin-tile">
          <span className="admin-tile-icon">
            <Files size={15} />
          </span>
          <div className="admin-tile-value">{storage.filesTotal}</div>
          <div className="admin-tile-label">{t('instance.filesTotal')}</div>
        </div>
        <div className="admin-tile">
          <span className="admin-tile-icon">
            <FileQuestion size={15} />
          </span>
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
            {t('instance.storageRow', { mb: row.mb, files: row.files })}
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

  // Иконка у каждого раздела: список из семи одинаковых строк читается плохо
  const tabs: [Tab, string, LucideIcon][] = [
    ['overview', t('instance.tabOverview'), LayoutDashboard],
    ['users', t('instance.tabUsers'), UsersIcon],
    ['regInvites', t('instance.tabReg'), Ticket],
    ['bans', t('instance.tabBans'), ShieldBan],
    ['guilds', t('instance.tabGuilds'), Server],
    ['settings', t('instance.tabSettings'), SlidersHorizontal],
    ['storage', t('instance.tabStorage'), HardDrive],
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel owner-panel" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div className="owner-nav-head">
            <Crown size={15} />
            {t('instance.title')}
          </div>
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={`settings-tab${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={15} /> {label}
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
          {tab === 'regInvites' && <RegistrationInvites />}
          {tab === 'bans' && <Bans />}
          {tab === 'guilds' && <Guilds />}
          {tab === 'settings' && <Settings />}
          {tab === 'storage' && <Storage />}
        </div>
      </div>
    </div>
  );
}
