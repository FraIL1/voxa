import type { AttachmentDto } from '@voxa/shared';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@voxa/shared';
import { Loader2, Paperclip, SendHorizontal, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';

import { emitTyping } from '../api/socket';
import { uploadFile } from '../api/uploads';
import { useSendMessage } from '../hooks/useMessages';
import { useChatStore } from '../stores/chat';

/** Не слать typing чаще, чем раз в это время (сервер троттлит с запасом) */
const TYPING_EMIT_INTERVAL_MS = 2500;

interface PendingFile {
  localId: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  attachment?: AttachmentDto;
  error?: string;
}

export default function Composer({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const sendMessage = useSendMessage(channelId);
  const replyTo = useChatStore((s) => s.replyTo);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const lastTypingAt = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Черновик, ответ и файлы не переносятся между каналами
  useEffect(() => {
    setReplyTo(null);
    setValue('');
    setFiles([]);
  }, [channelId, setReplyTo]);

  const patchFile = (localId: string, patch: Partial<PendingFile>): void => {
    setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));
  };

  const addFiles = (incoming: Iterable<File>): void => {
    const list = [...incoming];
    setFiles((prev) => {
      const room = MAX_ATTACHMENTS_PER_MESSAGE - prev.length;
      const accepted = list.slice(0, Math.max(0, room));
      const pending: PendingFile[] = accepted.map((file) => {
        const localId = crypto.randomUUID();
        uploadFile(file)
          .then((attachment) => patchFile(localId, { status: 'done', attachment }))
          .catch((error: Error) => patchFile(localId, { status: 'error', error: error.message }));
        return { localId, name: file.name, status: 'uploading' };
      });
      return [...prev, ...pending];
    });
  };

  const uploading = files.some((f) => f.status === 'uploading');
  const readyAttachments = files.flatMap((f) =>
    f.status === 'done' && f.attachment ? [f.attachment] : [],
  );

  const send = (): void => {
    const content = value.trim();
    if (uploading) return;
    if (!content && readyAttachments.length === 0) return;
    sendMessage.mutate({
      content,
      replyToId: replyTo?.id,
      attachmentIds: readyAttachments.map((a) => a.id),
      attachments: readyAttachments,
    });
    setReplyTo(null);
    setValue('');
    setFiles([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape' && replyTo) setReplyTo(null);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };

  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`composer${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
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

      {files.length > 0 && (
        <div className="composer-files">
          {files.map((f) => (
            <span key={f.localId} className={`file-chip ${f.status}`} title={f.error}>
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
          onPaste={onPaste}
        />
        <button
          className="send-button"
          title={t('chat.send')}
          disabled={uploading || (!value.trim() && readyAttachments.length === 0)}
          onClick={send}
        >
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
