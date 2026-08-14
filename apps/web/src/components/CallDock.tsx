import {
  Headphones,
  HeadphoneOff,
  Maximize2,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { useCallStore } from '../stores/call';
import Avatar from './Avatar';

/** Длительность разговора мм:сс — та же логика, что и на большом экране */
function useDuration(startedAt: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = String(Math.floor(total / 60) % 60).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * Плавающая панель разговора. Появляется, когда звонок идёт, а сам диалог
 * закрыт: раньше в этом случае управление пропадало и говорить приходилось
 * вслепую. Клик по панели возвращает в диалог.
 */
export default function CallDock() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const status = useCallStore((s) => s.status);
  const conversationId = useCallStore((s) => s.conversationId);
  const peerName = useCallStore((s) => s.peerName);
  const peerAvatar = useCallStore((s) => s.peerAvatar);
  const muted = useCallStore((s) => s.muted);
  const deafened = useCallStore((s) => s.deafened);
  const startedAt = useCallStore((s) => s.startedAt);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleDeafen = useCallStore((s) => s.toggleDeafen);
  const hangUp = useCallStore((s) => s.hangUp);
  const toggleCamera = useCallStore((s) => s.toggleCamera);
  const cameraOn = useCallStore((s) => s.cameraOn);

  const duration = useDuration(startedAt);
  const inCall = status === 'active' || status === 'outgoing';
  // На странице самого разговора большой экран уже всё показывает
  const onCallPage = conversationId !== null && location.pathname === `/dm/${conversationId}`;

  if (!inCall || onCallPage) return null;

  return (
    <div className="call-dock">
      <button
        className="call-dock-peer"
        title={t('call.backToChat')}
        onClick={() => conversationId && navigate(`/dm/${conversationId}`)}
      >
        <Avatar name={peerName} url={peerAvatar} className="call-dock-avatar" />
        <span className="call-dock-text">
          <span className="call-dock-name">{peerName}</span>
          <span className="call-dock-time">
            {status === 'outgoing' ? t('call.ringing') : (duration ?? t('call.connecting'))}
          </span>
        </span>
        <Maximize2 size={14} />
      </button>

      <div className="call-dock-controls">
        <button
          className={`call-dock-button${muted ? ' engaged' : ''}`}
          title={muted ? t('voice.unmute') : t('voice.mute')}
          onClick={() => void toggleMute()}
        >
          {muted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          className={`call-dock-button${deafened ? ' engaged' : ''}`}
          title={deafened ? t('voice.undeafen') : t('voice.deafen')}
          onClick={() => void toggleDeafen()}
        >
          {deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
        </button>
        <button
          className={`call-dock-button${cameraOn ? ' engaged' : ''}`}
          title={cameraOn ? t('call.cameraOff') : t('call.cameraOn')}
          onClick={() => void toggleCamera()}
        >
          {cameraOn ? <Video size={16} /> : <VideoOff size={16} />}
        </button>
        <button
          className="call-dock-button hangup"
          title={t('call.hangUp')}
          onClick={() => void hangUp()}
        >
          <PhoneOff size={16} />
        </button>
      </div>
    </div>
  );
}
