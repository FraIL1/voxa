import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  MonitorUp,
  PhoneCall,
  PhoneOff,
  Settings,
  Video,
  VideoOff,
  Volume2,
  Waves,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAudioSession } from '../hooks/useAudioSession';
import { useAuthStore } from '../stores/auth';
import { usePresenceStore } from '../stores/presence';
import { useVoiceStore } from '../stores/voice';
import Avatar from './Avatar';
import SettingsModal from './SettingsModal';
import ProfileMenu from './ProfileMenu';

/** Карточка пользователя внизу боковой панели: голос, микрофон, настройки.
 *  Клик по нику/аватару открывает настройки (профиль). Общая для дома и сервера.
 *  Микрофон и наушники управляют активной сессией — каналом или звонком в личке. */
/**
 * Качество связи столбиками: считаем по задержке, потому что она и есть то,
 * что человек чувствует в разговоре. Пока идёт подключение — столбики
 * приглушены.
 */
function SignalBars({ latencyMs, connecting }: { latencyMs: number | null; connecting: boolean }) {
  const level = connecting || latencyMs === null ? 0 : latencyMs < 60 ? 3 : latencyMs < 150 ? 2 : 1;
  return (
    <span className={`signal-bars level-${level}`} aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

export default function UserCard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const connecting = useVoiceStore((s) => s.connecting);
  const myStatus = usePresenceStore((s) => s.myStatus);
  const audio = useAudioSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <>
      {audio.active && (
        <div className={`voice-panel${audio.kind === 'call' ? ' call' : ''}`}>
          <div className="voice-panel-head">
            <span className="voice-panel-state">
              <SignalBars latencyMs={audio.latencyMs} connecting={connecting} />
              {connecting && audio.kind === 'voice' ? t('voice.connecting') : t('voice.connected')}
            </span>
            {audio.latencyMs !== null && (
              <span className="voice-panel-ping">{audio.latencyMs} мс</span>
            )}
            <button
              className="icon-button danger voice-panel-leave"
              title={audio.kind === 'call' ? t('call.hangUp') : t('voice.leave')}
              onClick={audio.leave}
            >
              <PhoneOff size={16} />
            </button>
          </div>

          <div className="voice-panel-where">
            {audio.kind === 'call' ? <PhoneCall size={13} /> : <Volume2 size={13} />}
            <span className="voice-panel-name">{audio.title ?? ''}</span>
            {audio.subtitle && (
              <span className="voice-panel-guild">
                / {t('voice.serverPrefix')} {audio.subtitle}
              </span>
            )}
          </div>

          <div className="voice-panel-actions">
            <button
              className={`voice-panel-button${audio.cameraOn ? ' engaged' : ''}`}
              title={audio.cameraOn ? t('call.cameraOff') : t('call.cameraOn')}
              onClick={audio.toggleCamera}
            >
              {audio.cameraOn ? <Video size={16} /> : <VideoOff size={16} />}
            </button>
            <button
              className={`voice-panel-button${audio.sharing ? ' engaged' : ''}`}
              title={audio.sharing ? t('voice.stopShare') : t('voice.shareScreen')}
              onClick={audio.toggleShare}
            >
              <MonitorUp size={16} />
            </button>
            <button
              className={`voice-panel-button${audio.noiseOn ? ' engaged' : ''}`}
              title={audio.noiseOn ? t('voice.noiseOff') : t('voice.noiseOn')}
              onClick={audio.toggleNoise}
            >
              <Waves size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="user-card">
        {statusOpen && (
          <ProfileMenu
            onClose={() => setStatusOpen(false)}
            onEditProfile={() => setSettingsOpen(true)}
          />
        )}
        <button
          className="user-card-identity"
          title={t('profile.openMenu')}
          onClick={() => setStatusOpen((v) => !v)}
        >
          <Avatar
            name={user?.displayName ?? user?.username ?? '?'}
            url={user?.avatarUrl}
            /* Свечение вокруг своей аватарки, пока говоришь — видно, что
               микрофон реально передаёт голос */
            className={`me-avatar dot-${myStatus}${audio.speaking ? ' speaking' : ''}`}
          />
          <span className="user-card-names">
            <span className="username">{user?.displayName ?? user?.username}</span>
            <span className="user-card-status">
              {user?.statusText || t(`presence.${myStatus}`)}
            </span>
          </span>
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
