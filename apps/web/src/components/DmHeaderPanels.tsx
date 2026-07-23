import type { DmConversationDto, DmMessageDto } from '@voxa/shared';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDmPins, useDmSearch } from '../hooks/useDm';

const dateFormat = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

function MessageRow({ message }: { message: DmMessageDto }) {
  const { t } = useTranslation();
  return (
    <div className="dm-panel-row">
      <div className="dm-panel-row-head">
        <span className="message-author">
          {message.author?.displayName ?? t('chat.unknownUser')}
        </span>
        <span className="message-time">{dateFormat.format(new Date(message.createdAt))}</span>
      </div>
      <div className="dm-panel-row-text">{message.content || '—'}</div>
    </div>
  );
}

/** Выпадающая панель закреплённых сообщений диалога */
export function PinnedPanel({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: pins, isLoading } = useDmPins(conversationId, true);

  return (
    <div className="dm-panel">
      <div className="dm-panel-head">
        <span>{t('dm.pinnedTitle')}</span>
        <button className="icon-button" onClick={onClose} title={t('settings.close')}>
          <X size={16} />
        </button>
      </div>
      {isLoading && <p className="empty-state">{t('app.loading')}</p>}
      {pins && pins.length === 0 && <p className="empty-state">{t('dm.noPinned')}</p>}
      {pins?.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
}

/** Выпадающая панель поиска по переписке */
export function SearchPanel({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { data: results, isFetching } = useDmSearch(conversationId, query);

  return (
    <div className="dm-panel">
      <div className="dm-panel-head">
        <span>{t('dm.searchTitle')}</span>
        <button className="icon-button" onClick={onClose} title={t('settings.close')}>
          <X size={16} />
        </button>
      </div>
      <div className="dm-panel-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('dm.searchPlaceholder')}
          maxLength={100}
          autoFocus
        />
      </div>
      {query.trim() && isFetching && <p className="empty-state">{t('app.loading')}</p>}
      {results && results.length === 0 && <p className="empty-state">{t('dm.searchEmpty')}</p>}
      {results?.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
}

/** Карточка профиля собеседника */
export function PeerProfilePanel({
  peer,
  onClose,
}: {
  peer: DmConversationDto['peer'];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="dm-panel">
      <div className="dm-panel-head">
        <span>{t('dm.profileTitle')}</span>
        <button className="icon-button" onClick={onClose} title={t('settings.close')}>
          <X size={16} />
        </button>
      </div>
      <div className="dm-profile">
        <div className="avatar dm-profile-avatar" aria-hidden>
          {peer.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="dm-profile-name">{peer.displayName}</div>
        <div className="dm-profile-username">@{peer.username}</div>
      </div>
    </div>
  );
}
