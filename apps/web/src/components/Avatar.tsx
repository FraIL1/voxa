import type { PresenceStatus } from '@voxa/shared';
import { useState } from 'react';

interface AvatarProps {
  /** Имя нужно для запасного варианта — первой буквы */
  name: string;
  url?: string | null;
  /** Точка присутствия в углу; не передан — точки нет */
  status?: PresenceStatus;
  /** Дополнительные классы размера/формы из общих стилей */
  className?: string;
  onClick?: () => void;
  title?: string;
}

/**
 * Аватар пользователя. Картинка живёт по стабильной ссылке нашего сервера;
 * если её нет или она не загрузилась — показываем первую букву имени, чтобы
 * в интерфейсе никогда не оставалось пустого круга.
 */
export default function Avatar({ name, url, status, className = '', onClick, title }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(url) && !broken;

  return (
    <div
      className={`avatar${className ? ` ${className}` : ''}${showImage ? ' has-image' : ''}`}
      onClick={onClick}
      title={title}
      aria-hidden={!onClick}
    >
      {showImage ? (
        <img src={url ?? ''} alt="" onError={() => setBroken(true)} />
      ) : (
        name.slice(0, 1).toUpperCase() || '?'
      )}
      {status && <span className={`status-dot ${status}`} />}
    </div>
  );
}
