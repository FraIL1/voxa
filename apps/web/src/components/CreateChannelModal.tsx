import { Hash, Volume2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../api/client';
import { useCreateChannel } from '../hooks/useGuildAdmin';

/** Модалка создания канала: тип (текст/голос), имя, категория */
export default function CreateChannelModal({
  guildId,
  categoryId = null,
  onClose,
}: {
  guildId: string;
  categoryId?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createChannel = useCreateChannel(guildId);
  const [type, setType] = useState<'TEXT' | 'VOICE'>('TEXT');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createChannel.mutate(
      { name: trimmed, type, categoryId },
      {
        onSuccess: onClose,
        onError: (err) => setError(err instanceof ApiError ? err.message : t('auth.genericError')),
      },
    );
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="add-server-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('channels.createTitle')}</h2>
        <div className="channel-type-choice">
          <button
            className={`channel-type-option${type === 'TEXT' ? ' active' : ''}`}
            onClick={() => setType('TEXT')}
          >
            <Hash size={18} /> {t('channels.text')}
          </button>
          <button
            className={`channel-type-option${type === 'VOICE' ? ' active' : ''}`}
            onClick={() => setType('VOICE')}
          >
            <Volume2 size={18} /> {t('channels.voice')}
          </button>
        </div>
        <form className="add-server-form" onSubmit={submit}>
          <label>
            {t('channels.nameLabel')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              autoFocus
            />
          </label>
          {error && <p className="friends-add-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('chat.cancel')}
            </button>
            <button className="btn-primary" disabled={createChannel.isPending || !name.trim()}>
              {t('channels.createButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
