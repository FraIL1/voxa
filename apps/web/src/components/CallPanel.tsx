import type { RemoteVideoTrack, LocalVideoTrack } from 'livekit-client';
import {
  Headphones,
  HeadphoneOff,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { localVideoTrack, remoteVideoTrack, useCallStore } from '../stores/call';

function VideoTile({
  track,
  label,
  muted,
  self,
}: {
  track: RemoteVideoTrack | LocalVideoTrack | null;
  label: string;
  muted?: boolean;
  self?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  if (!track) return null;

  return (
    <div className={`call-tile${self ? ' self' : ''}`}>
      <video ref={ref} className="call-video" autoPlay playsInline muted={muted} />
      <span className="call-tile-label">{label}</span>
    </div>
  );
}

/** Длительность разговора в формате мм:сс (часы добавляются после часа) */
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

/** Экран активного звонка в диалоге: собеседник, видео и управление */
export default function CallPanel({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const status = useCallStore((s) => s.status);
  const activeConversation = useCallStore((s) => s.conversationId);
  const peerName = useCallStore((s) => s.peerName);
  const muted = useCallStore((s) => s.muted);
  const deafened = useCallStore((s) => s.deafened);
  const cameraOn = useCallStore((s) => s.cameraOn);
  const peerVideo = useCallStore((s) => s.peerVideo);
  const startedAt = useCallStore((s) => s.startedAt);
  // Пересоздаём привязку видео, когда дорожки меняются
  const videoVersion = useCallStore((s) => s.videoVersion);
  const error = useCallStore((s) => s.error);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleDeafen = useCallStore((s) => s.toggleDeafen);
  const toggleCamera = useCallStore((s) => s.toggleCamera);
  const hangUp = useCallStore((s) => s.hangUp);

  const [collapsed, setCollapsed] = useState(false);
  const duration = useDuration(startedAt);
  const withVideo = peerVideo || cameraOn;

  if (activeConversation !== conversationId || (status !== 'active' && status !== 'outgoing')) {
    return null;
  }

  const statusText =
    status === 'outgoing'
      ? t('call.calling', { name: peerName })
      : (duration ?? t('call.connecting'));

  return (
    <div
      className={`call-stage${collapsed ? ' collapsed' : ''}${withVideo ? ' with-video' : ''}${
        status === 'outgoing' ? ' ringing' : ''
      }`}
    >
      <button
        className="icon-button call-collapse"
        title={collapsed ? t('call.expand') : t('call.collapse')}
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
      </button>

      {withVideo ? (
        <div className="call-tiles" key={videoVersion}>
          {peerVideo && <VideoTile track={remoteVideoTrack()} label={peerName} />}
          {cameraOn && <VideoTile track={localVideoTrack()} label={t('call.you')} muted self />}
        </div>
      ) : (
        <div className="call-hero">
          <div className="call-avatar-wrap">
            <span className="call-pulse" aria-hidden />
            <span className="call-pulse delayed" aria-hidden />
            <div className="avatar call-avatar" aria-hidden>
              {peerName.slice(0, 1).toUpperCase() || '?'}
            </div>
          </div>
          <div className="call-name">{peerName}</div>
          <div className="call-substatus">{statusText}</div>
        </div>
      )}

      {withVideo && (
        <div className="call-overlay-status">
          <span className="call-name">{peerName}</span>
          <span className="call-substatus">{statusText}</span>
        </div>
      )}

      {error && <div className="call-error">{error}</div>}

      <div className="call-controls">
        <button
          className={`call-control${muted ? ' engaged' : ''}`}
          title={muted ? t('voice.unmute') : t('voice.mute')}
          onClick={() => void toggleMute()}
        >
          {muted ? <MicOff size={19} /> : <Mic size={19} />}
        </button>
        <button
          className={`call-control${deafened ? ' engaged' : ''}`}
          title={deafened ? t('voice.undeafen') : t('voice.deafen')}
          onClick={() => void toggleDeafen()}
        >
          {deafened ? <HeadphoneOff size={19} /> : <Headphones size={19} />}
        </button>
        <button
          className={`call-control${cameraOn ? ' engaged' : ''}`}
          title={cameraOn ? t('call.cameraOff') : t('call.cameraOn')}
          onClick={() => void toggleCamera()}
        >
          {cameraOn ? <Video size={19} /> : <VideoOff size={19} />}
        </button>
        <button
          className="call-control hangup"
          title={t('call.hangUp')}
          onClick={() => void hangUp()}
        >
          <PhoneOff size={19} />
        </button>
      </div>
    </div>
  );
}
