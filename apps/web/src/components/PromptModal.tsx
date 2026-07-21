import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

/** Простое стилизованное окно ввода одной строки (замена window.prompt) */
export default function PromptModal({
  title,
  label,
  placeholder,
  initialValue = '',
  allowEmpty = false,
  maxLength = 48,
  confirmLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  allowEmpty?: boolean;
  maxLength?: number;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!allowEmpty && !trimmed) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="add-server-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <form className="add-server-form" onSubmit={submit}>
          <label>
            {label}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('chat.cancel')}
            </button>
            <button className="btn-primary" disabled={!allowEmpty && !value.trim()}>
              {confirmLabel ?? t('settings.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
