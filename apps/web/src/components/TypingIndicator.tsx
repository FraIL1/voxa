import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '../stores/chat';

export default function TypingIndicator({ channelId }: { channelId: string }) {
  const { t } = useTranslation();
  const typing = useChatStore((s) => s.typing[channelId]);
  const pruneTyping = useChatStore((s) => s.pruneTyping);

  const names = typing
    ? Object.values(typing)
        .filter((e) => e.expiresAt > Date.now())
        .map((e) => e.username)
    : [];

  // Пока кто-то печатает — периодически чистим протухшие записи
  useEffect(() => {
    if (names.length === 0) return;
    const timer = setInterval(pruneTyping, 1000);
    return () => clearInterval(timer);
  }, [names.length, pruneTyping]);

  let text = '';
  if (names.length === 1) text = t('chat.typingOne', { name: names[0] });
  else if (names.length === 2) text = t('chat.typingTwo', { a: names[0], b: names[1] });
  else if (names.length > 2) text = t('chat.typingMany');

  return (
    <div className="typing-indicator" aria-live="polite">
      {text}
    </div>
  );
}
