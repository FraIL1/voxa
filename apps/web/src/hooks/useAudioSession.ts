import { useCallStore } from '../stores/call';
import { useVoiceStore } from '../stores/voice';

/** Где сейчас идёт разговор: в голосовом канале, в личном звонке или нигде */
export type AudioSessionKind = 'voice' | 'call' | null;

export interface AudioSession {
  kind: AudioSessionKind;
  /** Есть активный разговор — кнопки микрофона и звука работают */
  active: boolean;
  muted: boolean;
  deafened: boolean;
  /** Что показать в подписи: канал или имя собеседника */
  title: string | null;
  toggleMute: () => void;
  toggleDeafen: () => void;
  leave: () => void;
}

/** Идёт ли личный звонок (в нём приоритет управления звуком) */
function inCallNow(): boolean {
  const status = useCallStore.getState().status;
  return status === 'outgoing' || status === 'active';
}

/** Микрофон активной сессии — для хоткеев, вне React */
export function toggleActiveMute(): void {
  if (inCallNow()) void useCallStore.getState().toggleMute();
  else void useVoiceStore.getState().toggleMute();
}

/** Звук активной сессии — для хоткеев, вне React */
export function toggleActiveDeafen(): void {
  if (inCallNow()) void useCallStore.getState().toggleDeafen();
  else void useVoiceStore.getState().toggleDeafen();
}

/**
 * Единая точка управления звуком. Раньше кнопки в карточке пользователя
 * знали только про голосовые каналы, поэтому во время звонка 1-на-1 они
 * ничего не делали. Теперь обе панели управляют одной и той же сессией.
 */
export function useAudioSession(): AudioSession {
  const voiceChannelId = useVoiceStore((s) => s.channelId);
  const voiceMuted = useVoiceStore((s) => s.muted);
  const voiceDeafened = useVoiceStore((s) => s.deafened);
  const voiceName = useVoiceStore((s) => s.channelName);

  const callStatus = useCallStore((s) => s.status);
  const callMuted = useCallStore((s) => s.muted);
  const callDeafened = useCallStore((s) => s.deafened);
  const peerName = useCallStore((s) => s.peerName);

  const inCall = callStatus === 'outgoing' || callStatus === 'active';

  if (inCall) {
    return {
      kind: 'call',
      active: true,
      muted: callMuted,
      deafened: callDeafened,
      title: peerName || null,
      toggleMute: () => void useCallStore.getState().toggleMute(),
      toggleDeafen: () => void useCallStore.getState().toggleDeafen(),
      leave: () => void useCallStore.getState().hangUp(),
    };
  }

  return {
    kind: voiceChannelId ? 'voice' : null,
    active: Boolean(voiceChannelId),
    muted: voiceMuted,
    deafened: voiceDeafened,
    title: voiceName,
    toggleMute: () => void useVoiceStore.getState().toggleMute(),
    toggleDeafen: () => void useVoiceStore.getState().toggleDeafen(),
    leave: () => void useVoiceStore.getState().leave(),
  };
}
