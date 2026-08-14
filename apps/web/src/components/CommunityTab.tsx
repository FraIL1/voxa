import { hasPermission, Permissions } from '@voxa/shared';
import {
  Activity,
  Check,
  Clock,
  Copy,
  HardDrive,
  KeyRound,
  Tag,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import {
  useAdminOverview,
  useAudit,
  useBans,
  useCreateInvite,
  useInvites,
  useRevokeInvite,
  useUnban,
} from '../hooks/useAdmin';
import { useMyGuildPermissions } from '../hooks/useGuilds';
import Select from './Select';

const timeFormat = new Intl.DateTimeFormat('ru', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function Overview() {
  const { t } = useTranslation();
  const { data } = useAdminOverview(true);
  if (!data) return null;

  const tiles: [string, string | number, LucideIcon, boolean?][] = [
    [t('community.usersTotal'), data.usersTotal, Users],
    [t('community.onlineNow'), data.onlineNow, Activity, true],
    [t('community.sessions'), data.activeSessions, KeyRound],
    [t('community.filesMb'), `${data.filesTotalMb} МБ`, HardDrive],
    [t('community.version'), data.serverVersion, Tag],
    [t('community.uptime'), `${Math.floor(data.uptimeSeconds / 3600)} ч`, Clock],
  ];

  return (
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
  );
}

export function Invites() {
  const { t } = useTranslation();
  const { guildId } = useParams<{ guildId: string }>();
  const { data: invites } = useInvites(guildId, true);
  const createInvite = useCreateInvite(guildId);
  const revokeInvite = useRevokeInvite(guildId);
  const [maxUses, setMaxUses] = useState('');
  const [expires, setExpires] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const create = (): void => {
    createInvite.mutate({
      maxUses: maxUses ? Number(maxUses) : null,
      expiresInHours: expires ? Number(expires) : null,
    });
  };

  const copy = (id: string, code: string): void => {
    void navigator.clipboard.writeText(`${window.location.origin}/invite/${code}`).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const active = (invites ?? []).filter((i) => i.isActive);

  return (
    <>
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
            { value: '1', label: `1 ${t('community.hour')}` },
            { value: '24', label: `24 ${t('community.hour')}` },
            { value: '168', label: `7 ${t('community.days')}` },
            { value: '720', label: `30 ${t('community.days')}` },
          ]}
          onChange={setExpires}
        />
        <button className="btn-primary" disabled={createInvite.isPending} onClick={create}>
          {t('community.createInvite')}
        </button>
      </div>

      {active.length === 0 && <p className="settings-hint">{t('community.noInvites')}</p>}
      {active.map((invite) => (
        <div key={invite.id} className="admin-row">
          <code className="invite-code">{invite.code}</code>
          <span className="admin-row-info">
            {invite.uses}/{invite.maxUses ?? '∞'}
            {invite.expiresAt &&
              ` · ${t('community.until')} ${timeFormat.format(new Date(invite.expiresAt))}`}
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
            onClick={() => revokeInvite.mutate(invite.id)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </>
  );
}

export function Bans() {
  const { t } = useTranslation();
  const { guildId } = useParams<{ guildId: string }>();
  const { data: bans } = useBans(guildId, true);
  const unban = useUnban(guildId);

  if (!bans || bans.length === 0) {
    return <p className="settings-hint">{t('community.noBans')}</p>;
  }
  return (
    <>
      {bans.map((ban) => (
        <div key={ban.userId} className="admin-row">
          <span className="admin-row-name">{ban.username}</span>
          <span className="admin-row-info">
            {ban.reason ?? t('community.noReason')}
            {ban.bannedByUsername && ` · ${ban.bannedByUsername}`}
          </span>
          <button className="btn-secondary" onClick={() => unban.mutate(ban.userId)}>
            {t('community.unban')}
          </button>
        </div>
      ))}
    </>
  );
}

export function Audit() {
  const { t } = useTranslation();
  const { guildId } = useParams<{ guildId: string }>();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useAudit(guildId, true);
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      {items.map((entry) => (
        <div key={entry.id} className="audit-row">
          <span className="audit-time">{timeFormat.format(new Date(entry.createdAt))}</span>
          <span className="audit-actor">
            {/* Автора нет — значит аккаунт удалили; это не системное действие */}
            {entry.actorUsername ?? t('audit.systemActor')}
          </span>
          {/* Показываем понятное название, а не техническое имя события.
              Для незнакомого события падаем обратно на само имя — лучше
              непонятная строка, чем пустая. */}
          <span className="audit-action">{t([`audit.${entry.action}`, 'audit.unknown'])}</span>
        </div>
      ))}
      {hasNextPage && (
        <button
          className="btn-secondary"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {t('chat.loadMore')}
        </button>
      )}
    </>
  );
}

/** Вкладка «Сервер»: секции по правам текущего пользователя на нём */
export default function CommunityTab() {
  const { t } = useTranslation();
  const { guildId } = useParams<{ guildId: string }>();
  const mask = useMyGuildPermissions(guildId);

  const isAdmin = hasPermission(mask, Permissions.ADMINISTRATOR);
  const canInvite = hasPermission(mask, Permissions.CREATE_INVITES);
  const canBan = hasPermission(mask, Permissions.BAN_MEMBERS);

  return (
    <>
      {isAdmin && (
        <>
          <h2>{t('community.overview')}</h2>
          <Overview />
        </>
      )}
      {canInvite && (
        <>
          <h2>{t('community.invites')}</h2>
          <Invites />
        </>
      )}
      {canBan && (
        <>
          <h2>{t('community.bans')}</h2>
          <Bans />
        </>
      )}
      {isAdmin && (
        <>
          <h2>{t('community.audit')}</h2>
          <Audit />
        </>
      )}
    </>
  );
}
