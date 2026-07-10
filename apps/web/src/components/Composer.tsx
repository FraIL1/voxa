import { SendHorizontal } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useSendMessage } from '../hooks/useMessages';

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

  const send = (): void => {
    const content = value.trim();
    if (!content) return;
    sendMessage.mutate(content);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <textarea
          rows={1}
          value={value}
          placeholder={t('chat.placeholder', { channel: channelName })}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
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
