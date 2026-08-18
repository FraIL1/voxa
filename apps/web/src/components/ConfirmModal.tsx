import { AlertTriangle, Trash2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Окно подтверждения приложения — вместо window.confirm. Системное окно
 * рисует браузер: оно чужого вида, без наших цветов и без имени действия.
 *
 * Опасное действие показывает, что именно исчезнет, и держит «Отмена» слева:
 * рука идёт к правой кнопке по привычке, и промахнуться должно быть некуда.
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger = false,
  hideCancel = false,
  preview,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Красная кнопка для необратимых действий: удалить, забанить, покинуть */
  danger?: boolean;
  /** Одна кнопка — когда выбора нет и окно просто сообщает о случившемся */
  hideCancel?: boolean;
  /** Что именно исчезнет: сообщение, канал, сервер — показываем целиком */
  preview?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const confirm = (): void => {
    onConfirm();
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <span className={`confirm-icon${danger ? ' danger' : ''}`} aria-hidden>
          {danger ? <Trash2 size={18} /> : <AlertTriangle size={18} />}
        </span>

        <h2>{title}</h2>
        {message && <p className="confirm-message">{message}</p>}
        {preview && <div className="confirm-preview">{preview}</div>}

        <div className="modal-actions">
          {!hideCancel && (
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('chat.cancel')}
            </button>
          )}
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            autoFocus
            onClick={confirm}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>

        <p className="modal-escape">{t('common.escapeCloses')}</p>
      </div>
    </div>
  );
}
