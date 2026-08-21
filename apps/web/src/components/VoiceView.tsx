import type { ChannelDto } from '@voxa/shared';
import {
  Headphones,
  HeadphoneOff,
  Maximize,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { participantsOf, useVoiceStates } from '../hooks/useVoiceStates';
import { useAuthStore } from '../stores/auth';
import {
  cameraTrackOf,
  screenVideoTrackOf,
  SELF_CAMERA,
  SELF_SCREEN,
  useVoiceStore,
} from '../stores/voice';
import Avatar from './Avatar';
import LiveVideo from './LiveVideo';
import ShareOptionsModal from './ShareOptionsModal';
import VolumeMenu, { type VolumeMenuState } from './VolumeMenu';

/** Камера участника: трек живёт вне стора, привязываем вручную */
function CameraVideo({
  userId,
  self,
  version,
}: {
  userId: string;
  self: boolean;
  /** Меняется при появлении и пропаже треков — повод перепривязаться */
  version: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    const track = cameraTrackOf(self ? SELF_CAMERA : userId);
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [userId, self, version]);

  return <LiveVideo ref={ref} className="voice-video" />;
}

/**
 * Демонстрация экрана внутри плитки того, кто показывает.
 *
 * Раньше показ жил отдельной чёрной областью с вкладками, и человек,
 * начавший демонстрацию, видел надпись «выбери, чей экран смотреть» вместо
 * собственной картинки. Теперь экран просто занимает его плитку.
 */
function ScreenVideo({
  owner,
  version,
  muted,
}: {
  owner: string;
  version: number;
  muted: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    const track = screenVideoTrackOf(owner);
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [owner, version]);

  return <LiveVideo ref={ref} className="voice-screen-video" muted={muted} />;
}

export default function VoiceView({ channel }: { channel: ChannelDto }) {
  const { t } = useTranslation();
  const { data: voiceStates } = useVoiceStates();
  const voice = useVoiceStore();
  const [shareOpen, setShareOpen] = useState(false);
  const myId = useAuthStore((s) => s.user?.id);
  const [shareSound, setShareSound] = useState(true);
  /** Чей показ развёрнут на всю ширину; null — все плитки равны */
  const [focused, setFocused] = useState<string | null>(null);
  const [volumeMenu, setVolumeMenu] = useState<VolumeMenuState | null>(null);
  const tiles = useRef(new Map<string, HTMLDivElement>());

  const participants = participantsOf(voiceStates, channel.id);
  const isHere = voice.channelId === channel.id;

  /** Ключ дорожки показа для участника; null — экран не показывает */
  const screenKeyOf = (userId: string): string | null => {
    if (userId === myId) return voice.sharing ? SELF_SCREEN : null;
    return voice.screenSharers.includes(userId) ? userId : null;
  };

  const liveScreens = participants.flatMap((p) => {
    const key = screenKeyOf(p.userId);
    return key ? [key] : [];
  });
  const liveKey = liveScreens.join(',');

  /* Появившийся показ разворачиваем сам: искать его вручную незачем, а
     свернуть можно щелчком. Ушедший — отпускаем. */
  useEffect(() => {
    const keys = liveKey ? liveKey.split(',') : [];
    setFocused((current) => (current && keys.includes(current) ? current : (keys[0] ?? null)));
  }, [liveKey]);

  const toggleFocus = (key: string): void =>
    setFocused((current) => (current === key ? null : key));

  const goFullscreen = (userId: string): void => {
    void tiles.current
      .get(userId)
      ?.requestFullscreen?.()
      .catch(() => undefined);
  };

  return (
    <div className="channel-view">
      <header className="channel-header">
        <Volume2 size={18} />
        {channel.name}
        {channel.topic && <span className="topic">— {channel.topic}</span>}
      </header>

      <div className={`voice-grid${focused ? ' spotlight' : ''}`}>
        {participants.length === 0 && <div className="empty-state">{t('voice.empty')}</div>}
        {participants.map((p) => {
          const self = p.userId === myId;
          const screenKey = screenKeyOf(p.userId);
          const isFocused = screenKey !== null && focused === screenKey;
          const withCamera = self ? voice.cameraOn : voice.cameraUsers.includes(p.userId);

          return (
            <div
              key={p.userId}
              ref={(el) => {
                if (el) tiles.current.set(p.userId, el);
                else tiles.current.delete(p.userId);
              }}
              className={`voice-tile${voice.speaking[p.userId] ? ' speaking' : ''}${
                screenKey ? ' screen' : ''
              }${isFocused ? ' focused' : ''}`}
              /* Правый клик — громкость этого человека и его демонстрации.
                 Свою громкость крутить незачем: себя мы не слышим. */
              onContextMenu={(e) => {
                if (self || !isHere) return;
                e.preventDefault();
                setVolumeMenu({
                  x: e.clientX,
                  y: e.clientY,
                  userId: p.userId,
                  name: p.username,
                  hasScreen: Boolean(screenKey),
                });
              }}
            >
              {screenKey ? (
                // Свой звук глушим всегда: слышать сам себя не нужно
                <ScreenVideo
                  owner={screenKey}
                  version={voice.videoVersion}
                  muted={self || !shareSound}
                />
              ) : withCamera ? (
                <CameraVideo userId={p.userId} self={self} version={voice.videoVersion} />
              ) : (
                <Avatar name={p.username} className="voice-avatar" />
              )}

              {/* Щелчок по картинке разворачивает показ и сворачивает обратно */}
              {screenKey && (
                <button
                  className="voice-screen-hit"
                  title={isFocused ? t('voice.shareCollapse') : t('voice.shareExpand')}
                  onClick={() => toggleFocus(screenKey)}
                />
              )}

              <span className="voice-tile-name">{p.username}</span>
              <span className="voice-tile-icons">
                {p.sharing && (
                  <span className="live-badge" title={t('voice.live')}>
                    <MonitorUp size={11} /> {t('voice.live')}
                  </span>
                )}
                {p.muted && <MicOff size={14} />}
                {p.deafened && <HeadphoneOff size={14} />}
              </span>

              {screenKey && (
                <div className="voice-screen-tools">
                  {!self && (
                    <button
                      className="icon-button"
                      title={shareSound ? t('voice.shareSoundOn') : t('voice.shareSoundOff')}
                      onClick={() => setShareSound((v) => !v)}
                    >
                      {shareSound ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    </button>
                  )}
                  <button
                    className="icon-button"
                    title={isFocused ? t('voice.shareCollapse') : t('voice.shareExpand')}
                    onClick={() => toggleFocus(screenKey)}
                  >
                    {isFocused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                  <button
                    className="icon-button"
                    title={t('voice.shareFull')}
                    onClick={() => goFullscreen(p.userId)}
                  >
                    <Maximize size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {volumeMenu && <VolumeMenu menu={volumeMenu} onClose={() => setVolumeMenu(null)} />}

      {voice.error && (
        <p className="auth-error voice-error">
          {t('voice.failed')}: {voice.error}
        </p>
      )}

      <div className="voice-controls">
        {isHere ? (
          <>
            <button
              className={`icon-button voice-control${voice.muted ? ' engaged' : ''}`}
              title={voice.muted ? t('voice.unmute') : t('voice.mute')}
              onClick={() => void voice.toggleMute()}
            >
              {voice.muted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              className={`icon-button voice-control${voice.deafened ? ' engaged' : ''}`}
              title={voice.deafened ? t('voice.undeafen') : t('voice.deafen')}
              onClick={() => void voice.toggleDeafen()}
            >
              {voice.deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
            </button>
            <button
              className={`icon-button voice-control${voice.cameraOn ? ' engaged' : ''}`}
              title={voice.cameraOn ? t('call.cameraOff') : t('call.cameraOn')}
              onClick={() => void voice.toggleCamera()}
            >
              {voice.cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              className={`icon-button voice-control${voice.sharing ? ' sharing' : ''}`}
              title={voice.sharing ? t('voice.stopShare') : t('voice.shareScreen')}
              onClick={() => (voice.sharing ? void voice.toggleScreenShare() : setShareOpen(true))}
            >
              <MonitorUp size={20} />
            </button>
            <button
              className="icon-button voice-control danger"
              title={t('voice.leave')}
              onClick={() => void voice.leave()}
            >
              <PhoneOff size={20} />
            </button>
          </>
        ) : (
          <button
            className="btn-primary"
            disabled={voice.connecting}
            onClick={() => void voice.join(channel.id, channel.name)}
          >
            {voice.connecting ? t('voice.connecting') : t('voice.join')}
          </button>
        )}
      </div>

      {shareOpen && (
        <ShareOptionsModal
          initial={voice.shareOptions}
          onStart={(options) => void voice.toggleScreenShare(options)}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
