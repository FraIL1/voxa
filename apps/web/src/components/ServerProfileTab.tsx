import { hasPermission, Permissions } from '@voxa/shared';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { ApiError } from '../api/client';
import { useDeleteGuild, useGuild, useLeaveGuild, useTransferGuild } from '../hooks/useGuilds';
import { useUpdateGuild } from '../hooks/useGuildAdmin';
import { useMembers } from '../hooks/useMembers';
import { useAuthStore } from '../stores/auth';

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
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

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
      { name: trimmed },
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
              {t('serverSettings.changeIcon')}
              <input type="file" accept="image/*" hidden onChange={pickIcon} />
            </label>
            {guild?.iconUrl && (
              <button
                type="button"
                className="btn-secondary danger-text"
                onClick={() => updateGuild.mutate({ iconUrl: null })}
              >
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
        {error && <p className="auth-error">{error}</p>}
        {saved && <p className="settings-ok">{t('settings.saved')}</p>}
        {canManage && (
          <button className="btn-primary" type="submit" disabled={updateGuild.isPending}>
            {t('settings.save')}
          </button>
        )}
      </form>

      {!isOwner && (
        <button
          className="btn-secondary danger-text"
          onClick={() => {
            leaveGuild.mutate(guildId);
            onClose();
          }}
        >
          {t('serverSettings.leave')}
        </button>
      )}

      {isOwner && (
        <>
          <h2>{t('serverSettings.ownerZone')}</h2>
          <p className="settings-hint">{t('serverSettings.transferHint')}</p>
          <div className="invite-form">
            <select value={heir} onChange={(e) => setHeir(e.target.value)}>
              <option value="">{t('serverSettings.pickHeir')}</option>
              {(members ?? [])
                .filter((m) => m.id !== guild?.ownerId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nickname ?? m.displayName}
                  </option>
                ))}
            </select>
            <button
              className="btn-secondary"
              disabled={!heir || transferGuild.isPending}
              onClick={() => {
                const name = members?.find((m) => m.id === heir)?.displayName ?? '';
                if (!window.confirm(t('serverSettings.transferConfirm', { name }))) return;
                transferGuild.mutate(heir, { onSuccess: () => setHeir('') });
              }}
            >
              {t('serverSettings.transfer')}
            </button>
          </div>

          <button
            className="btn-secondary danger-text"
            onClick={() => {
              if (!window.confirm(t('serverSettings.deleteConfirm', { name: guild?.name ?? '' })))
                return;
              deleteGuild.mutate(guildId, {
                onSuccess: () => {
                  onClose();
                  navigate('/home', { replace: true });
                },
              });
            }}
          >
            {t('serverSettings.delete')}
          </button>
        </>
      )}
    </>
  );
}
