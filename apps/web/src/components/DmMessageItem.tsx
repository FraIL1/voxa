import { CornerUpLeft, Pencil, Pin, PinOff, SmilePlus, Trash2 } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { DmChatMessage } from '../api/dm-cache';
import { useDeleteDm, useEditDm, useToggleDmPin, useToggleDmReaction } from '../hooks/useDm';
import { useAuthStore } from '../stores/auth';
import Attachments from './Attachments';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '😢', '🤔'];

interface AggregatedReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

function aggregateReactions(
  message: DmChatMessage,
  myId: string | undefined,
): AggregatedReaction[] {
  const byEmoji = new Map<string, AggregatedReaction>();
  for (const r of message.reactions) {
    const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    entry.count += 1;
    if (r.userId === myId) entry.mine = true;
    byEmoji.set(r.emoji, entry);
  }
  return [...byEmoji.values()];
}

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

export default function DmMessageItem({
  message,
  onReply,
}: {
  message: DmChatMessage;
  onReply: (message: DmChatMessage) => void;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const editDm = useEditDm(message.conversationId);
  const deleteDm = useDeleteDm(message.conversationId);
  const toggleReaction = useToggleDmReaction(message.conversationId);
  const togglePin = useToggleDmPin(message.conversationId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const reactions = aggregateReactions(message, user?.id);
  const isPinned = message.pinnedAt !== null;

  const react = (emoji: string, mine: boolean): void => {
    setPickerOpen(false);
    toggleReaction.mutate({ messageId: message.id, emoji, mine });
  };

  const authorName = message.author?.displayName ?? t('chat.unknownUser');
  const isOwn = Boolean(user && message.author?.id === user.id);
  const canAct = !message.pending;

  const saveEdit = (): void => {
    const content = draft.trim();
    setEditing(false);
    if (!content || content === message.content) return;
    editDm.mutate({ messageId: message.id, content });
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div className={`message${message.pending ? ' pending' : ''}`}>
      <div className="avatar" aria-hidden>
        {authorName.slice(0, 1).toUpperCase()}
      </div>

      <div className="message-body">
        {message.replyToId && (
          <div className="reply-preview">
            <CornerUpLeft size={12} />
            {message.replyTo ? (
              <>
                <span className="reply-author">
                  {message.replyTo.authorUsername ?? t('chat.unknownUser')}
                </span>
                <span className="reply-excerpt">
                  {message.replyTo.excerpt ?? t('chat.deletedMessage')}
                </span>
              </>
            ) : (
              <span className="reply-excerpt">…</span>
            )}
          </div>
        )}

        <div className="message-meta">
          <span className="message-author">{authorName}</span>
          {isPinned && (
            <span className="pinned-mark" title={t('dm.pinned')}>
              <Pin size={12} />
            </span>
          )}
          <span className="message-time">
            {formatTimestamp(message.createdAt)}
            {message.editedAt && ` (${t('chat.edited')})`}
          </span>
        </div>

        {editing ? (
          <div className="edit-box">
            <textarea
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onEditKeyDown}
            />
            <div className="edit-hint">{t('chat.editHint')}</div>
          </div>
        ) : (
          <div className="message-content">
            <Markdown remarkPlugins={[remarkGfm]} skipHtml>
              {message.content}
            </Markdown>
          </div>
        )}

        <Attachments attachments={message.attachments} />

        {reactions.length > 0 && (
          <div className="reactions">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                className={`reaction${r.mine ? ' mine' : ''}`}
                onClick={() => react(r.emoji, r.mine)}
              >
                {r.emoji} <span className="reaction-count">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {canAct && !editing && (
        <div className="message-toolbar">
          <button
            className="icon-button"
            title={t('chat.addReaction')}
            onClick={() => setPickerOpen((v) => !v)}
          >
            <SmilePlus size={16} />
          </button>
          <button className="icon-button" title={t('chat.reply')} onClick={() => onReply(message)}>
            <CornerUpLeft size={16} />
          </button>
          <button
            className="icon-button"
            title={isPinned ? t('dm.unpinMessage') : t('dm.pinMessage')}
            onClick={() => togglePin.mutate({ messageId: message.id, pinned: isPinned })}
          >
            {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
          {isOwn && (
            <button
              className="icon-button"
              title={t('chat.edit')}
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
            >
              <Pencil size={16} />
            </button>
          )}
          {isOwn && (
            <button
              className="icon-button danger"
              title={t('chat.delete')}
              onClick={() => {
                if (window.confirm(t('chat.deleteConfirm'))) deleteDm.mutate(message.id);
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}

      {pickerOpen && (
        <>
          <div className="picker-backdrop" onClick={() => setPickerOpen(false)} />
          <div className="emoji-picker">
            {QUICK_EMOJIS.map((emoji) => {
              const mine = reactions.some((r) => r.emoji === emoji && r.mine);
              return (
                <button key={emoji} onClick={() => react(emoji, mine)}>
                  {emoji}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
