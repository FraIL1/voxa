import { hasPermission, Permissions } from '@voxa/shared';
import { Check, Crown, DoorOpen, ImageUp, Trash2, XCircle } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { ApiError } from '../api/client';
import { useDeleteGuild, useGuild, useLeaveGuild, useTransferGuild } from '../hooks/useGuilds';
import { useUpdateGuild } from '../hooks/useGuildAdmin';
import { useMembers } from '../hooks/useMembers';
import { useAuthStore } from '../stores/auth';
import ConfirmModal from './ConfirmModal';
import Select from './Select';

const MAX_ICON_BYTES = 256 * 1024;

/** Вкладка «Профиль сервера»: имя и иконка (data-URL) */
export default function ServerProfileTab({
  guildId,
  onClose,
}: {
  guildId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: members } = useMembers(guildId);
  const transferGuild = useTransferGuild(guildId);
  const deleteGuild = useDeleteGuild();
  const [heir, setHeir] = useState('');
  const guild = useGuild(guildId);
  const updateGuild = useUpdateGuild(guildId);
  const leaveGuild = useLeaveGuild();
  const [name, setName] = useState(guild?.name ?? '');
  const [description, setDescription] = useState(guild?.description ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [asking, setAsking] = useState<'transfer' | 'delete' | null>(null);

  const myId = useAuthStore((s) => s.user?.id);
  const canManage = guild ? hasPermission(guild.myPermissions, Permissions.MANAGE_CHANNELS) : false;
  const isOwner = guild?.ownerId != null && guild.ownerId === myId;

  const save = (e: FormEvent): void => {
    e.preventDefault();
    setError('');
    setSaved(false);
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    updateGuild.mutate(
      { name: trimmed, description: description.trim() || null },
      {
        onSuccess: () => setSaved(true),
        onError: (err) => setError(err instanceof ApiError ? err.message : t('auth.genericError')),
      },
    );
  };

  const pickIcon = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ICON_BYTES) {
      setError(t('serverSettings.iconTooBig'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      updateGuild.mutate(
        { iconUrl: reader.result as string },
        { onError: (err) => setError(err instanceof ApiError ? err.message : '') },
      );
    reader.readAsDataURL(file);
  };

  return (
    <>
      <h2>{t('serverSettings.profile')}</h2>
      <div className="server-icon-row">
        <div className="server-icon-preview" aria-hidden>
          {guild?.iconUrl ? (
            <img src={guild.iconUrl} alt="" />
          ) : (
            (guild?.name ?? '?').slice(0, 1).toUpperCase()
          )}
        </div>
        {canManage && (
          <div className="server-icon-actions">
            <label className="btn-secondary icon-upload">
              <ImageUp size={16} />
              {t('serverSettings.changeIcon')}
              <input type="file" accept="image/*" hidden onChange={pickIcon} />
            </label>
            {guild?.iconUrl && (
              <button
                type="button"
                className="btn-secondary danger-text"
                onClick={() => updateGuild.mutate({ iconUrl: null })}
              >
                <XCircle size={16} />
                {t('serverSettings.removeIcon')}
              </button>
            )}
          </div>
        )}
      </div>

      <form className="settings-form" onSubmit={save}>
        <label>
          {t('serverSettings.name')}
          <input value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('serverSettings.description')}
          <input
            value={description}
            disabled={!canManage}
            maxLength={200}
            placeholder={t('serverSettings.descriptionPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        {saved && <p className="settings-ok">{t('settings.saved')}</p>}
        {canManage && (
          <button className="btn-primary" type="submit" disabled={updateGuild.isPending}>
            <Check size={16} />
            {t('settings.save')}
          </button>
        )}
      </form>

      {canManage && guild && (
        <>
          <h2>{t('serverSettings.access')}</h2>
          <p className="settings-hint">{t('serverSettings.accessHint')}</p>
          <div className="access-modes">
            {(['INVITE_ONLY', 'REQUEST', 'PUBLIC'] as const).map((mode) => (
              <button
                key={mode}
                className={`access-mode${guild.joinMode === mode ? ' active' : ''}`}
                onClick={() => updateGuild.mutate({ joinMode: mode })}
              >
                <span className="access-mode-name">{t(`serverSettings.mode.${mode}`)}</span>
                <span className="access-mode-desc">{t(`serverSettings.modeHint.${mode}`)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {!isOwner && (
        <button
          className="btn-secondary danger-text"
          onClick={() => {
            leaveGuild.mutate(guildId);
            onClose();
          }}
        >
          <DoorOpen size={16} />
          {t('serverSettings.leave')}
        </button>
      )}

      {isOwner && (
        <>
          <h2>{t('serverSettings.ownerZone')}</h2>
          <p className="settings-hint">{t('serverSettings.transferHint')}</p>
          <div className="invite-form">
            <Select
              value={heir}
              placeholder={t('serverSettings.pickHeir')}
              options={[
                { value: '', label: t('serverSettings.pickHeir') },
                ...(members ?? [])
                  .filter((m) => m.id !== guild?.ownerId)
                  .map((m) => ({ value: m.id, label: m.nickname ?? m.displayName })),
              ]}
              onChange={setHeir}
            />
            <button
              className="btn-secondary"
              disabled={!heir || transferGuild.isPending}
              onClick={() => setAsking('transfer')}
            >
              <Crown size={16} />
              {t('serverSettings.transfer')}
            </button>
          </div>

          <button className="btn-secondary danger-text" onClick={() => setAsking('delete')}>
            <Trash2 size={16} />
            {t('serverSettings.delete')}
          </button>
        </>
      )}

      {asking === 'transfer' && (
        <ConfirmModal
          title={t('serverSettings.transferTitle')}
          message={t('serverSettings.transferConfirm', {
            name: members?.find((m) => m.id === heir)?.displayName ?? '',
          })}
          confirmLabel={t('serverSettings.transfer')}
          danger
          onConfirm={() => transferGuild.mutate(heir, { onSuccess: () => setHeir('') })}
          onClose={() => setAsking(null)}
        />
      )}

      {asking === 'delete' && (
        <ConfirmModal
          title={t('serverSettings.deleteTitle')}
          message={t('serverSettings.deleteConfirm', { name: guild?.name ?? '' })}
          confirmLabel={t('serverSettings.delete')}
          danger
          onConfirm={() =>
            deleteGuild.mutate(guildId, {
              onSuccess: () => {
                onClose();
                navigate('/home', { replace: true });
              },
            })
          }
          onClose={() => setAsking(null)}
        />
      )}
    </>
  );
}
