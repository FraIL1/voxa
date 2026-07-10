import { useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useMessages } from '../hooks/useMessages';
import Message from './Message';

export default function MessageList({ channelId }: { channelId: string }) {
  const { t } = useTranslation();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useMessages(channelId);

  const listRef = useRef<HTMLDivElement>(null);
  /** Прилипание к низу: включено, пока пользователь не прокрутил вверх */
  const stickToBottom = useRef(true);

  // Сервер отдаёт от новых к старым; рендерим от старых к новым
  const messages = useMemo(() => {
    const flat = data?.pages.flatMap((p) => p.items) ?? [];
    return [...flat].reverse();
  }, [data]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, channelId]);

  const onScroll = (): void => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  if (isLoading) {
    return <div className="empty-state">{t('app.loading')}</div>;
  }
  if (messages.length === 0) {
    return <div className="empty-state">{t('chat.empty')}</div>;
  }

  return (
    <div className="message-list" ref={listRef} onScroll={onScroll}>
      {hasNextPage && (
        <button
          className="load-more"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? t('app.loading') : t('chat.loadMore')}
        </button>
      )}
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
    </div>
  );
}
