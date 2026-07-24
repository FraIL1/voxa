import { Search, UsersRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import {
  useCreateGuild,
  useDiscoverGuilds,
  useJoinGuild,
  useJoinGuildById,
} from '../hooks/useGuilds';

type Mode = 'create' | 'join' | 'discover';

/** Витрина: публичные серверы и серверы по заявке */
function Discover({ onJoined }: { onJoined: (guildId: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { data: guilds, isLoading } = useDiscoverGuilds(query, true);
  const joinById = useJoinGuildById();
  const [error, setError] = useState('');
  const [requestedId, setRequestedId] = useState<string | null>(null);

  const join = (guildId: string, byRequest: boolean): void => {
    setError('');
    joinById
      .mutateAsync({ guildId })
      .then((result) => {
        if (result.status === 'joined') onJoined(result.guildId);
        else setRequestedId(guildId);
      })
      .catch((err: Error) => setError(err.message));
    if (byRequest) setRequestedId(guildId);
  };

  return (
    <>
      <div className="dm-panel-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('guild.discoverSearch')}
          maxLength={48}
        />
      </div>

      {error && <p className="friends-add-error">{error}</p>}
      {isLoading && <p className="settings-hint">{t('app.loading')}</p>}
      {guilds && guilds.length === 0 && <p className="settings-hint">{t('guild.discoverEmpty')}</p>}

      <div className="group-pick-list">
        {(guilds ?? []).map((guild) => {
          const pending = guild.requested || requestedId === guild.id;
          return (
            <div key={guild.id} className="discover-row">
              <div className="avatar friend-avatar" aria-hidden>
                {guild.iconUrl ? (
                  <img className="rail-icon-img" src={guild.iconUrl} alt="" />
                ) : (
                  guild.name.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="discover-info">
                <span className="friend-name">{guild.name}</span>
                <span className="discover-desc">
                  {guild.description || t('guild.noDescription')}
                </span>
                <span className="discover-meta">
                  <UsersRound size={12} /> {guild.members}
                  {guild.joinMode === 'REQUEST' && ` · ${t('guild.modeRequestShort')}`}
                </span>
              </div>
              <button
                className="btn-secondary"
                disabled={joinById.isPending || pending}
                onClick={() => join(guild.id, guild.joinMode === 'REQUEST')}
              >
                {pending
                  ? t('guild.requestSent')
                  : guild.joinMode === 'PUBLIC'
                    ? t('guild.joinButton')
                    : t('guild.requestJoin')}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Модалка «+»: создать сервер, вступить по коду или найти в витрине */
export default function AddServerModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createGuild = useCreateGuild();
  const joinGuild = useJoinGuild();

  const [mode, setMode] = useState<Mode>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const openGuild = (guildId: string): void => {
    onClose();
    navigate(`/guilds/${guildId}`);
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setError('');
    if (mode === 'create') {
      const trimmed = name.trim();
      if (trimmed.length < 2) return;
      createGuild
        .mutateAsync({ name: trimmed })
        .then((guild) => openGuild(guild.id))
        .catch((err: Error) => setError(err.message));
    } else {
      // Принимаем и полную ссылку-приглашение, и голый код
      const raw = code.trim();
      const parsed = raw.includes('/invite/') ? (raw.split('/invite/')[1] ?? '') : raw;
      if (!parsed) return;
      joinGuild
        .mutateAsync(parsed)
        .then(({ guildId }) => openGuild(guildId))
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
          <button
            className={`friends-tab${mode === 'discover' ? ' active' : ''}`}
            onClick={() => setMode('discover')}
          >
            {t('guild.discoverTab')}
          </button>
        </div>

        {mode === 'discover' ? (
          <Discover onJoined={openGuild} />
        ) : (
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
        )}
      </div>
    </div>
  );
}
