import type { ReactNode } from 'react';

/** Заглушка ленты сообщений на время загрузки истории */
export function MessagesSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton-avatar" />
          <div className="skeleton-lines">
            <div className="skeleton skeleton-line short" />
            <div className={`skeleton skeleton-line ${i % 2 === 0 ? 'long' : 'medium'}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Заглушка списка строк (участники, серверы, заявки) */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton-avatar" />
          <div className="skeleton-lines">
            <div className="skeleton skeleton-line medium" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Пустой экран: иконка, заголовок и подсказка */
export function EmptyBlock({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty-block">
      <div className="empty-block-icon">{icon}</div>
      <div className="empty-block-title">{title}</div>
      {hint && <div className="empty-block-hint">{hint}</div>}
    </div>
  );
}
