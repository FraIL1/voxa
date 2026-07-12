import type { ChannelDto } from '@voxa/shared';
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { participantsOf, useVoiceStates } from '../hooks/useVoiceStates';
import { useVoiceStore } from '../stores/voice';

export default function VoiceView({ channel }: { channel: ChannelDto }) {
  const { t } = useTranslation();
  const { data: voiceStates } = useVoiceStates();
  const voice = useVoiceStore();

  const participants = participantsOf(voiceStates, channel.id);
  const isHere = voice.channelId === channel.id;

  return (
    <div className="channel-view">
      <header className="channel-header">
        <Volume2 size={18} />
        {channel.name}
        {channel.topic && <span className="topic">— {channel.topic}</span>}
      </header>

      <div className="voice-grid">
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
          </div>
        ))}
      </div>

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
    </div>
  );
}
