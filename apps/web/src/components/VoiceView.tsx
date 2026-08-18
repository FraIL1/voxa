import type { ChannelDto } from '@voxa/shared';
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  Maximize2,
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

/**
 * Плитка участника. Когда камера включена, вместо аватарки идёт видео —
 * трек живёт вне стора, поэтому привязываем его вручную.
 */
function VoiceTile({
  userId,
  name,
  withVideo,
  self,
  version,
}: {
  userId: string;
  name: string;
  withVideo: boolean;
  self: boolean;
  /** Меняется при появлении и пропаже треков — повод перепривязаться */
  version: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    const track = cameraTrackOf(self ? SELF_CAMERA : userId);
    if (!element || !track || !withVideo) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [userId, self, withVideo, version]);

  if (!withVideo) return <Avatar name={name} className="voice-avatar" />;
  // Своё видео зеркалим и глушим: слышать себя не нужно
  return <LiveVideo ref={ref} className="voice-video" />;
}

export default function VoiceView({ channel }: { channel: ChannelDto }) {
  const { t } = useTranslation();
  const { data: voiceStates } = useVoiceStates();
  const voice = useVoiceStore();
  const [shareOpen, setShareOpen] = useState(false);
  const myId = useAuthStore((s) => s.user?.id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [shareSound, setShareSound] = useState(true);

  const participants = participantsOf(voiceStates, channel.id);
  const isHere = voice.channelId === channel.id;
  const nameOf = (userId: string): string =>
    participants.find((p) => p.userId === userId)?.username ?? '…';

  // Подключение выбранного видеопотока к <video>
  const watchingTrackReady = voice.watching && screenVideoTrackOf(voice.watching);
  useEffect(() => {
    const element = videoRef.current;
    const track = voice.watching ? screenVideoTrackOf(voice.watching) : undefined;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [voice.watching, watchingTrackReady]);

  const showScreenArea = isHere && (voice.screenSharers.length > 0 || voice.sharing);

  return (
    <div className="channel-view">
      <header className="channel-header">
        <Volume2 size={18} />
        {channel.name}
        {channel.topic && <span className="topic">— {channel.topic}</span>}
      </header>

      {showScreenArea && (
        <div className="screen-area">
          <div className="screen-tabs">
            {voice.screenSharers.map((userId) => (
              <button
                key={userId}
                className={`screen-tab${voice.watching === userId ? ' active' : ''}`}
                onClick={() => voice.watch(voice.watching === userId ? null : userId)}
              >
                <MonitorUp size={13} /> {nameOf(userId)}
              </button>
            ))}
            {voice.sharing && (
              <button
                className={`screen-tab own${voice.watching === SELF_SCREEN ? ' active' : ''}`}
                onClick={() => voice.watch(voice.watching === SELF_SCREEN ? null : SELF_SCREEN)}
              >
                <MonitorUp size={13} /> {t('voice.yourScreen')}
              </button>
            )}
          </div>
          {voice.watching && watchingTrackReady ? (
            <div className="screen-stage" ref={stageRef}>
              <LiveVideo ref={videoRef} className="screen-video" />

              {/* Подпись и управление поверх картинки: под ней места нет,
                  а знать «что это и чей» нужно всегда */}
              <div className="screen-overlay">
                <span className="screen-what">
                  <MonitorUp size={13} />
                  {t('voice.shareLabel')}
                  <span className="screen-air">
                    <i />
                    {voice.watching === SELF_SCREEN
                      ? t('voice.yourScreen')
                      : nameOf(voice.watching)}
                    {' · '}
                    {t('voice.onAir')}
                  </span>
                </span>

                <span className="screen-tools">
                  <button
                    className={`screen-tool${shareSound ? ' on' : ''}`}
                    title={shareSound ? t('voice.shareSoundOn') : t('voice.shareSoundOff')}
                    onClick={() => {
                      const next = !shareSound;
                      setShareSound(next);
                      if (videoRef.current) videoRef.current.muted = !next;
                    }}
                  >
                    {shareSound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                    {shareSound ? t('voice.shareSoundOn') : t('voice.shareSoundOff')}
                  </button>
                  <button
                    className="screen-tool"
                    title={t('voice.shareFull')}
                    onClick={() => {
                      if (document.fullscreenElement) void document.exitFullscreen();
                      else void stageRef.current?.requestFullscreen();
                    }}
                  >
                    <Maximize2 size={15} />
                    {t('voice.shareFull')}
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <div className="screen-placeholder">{t('voice.pickScreen')}</div>
          )}
        </div>
      )}

      <div className={`voice-grid${showScreenArea ? ' compact' : ''}`}>
        {participants.length === 0 && <div className="empty-state">{t('voice.empty')}</div>}
        {participants.map((p) => (
          <div
            key={p.userId}
            className={`voice-tile${voice.speaking[p.userId] ? ' speaking' : ''}`}
          >
            <VoiceTile
              userId={p.userId}
              name={p.username}
              self={p.userId === myId}
              withVideo={p.userId === myId ? voice.cameraOn : voice.cameraUsers.includes(p.userId)}
              version={voice.videoVersion}
            />
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
            {isHere && p.userId !== myId && (
              <input
                type="range"
                className="volume-slider"
                title={t('voice.volume')}
                min={0}
                max={1}
                step={0.05}
                value={voice.participantVolumes[p.userId] ?? 1}
                onChange={(e) => voice.setParticipantVolume(p.userId, Number(e.target.value))}
              />
            )}
          </div>
        ))}
      </div>

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
