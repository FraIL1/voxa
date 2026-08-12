import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Окно подтверждения приложения — вместо window.confirm. Системное окно
 * рисует браузер: оно чужого вида, без наших цветов и без имени действия.
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger = false,
  hideCancel = false,
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
        <h2>{title}</h2>
        {message && <p className="confirm-message">{message}</p>}
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
      </div>
    </div>
  );
}
