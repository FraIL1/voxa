import { Fragment, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';

import { EmptyBlock, MessagesSkeleton } from './Skeletons';

import { useMessages } from '../hooks/useMessages';
import { useAutoAck } from '../hooks/useReadStates';
import DaySeparator, { startsNewDay } from './DaySeparator';
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

  // Самое свежее подтверждённое сообщение — курсор авто-ack
  const latestRealId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const id = messages[i]?.id;
      if (id && !id.startsWith('temp-')) return id;
    }
    return undefined;
  }, [messages]);
  useAutoAck(channelId, latestRealId);

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
    return <MessagesSkeleton />;
  }
  if (messages.length === 0) {
    return (
      <EmptyBlock
        icon={<MessageSquare size={26} />}
        title={t('chat.emptyTitle')}
        hint={t('chat.empty')}
      />
    );
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
      {messages.map((message, i) => (
        <Fragment key={message.id}>
          {startsNewDay(messages[i - 1]?.createdAt, message.createdAt) && (
            <DaySeparator iso={message.createdAt} />
          )}
          <Message message={message} />
        </Fragment>
      ))}
    </div>
  );
}
