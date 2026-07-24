import type { NotifyMode } from '@voxa/shared';
import { useTranslation } from 'react-i18next';

import { useGuild, useSetNotifyMode } from '../hooks/useGuilds';

const MODES: NotifyMode[] = ['ALL', 'MENTIONS', 'NONE'];

/** Параметры уведомлений сервера: всё / только упоминания / ничего */
export default function NotifySettingsModal({
  guildId,
  onClose,
}: {
  guildId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const guild = useGuild(guildId);
  const setMode = useSetNotifyMode(guildId);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="add-server-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('guild.menuNotifications')}</h2>
        <p className="settings-hint">{t('notify.hint')}</p>

        <div className="access-modes">
          {MODES.map((mode) => (
            <button
              key={mode}
              className={`access-mode${guild?.myNotifyMode === mode ? ' active' : ''}`}
              onClick={() => setMode.mutate(mode)}
            >
              <span className="access-mode-name">{t(`notify.mode.${mode}`)}</span>
              <span className="access-mode-desc">{t(`notify.modeHint.${mode}`)}</span>
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
