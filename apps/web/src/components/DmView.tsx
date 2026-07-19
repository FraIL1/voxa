import type { AttachmentDto, DmConversationDto } from '@voxa/shared';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@voxa/shared';
import { AtSign, Loader2, Paperclip, SendHorizontal, X } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';

import { api } from '../api/client';
import type { DmChatMessage } from '../api/dm-cache';
import { uploadFile } from '../api/uploads';
import { useDmAck, useDmConversations, useDmMessages, useSendDm } from '../hooks/useDm';
import DmMessageItem from './DmMessageItem';

interface PendingFile {
  localId: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  attachment?: AttachmentDto;
}

function DmComposer({ conversationId, peerName }: { conversationId: string; peerName: string }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [replyTo, setReplyTo] = useState<DmChatMessage | null>(null);
  const sendDm = useSendDm(conversationId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue('');
    setFiles([]);
    setReplyTo(null);
  }, [conversationId]);

  const patch = (localId: string, p: Partial<PendingFile>): void =>
    setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...p } : f)));

  const addFiles = (incoming: Iterable<File>): void => {
    setFiles((prev) => {
      const room = MAX_ATTACHMENTS_PER_MESSAGE - prev.length;
      const pending: PendingFile[] = [...incoming].slice(0, Math.max(0, room)).map((file) => {
        const localId = crypto.randomUUID();
        uploadFile(file)
          .then((attachment) => patch(localId, { status: 'done', attachment }))
          .catch(() => patch(localId, { status: 'error' }));
        return { localId, name: file.name, status: 'uploading' as const };
      });
      return [...prev, ...pending];
    });
  };

  const uploading = files.some((f) => f.status === 'uploading');
  const ready = files.flatMap((f) => (f.status === 'done' && f.attachment ? [f.attachment] : []));

  const send = (): void => {
    const content = value.trim();
    if (uploading || (!content && ready.length === 0)) return;
    sendDm.mutate({ content, replyToId: replyTo?.id, attachmentIds: ready.map((a) => a.id) });
    setValue('');
    setFiles([]);
    setReplyTo(null);
  };

  // Экспортируем setReplyTo наверх через кастомное событие клика на «ответить»
  useEffect(() => {
    const el = document.getElementById(`dm-reply-${conversationId}`);
    if (!el) return;
    const handler = (e: Event): void => setReplyTo((e as CustomEvent<DmChatMessage>).detail);
    el.addEventListener('dm-reply', handler);
    return () => el.removeEventListener('dm-reply', handler);
  }, [conversationId]);

  return (
    <div className="composer">
      <span id={`dm-reply-${conversationId}`} hidden />
      {replyTo && (
        <div className="composer-reply">
          <span>
            {t('chat.replyingTo', { name: replyTo.author?.username ?? t('chat.unknownUser') })}
          </span>
          <button className="icon-button" title={t('chat.cancel')} onClick={() => setReplyTo(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="composer-files">
          {files.map((f) => (
            <span key={f.localId} className={`file-chip ${f.status}`}>
              {f.status === 'uploading' && <Loader2 size={13} className="spin" />}
              <span className="file-chip-name">{f.name}</span>
              {f.status === 'error' && (
                <span className="file-chip-error">{t('chat.uploadError')}</span>
              )}
              <button
                className="icon-button"
                title={t('chat.removeFile')}
                onClick={() => setFiles((prev) => prev.filter((x) => x.localId !== f.localId))}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-inner">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          className="icon-button attach-button"
          title={t('chat.attach')}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={18} />
        </button>
        <textarea
          rows={1}
          value={value}
          placeholder={t('dm.placeholder', { name: peerName })}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e: ClipboardEvent<HTMLTextAreaElement>) => {
            if (e.clipboardData.files.length > 0) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
        />
        <button
          className="send-button"
          title={t('chat.send')}
          disabled={uploading || (!value.trim() && ready.length === 0)}
          onClick={send}
        >
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}

function DmMessages({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useDmMessages(conversationId);
  const ack = useDmAck();
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const messages = useMemo(() => {
    const flat = data?.pages.flatMap((p) => p.items) ?? [];
    return [...flat].reverse();
  }, [data]);

  const latestRealId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const id = messages[i]?.id;
      if (id && !id.startsWith('temp-')) return id;
    }
    return undefined;
  }, [messages]);

  // Авто-ack при просмотре
  useEffect(() => {
    if (!latestRealId || document.hidden) return;
    const timer = setTimeout(() => ack.mutate({ conversationId, messageId: latestRealId }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestRealId, conversationId]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversationId]);

  const onReply = (message: DmChatMessage): void => {
    document
      .getElementById(`dm-reply-${conversationId}`)
      ?.dispatchEvent(new CustomEvent('dm-reply', { detail: message }));
  };

  if (isLoading) return <div className="empty-state">{t('app.loading')}</div>;
  if (messages.length === 0) return <div className="empty-state">{t('dm.empty')}</div>;

  return (
    <div
      className="message-list"
      ref={listRef}
      onScroll={() => {
        const el = listRef.current;
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {hasNextPage && (
        <button
          className="load-more"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? t('app.loading') : t('chat.loadMore')}
        </button>
      )}
      {messages.map((m) => (
        <DmMessageItem key={m.id} message={m} onReply={onReply} />
      ))}
    </div>
  );
}

export default function DmView() {
  const { t } = useTranslation();
  const { conversationId } = useParams<{ conversationId: string }>();
  const { data: conversations } = useDmConversations();
  const [peer, setPeer] = useState<DmConversationDto['peer'] | null>(null);

  // Собеседника берём из списка, а если диалог только что открыт — догружаем
  const fromList = conversations?.find((c) => c.id === conversationId)?.peer ?? null;
  useEffect(() => {
    if (fromList) {
      setPeer(fromList);
      return;
    }
    if (!conversationId) return;
    // Обновим список, чтобы получить peer нового диалога
    void api<DmConversationDto[]>('/dm/conversations').then((list) => {
      const found = list.find((c) => c.id === conversationId)?.peer ?? null;
      setPeer(found);
    });
  }, [conversationId, fromList]);

  if (!conversationId) return <Navigate to="/" replace />;

  return (
    <div className="channel-view">
      <header className="channel-header">
        <AtSign size={18} />
        {peer?.username ?? t('dm.title')}
      </header>
      <DmMessages conversationId={conversationId} />
      <DmComposer conversationId={conversationId} peerName={peer?.username ?? ''} />
    </div>
  );
}
