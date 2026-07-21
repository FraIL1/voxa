import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Settings, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthStore } from '../stores/auth';
import { useVoiceStore } from '../stores/voice';
import SettingsModal from './SettingsModal';

/** Карточка пользователя внизу боковой панели: голос, микрофон, настройки.
 *  Клик по нику/аватару открывает настройки (профиль). Общая для дома и сервера. */
export default function UserCard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const voice = useVoiceStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const voiceChannelName = voice.channelId ? (voice.channelName ?? '') : null;

  return (
    <>
      {voice.channelId && (
        <div className="voice-panel">
          <div className="voice-panel-info">
            <Volume2 size={15} />
            <span className="voice-panel-name">
              {voice.connecting ? t('voice.connecting') : voiceChannelName}
            </span>
          </div>
          <button
            className="icon-button danger"
            title={t('voice.leave')}
            onClick={() => void voice.leave()}
          >
            <PhoneOff size={16} />
          </button>
        </div>
      )}

      <div className="user-card">
        <button
          className="user-card-identity"
          title={t('settings.title')}
          onClick={() => setSettingsOpen(true)}
        >
          <div className="avatar" aria-hidden>
            {(user?.displayName ?? user?.username ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <span className="username">{user?.displayName ?? user?.username}</span>
        </button>
        <button
          className={`icon-button${voice.muted ? ' engaged' : ''}`}
          title={voice.muted ? t('voice.unmute') : t('voice.mute')}
          disabled={!voice.channelId}
          onClick={() => void voice.toggleMute()}
        >
          {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
        <button
          className={`icon-button${voice.deafened ? ' engaged' : ''}`}
          title={voice.deafened ? t('voice.undeafen') : t('voice.deafen')}
          disabled={!voice.channelId}
          onClick={() => void voice.toggleDeafen()}
        >
          {voice.deafened ? <HeadphoneOff size={17} /> : <Headphones size={17} />}
        </button>
        <button
          className="icon-button"
          title={t('settings.title')}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={17} />
        </button>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
