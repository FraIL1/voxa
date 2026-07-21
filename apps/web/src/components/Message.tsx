import { hasPermission, Permissions } from '@voxa/shared';
import { CornerUpLeft, Pencil, SmilePlus, Trash2 } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { ChatMessage } from '../api/messages-cache';
import { useMyGuildPermissions } from '../hooks/useGuilds';
import { useDeleteMessage, useEditMessage, useToggleReaction } from '../hooks/useMessages';
import { rehypeMentions } from '../lib/rehype-mentions';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import Attachments from './Attachments';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀', '💯', '🤔', '👎', '🫡'];

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

interface AggregatedReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

function aggregateReactions(message: ChatMessage, myId: string | undefined): AggregatedReaction[] {
  const byEmoji = new Map<string, AggregatedReaction>();
  for (const r of message.reactions) {
    const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    entry.count += 1;
    if (r.userId === myId) entry.mine = true;
    byEmoji.set(r.emoji, entry);
  }
  return [...byEmoji.values()];
}

export default function Message({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { guildId } = useParams<{ guildId: string }>();
  const guildMask = useMyGuildPermissions(guildId);
  const setReplyTo = useChatStore((s) => s.setReplyTo);

  const editMessage = useEditMessage(message.channelId);
  const deleteMessage = useDeleteMessage(message.channelId);
  const toggleReaction = useToggleReaction(message.channelId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const authorName = message.author?.displayName ?? t('chat.unknownUser');
  const isOwn = Boolean(user && message.author?.id === user.id);
  const canDelete =
    !message.pending && (isOwn || hasPermission(guildMask, Permissions.DELETE_MESSAGES));
  const canAct = !message.pending;
  const reactions = aggregateReactions(message, user?.id);

  const startEdit = (): void => {
    setDraft(message.content);
    setEditing(true);
  };

  const saveEdit = (): void => {
    const content = draft.trim();
    setEditing(false);
    if (!content || content === message.content) return;
    editMessage.mutate({ messageId: message.id, content });
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === 'Escape') setEditing(false);
  };

  const onDelete = (): void => {
    if (window.confirm(t('chat.deleteConfirm'))) {
      deleteMessage.mutate(message.id);
    }
  };

  const react = (emoji: string, mine: boolean): void => {
    setPickerOpen(false);
    toggleReaction.mutate({ messageId: message.id, emoji, mine });
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
            {/* skipHtml: сырой HTML из markdown никогда не рендерится (раздел 9 PRD) */}
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeMentions]} skipHtml>
              {message.content}
            </Markdown>
          </div>
        )}

        <Attachments attachments={message.attachments} />

        {message.linkPreview && (
          <a
            className="link-preview"
            href={message.linkPreview.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <div className="link-preview-text">
              {message.linkPreview.siteName && (
                <div className="lp-site">{message.linkPreview.siteName}</div>
              )}
              <div className="lp-title">{message.linkPreview.title}</div>
              {message.linkPreview.description && (
                <div className="lp-desc">{message.linkPreview.description}</div>
              )}
            </div>
            {message.linkPreview.imageUrl && (
              <img className="lp-image" src={message.linkPreview.imageUrl} alt="" loading="lazy" />
            )}
          </a>
        )}

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
          <button
            className="icon-button"
            title={t('chat.reply')}
            onClick={() => setReplyTo(message)}
          >
            <CornerUpLeft size={16} />
          </button>
          {isOwn && (
            <button className="icon-button" title={t('chat.edit')} onClick={startEdit}>
              <Pencil size={16} />
            </button>
          )}
          {canDelete && (
            <button className="icon-button danger" title={t('chat.delete')} onClick={onDelete}>
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
