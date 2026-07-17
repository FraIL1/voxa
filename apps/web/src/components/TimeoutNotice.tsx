import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '../stores/chat';

/** Модалка по центру: «тебе выдан таймаут до …» */
export default function TimeoutNotice() {
  const { t } = useTranslation();
  const notice = useChatStore((s) => s.timeoutNotice);
  const setNotice = useChatStore((s) => s.setTimeoutNotice);

  if (!notice) return null;

  return (
    <div className="settings-overlay" onClick={() => setNotice(null)}>
      <div className="timeout-modal" onClick={(e) => e.stopPropagation()}>
        <Clock size={36} />
        <h3>{t('moderation.timeoutModalTitle')}</h3>
        <p>
          {t('moderation.youAreTimedOut', {
            until: new Date(notice).toLocaleString('ru-RU'),
          })}
        </p>
        <button className="btn-primary" onClick={() => setNotice(null)}>
          {t('moderation.understood')}
        </button>
      </div>
    </div>
  );
}
