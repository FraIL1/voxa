import type { AttachmentDto } from '@voxa/shared';
import { FileIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function formatSize(bytes: number, kb: string, mb: string): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ${mb}`;
  return `${Math.max(1, Math.round(bytes / 1024))} ${kb}`;
}

export default function Attachments({ attachments }: { attachments: AttachmentDto[] }) {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = useState<AttachmentDto | null>(null);

  if (attachments.length === 0) return null;

  return (
    <div className="attachments">
      {attachments.map((a) => {
        if (a.kind === 'image') {
          return (
            <button
              key={a.id}
              className="attachment-image"
              title={a.fileName}
              onClick={() => setLightbox(a)}
            >
              <img src={a.thumbUrl ?? a.url} alt={a.fileName} loading="lazy" />
            </button>
          );
        }
        if (a.kind === 'video') {
          return (
            <video
              key={a.id}
              className="attachment-media"
              controls
              preload="metadata"
              src={a.url}
            />
          );
        }
        if (a.kind === 'audio') {
          return (
            <audio
              key={a.id}
              className="attachment-audio"
              controls
              preload="metadata"
              src={a.url}
            />
          );
        }
        return (
          <a
            key={a.id}
            className="attachment-file"
            href={a.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <FileIcon size={22} />
            <span className="attachment-name">{a.fileName}</span>
            <span className="attachment-size">
              {formatSize(a.size, t('units.kb'), t('units.mb'))}
            </span>
          </a>
        );
      })}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt={lightbox.fileName} />
        </div>
      )}
    </div>
  );
}
