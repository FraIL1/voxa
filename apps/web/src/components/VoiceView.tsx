import type { ChannelDto } from '@voxa/shared';
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Settings,
  Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { participantsOf, useVoiceStates } from '../hooks/useVoiceStates';
import { useAuthStore } from '../stores/auth';
import { screenVideoTrackOf, useVoiceStore } from '../stores/voice';
import VoiceSettings from './VoiceSettings';

export default function VoiceView({ channel }: { channel: ChannelDto }) {
  const { t } = useTranslation();
  const { data: voiceStates } = useVoiceStates();
  const voice = useVoiceStore();
  const myId = useAuthStore((s) => s.user?.id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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
            {voice.sharing && <span className="screen-tab own">{t('voice.yourScreen')}</span>}
          </div>
          {voice.watching && watchingTrackReady ? (
            <video ref={videoRef} className="screen-video" autoPlay playsInline muted />
          ) : (
            <div className="screen-placeholder">
              {voice.screenSharers.length > 0 ? t('voice.pickScreen') : t('voice.onlyYouShare')}
            </div>
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
            <div className="avatar voice-avatar" aria-hidden>
              {p.username.slice(0, 1).toUpperCase()}
            </div>
            <span className="voice-tile-name">{p.username}</span>
            <span className="voice-tile-icons">
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
              className={`icon-button voice-control${voice.sharing ? ' sharing' : ''}`}
              title={voice.sharing ? t('voice.stopShare') : t('voice.shareScreen')}
              onClick={() => void voice.toggleScreenShare()}
            >
              <MonitorUp size={20} />
            </button>
            <button
              className="icon-button voice-control"
              title={t('voice.settings')}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <Settings size={20} />
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
            onClick={() => void voice.join(channel.id)}
          >
            {voice.connecting ? t('voice.connecting') : t('voice.join')}
          </button>
        )}
      </div>

      {settingsOpen && <VoiceSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
