import { Check, Copy, Link2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateInvite, useInvites } from '../hooks/useAdmin';
import { useGuildRoles } from '../hooks/useGuildAdmin';
import Select from './Select';

/**
 * Приглашение на сервер отдельным окном.
 *
 * Раньше «Пригласить» открывало вкладку настроек — человек попадал в раздел
 * управления сервером, где надо было ещё сообразить, что нажать. Позвать
 * друга — частое и простое действие, ему хватает одного окна.
 */
export default function InviteModal({
  guildId,
  guildName,
  onClose,
}: {
  guildId: string;
  guildName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: invites } = useInvites(guildId, true);
  const createInvite = useCreateInvite(guildId);
  const { data: roles } = useGuildRoles(guildId);
  const [expires, setExpires] = useState('168');
  const [maxUses, setMaxUses] = useState('');
  const [roleId, setRoleId] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Показываем последнюю живую ссылку: заводить новую при каждом открытии незачем
  const active = (invites ?? []).filter((i) => i.isActive);
  const invite = active[0];
  const link = invite ? `${window.location.origin}/i/${invite.code}` : '';

  const copy = (): void => {
    if (!link) return;
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const renew = (): void => {
    createInvite.mutate({
      maxUses: maxUses ? Number(maxUses) : null,
      expiresInHours: expires ? Number(expires) : null,
      grantsRoleId: roleId || null,
    });
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="confirm-modal invite-modal" onClick={(e) => e.stopPropagation()}>
        <span className="confirm-icon" aria-hidden>
          <Link2 size={18} />
        </span>

        <h2>{t('community.inviteTitle', { name: guildName })}</h2>
        <p className="confirm-message">{t('community.inviteHint')}</p>

        <label className="invite-link-label">
          {t('community.inviteLink')}
          <span className="invite-link-row">
            <input readOnly value={link} placeholder={t('community.inviteNone')} />
            <button className="btn-primary" onClick={copy} disabled={!link}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {t('community.copyLink')}
            </button>
          </span>
        </label>

        <div className="invite-params">
          <label>
            {t('community.inviteLives')}
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
          </label>
          <label>
            {t('community.inviteUses')}
            <Select
              value={maxUses}
              options={[
                { value: '', label: t('community.usesUnlimited') },
                { value: '1', label: '1' },
                { value: '5', label: '5' },
                { value: '25', label: '25' },
                { value: '100', label: '100' },
              ]}
              onChange={setMaxUses}
            />
          </label>
        </div>

        <label className="invite-role">
          {t('community.inviteRole')}
          <Select
            value={roleId}
            options={[
              { value: '', label: t('community.inviteNoRole') },
              // Владельца в списке нет: его права по ссылке не раздают
              ...(roles ?? [])
                .filter((role) => !role.isOwnerRole)
                .map((role) => ({ value: role.id, label: role.name })),
            ]}
            onChange={setRoleId}
          />
        </label>

        {/* Одна кнопка: закрывает окно Esc или щелчок мимо, отдельная только мешала */}
        <button
          className="btn-primary invite-renew"
          onClick={renew}
          disabled={createInvite.isPending}
        >
          <RefreshCw size={15} />
          {t('community.inviteNew')}
        </button>

        <p className="modal-escape">{t('common.escapeCloses')}</p>
      </div>
    </div>
  );
}
