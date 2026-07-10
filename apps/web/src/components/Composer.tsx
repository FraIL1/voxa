import { SendHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { emitTyping } from '../api/socket';
import { useSendMessage } from '../hooks/useMessages';
import { useChatStore } from '../stores/chat';

/** Не слать typing чаще, чем раз в это время (сервер троттлит с запасом) */
const TYPING_EMIT_INTERVAL_MS = 2500;

export default function Composer({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const sendMessage = useSendMessage(channelId);
  const replyTo = useChatStore((s) => s.replyTo);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const lastTypingAt = useRef(0);

  // Ответ не переносится между каналами
  useEffect(() => {
    setReplyTo(null);
    setValue('');
  }, [channelId, setReplyTo]);

  const send = (): void => {
    const content = value.trim();
    if (!content) return;
    sendMessage.mutate({ content, replyToId: replyTo?.id });
    setReplyTo(null);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape' && replyTo) setReplyTo(null);
  };

  return (
    <div className="composer">
      {replyTo && (
        <div className="composer-reply">
          <span>
            {t('chat.replyingTo', {
              name: replyTo.author?.username ?? t('chat.unknownUser'),
            })}
          </span>
          <button className="icon-button" title={t('chat.cancel')} onClick={() => setReplyTo(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="composer-inner">
        <textarea
          rows={1}
          value={value}
          placeholder={t('chat.placeholder', { channel: channelName })}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
            const now = Date.now();
            if (e.target.value.trim() && now - lastTypingAt.current > TYPING_EMIT_INTERVAL_MS) {
              lastTypingAt.current = now;
              emitTyping(channelId);
            }
          }}
          onKeyDown={onKeyDown}
        />
        <button
          className="send-button"
          title={t('chat.send')}
          disabled={!value.trim()}
          onClick={send}
        >
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
