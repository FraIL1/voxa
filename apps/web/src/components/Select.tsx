import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Выпадающий список приложения. Системный <select> использовать нельзя:
 * сам список рисует операционная система, и оформить его невозможно —
 * в тёмной теме он открывался светлым окном чужого вида.
 */
export default function Select({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className = '',
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);

  // Клик мимо и Escape закрывают список
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Перехват до всех остальных: Escape закрывает список, а не окно,
    // в котором он открыт
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // У нижней кромки окна список раскрывается вверх
  useLayoutEffect(() => {
    if (!open) {
      setUp(false);
      return;
    }
    const box = listRef.current?.getBoundingClientRect();
    if (box) setUp(box.bottom > window.innerHeight - 8);
  }, [open]);

  const pick = (next: string): void => {
    onChange(next);
    setOpen(false);
  };

  /** Стрелки и Enter — чтобы список работал и без мыши */
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((prev) => !prev);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const next = e.key === 'ArrowDown' ? index + 1 : index - 1;
    if (next >= 0 && next < options.length) onChange(options[next]!.value);
  };

  return (
    <div className={`select${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`select-trigger${open ? ' open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{current?.label ?? placeholder ?? ''}</span>
        <ChevronDown size={15} className="select-chevron" />
      </button>

      {open && (
        <div className={`select-list${up ? ' up' : ''}`} role="listbox" ref={listRef}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`select-option${option.value === value ? ' active' : ''}`}
              onClick={() => pick(option.value)}
            >
              <span className="select-option-label">{option.label}</span>
              {option.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
