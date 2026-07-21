import type { ChannelDto } from '@voxa/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../api/client';
import { useDeleteChannel, useUpdateChannel } from '../hooks/useGuildAdmin';

/** Настройки канала: переименование и удаление */
export default function ChannelSettingsModal({
  channel,
  onClose,
}: {
  channel: ChannelDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const updateChannel = useUpdateChannel(channel.guildId);
  const deleteChannel = useDeleteChannel(channel.guildId);
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [error, setError] = useState('');

  const save = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    updateChannel.mutate(
      { channelId: channel.id, input: { name: trimmed, topic: topic.trim() || null } },
      {
        onSuccess: onClose,
        onError: (err) => setError(err instanceof ApiError ? err.message : t('auth.genericError')),
      },
    );
  };

  const remove = (): void => {
    if (!window.confirm(t('channels.deleteConfirm', { name: channel.name }))) return;
    deleteChannel.mutate(channel.id, { onSuccess: onClose });
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="add-server-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('channels.settingsTitle')}</h2>
        <form className="add-server-form" onSubmit={save}>
          <label>
            {t('channels.nameLabel')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              autoFocus
            />
          </label>
          {channel.type === 'TEXT' && (
            <label>
              {t('channels.topicLabel')}
              <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={1024} />
            </label>
          )}
          {error && <p className="friends-add-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary danger-text" onClick={remove}>
              {t('channels.delete')}
            </button>
            <button className="btn-primary" disabled={updateChannel.isPending || !name.trim()}>
              {t('settings.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
