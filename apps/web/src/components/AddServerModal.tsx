import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useCreateGuild, useJoinGuild } from '../hooks/useGuilds';

/** Модалка «+»: создать свой сервер или вступить по коду инвайта */
export default function AddServerModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createGuild = useCreateGuild();
  const joinGuild = useJoinGuild();

  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setError('');
    if (mode === 'create') {
      const trimmed = name.trim();
      if (trimmed.length < 2) return;
      createGuild
        .mutateAsync({ name: trimmed })
        .then((guild) => {
          onClose();
          navigate(`/guilds/${guild.id}`);
        })
        .catch((err: Error) => setError(err.message));
    } else {
      // Принимаем и полную ссылку-приглашение, и голый код
      const raw = code.trim();
      const parsed = raw.includes('/invite/') ? (raw.split('/invite/')[1] ?? '') : raw;
      if (!parsed) return;
      joinGuild
        .mutateAsync(parsed)
        .then(({ guildId }) => {
          onClose();
          navigate(`/guilds/${guildId}`);
        })
        .catch((err: Error) => setError(err.message));
    }
  };

  const busy = createGuild.isPending || joinGuild.isPending;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="add-server-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('guild.addTitle')}</h2>
        <div className="friends-tabs">
          <button
            className={`friends-tab${mode === 'create' ? ' active' : ''}`}
            onClick={() => setMode('create')}
          >
            {t('guild.createTab')}
          </button>
          <button
            className={`friends-tab${mode === 'join' ? ' active' : ''}`}
            onClick={() => setMode('join')}
          >
            {t('guild.joinTab')}
          </button>
        </div>

        <form className="add-server-form" onSubmit={submit}>
          {mode === 'create' ? (
            <label>
              {t('guild.nameLabel')}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('guild.namePlaceholder')}
                maxLength={48}
                autoFocus
              />
            </label>
          ) : (
            <label>
              {t('guild.codeLabel')}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('guild.codePlaceholder')}
                autoFocus
              />
            </label>
          )}
          {error && <p className="friends-add-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('chat.cancel')}
            </button>
            <button
              className="btn-primary"
              disabled={busy || (mode === 'create' ? name.trim().length < 2 : !code.trim())}
            >
              {mode === 'create' ? t('guild.createButton') : t('guild.joinButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
