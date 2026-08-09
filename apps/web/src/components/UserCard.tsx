import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Settings,
  Volume2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAudioSession } from '../hooks/useAudioSession';
import { useAuthStore } from '../stores/auth';
import { useVoiceStore } from '../stores/voice';
import SettingsModal from './SettingsModal';

/** Карточка пользователя внизу боковой панели: голос, микрофон, настройки.
 *  Клик по нику/аватару открывает настройки (профиль). Общая для дома и сервера.
 *  Микрофон и наушники управляют активной сессией — каналом или звонком в личке. */
export default function UserCard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const connecting = useVoiceStore((s) => s.connecting);
  const audio = useAudioSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      {audio.active && (
        <div className={`voice-panel${audio.kind === 'call' ? ' call' : ''}`}>
          <div className="voice-panel-info">
            {audio.kind === 'call' ? <PhoneCall size={15} /> : <Volume2 size={15} />}
            <span className="voice-panel-name">
              {audio.kind === 'voice' && connecting ? t('voice.connecting') : (audio.title ?? '')}
            </span>
          </div>
          <button
            className="icon-button danger"
            title={audio.kind === 'call' ? t('call.hangUp') : t('voice.leave')}
            onClick={audio.leave}
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
          className={`icon-button${audio.muted ? ' engaged' : ''}`}
          title={audio.muted ? t('voice.unmute') : t('voice.mute')}
          disabled={!audio.active}
          onClick={audio.toggleMute}
        >
          {audio.muted ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
        <button
          className={`icon-button${audio.deafened ? ' engaged' : ''}`}
          title={audio.deafened ? t('voice.undeafen') : t('voice.deafen')}
          disabled={!audio.active}
          onClick={audio.toggleDeafen}
        >
          {audio.deafened ? <HeadphoneOff size={17} /> : <Headphones size={17} />}
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
