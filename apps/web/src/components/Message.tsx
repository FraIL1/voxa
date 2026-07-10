import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { ChatMessage } from '../api/messages-cache';

const timeFormat = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? timeFormat.format(date) : dateTimeFormat.format(date);
}

export default function Message({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const authorName = message.author?.username ?? t('chat.unknownUser');

  return (
    <div className={`message${message.pending ? ' pending' : ''}`}>
      <div className="avatar" aria-hidden>
        {authorName.slice(0, 1).toUpperCase()}
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span className="message-author">{authorName}</span>
          <span className="message-time">{formatTimestamp(message.createdAt)}</span>
        </div>
        <div className="message-content">
          {/* skipHtml: сырой HTML из markdown никогда не рендерится (раздел 9 PRD) */}
          <Markdown remarkPlugins={[remarkGfm]} skipHtml>
            {message.content}
          </Markdown>
        </div>
      </div>
    </div>
  );
}
