import type { RemoteVideoTrack, LocalVideoTrack } from 'livekit-client';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { localVideoTrack, remoteVideoTrack, useCallStore } from '../stores/call';

function VideoTile({
  track,
  label,
  muted,
}: {
  track: RemoteVideoTrack | LocalVideoTrack | null;
  label: string;
  muted?: boolean;
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
    <div className="call-tile">
      <video ref={ref} className="call-video" autoPlay playsInline muted={muted} />
      <span className="call-tile-label">{label}</span>
    </div>
  );
}

/** Панель активного звонка в диалоге: видео (если есть) и управление */
export default function CallPanel({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const status = useCallStore((s) => s.status);
  const activeConversation = useCallStore((s) => s.conversationId);
  const peerName = useCallStore((s) => s.peerName);
  const muted = useCallStore((s) => s.muted);
  const cameraOn = useCallStore((s) => s.cameraOn);
  const peerVideo = useCallStore((s) => s.peerVideo);
  // Пересоздаём привязку видео, когда дорожки меняются
  const videoVersion = useCallStore((s) => s.videoVersion);
  const error = useCallStore((s) => s.error);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleCamera = useCallStore((s) => s.toggleCamera);
  const hangUp = useCallStore((s) => s.hangUp);

  if (activeConversation !== conversationId || (status !== 'active' && status !== 'outgoing')) {
    return null;
  }

  return (
    <div className="call-panel">
      <div className="call-status">
        {status === 'outgoing' ? t('call.calling', { name: peerName }) : t('call.inCall')}
      </div>

      {(peerVideo || cameraOn) && (
        <div className="call-tiles" key={videoVersion}>
          {peerVideo && <VideoTile track={remoteVideoTrack()} label={peerName} />}
          {cameraOn && <VideoTile track={localVideoTrack()} label={t('call.you')} muted />}
        </div>
      )}

      {error && <div className="call-error">{error}</div>}

      <div className="call-controls">
        <button
          className={`icon-button${muted ? ' engaged' : ''}`}
          title={muted ? t('voice.unmute') : t('voice.mute')}
          onClick={() => void toggleMute()}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          className={`icon-button${cameraOn ? ' engaged' : ''}`}
          title={cameraOn ? t('call.cameraOff') : t('call.cameraOn')}
          onClick={() => void toggleCamera()}
        >
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button
          className="call-button decline"
          title={t('call.hangUp')}
          onClick={() => void hangUp()}
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
