import { useAuthStore } from '../stores/auth';
import { useCallStore } from '../stores/call';
import { useVoiceStore, type ShareOptions } from '../stores/voice';

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
  /** Вторая строка: сервер для канала, «личный звонок» для звонка */
  subtitle: string | null;
  /** Задержка до сервера, мс */
  latencyMs: number | null;
  cameraOn: boolean;
  sharing: boolean;
  noiseOn: boolean;
  /** Говорю ли я прямо сейчас — для свечения своей аватарки */
  speaking: boolean;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => void;
  toggleShare: () => void;
  /** Запуск показа с выбранным качеством — из нашего окна настроек */
  startShare: (options: ShareOptions) => void;
  toggleNoise: () => void;
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

/** Выход из активной сессии: из канала или из звонка — смотря где ты */
export function leaveActive(): void {
  if (inCallNow()) void useCallStore.getState().hangUp();
  else void useVoiceStore.getState().leave();
}

/** Камера активной сессии */
export function toggleActiveCamera(): void {
  if (inCallNow()) void useCallStore.getState().toggleCamera();
  else void useVoiceStore.getState().toggleCamera();
}

/** Показ экрана активной сессии. Настройки берём прошлые — клавише некогда спрашивать. */
export function toggleActiveShare(): void {
  if (inCallNow()) void useCallStore.getState().toggleScreenShare();
  else void useVoiceStore.getState().toggleScreenShare();
}

/** Ответить на входящий звонок. Вне звонка клавиша молчит. */
export function answerIncoming(): void {
  const call = useCallStore.getState();
  if (call.status !== 'incoming' || !call.incoming) return;
  void call.acceptIncoming(call.incoming.from.displayName);
}

/** Отклонить входящий звонок */
export function declineIncoming(): void {
  const call = useCallStore.getState();
  if (call.status !== 'incoming') return;
  void call.declineIncoming();
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

  const voiceGuild = useVoiceStore((s) => s.guildName);
  const voiceLatency = useVoiceStore((s) => s.latencyMs);
  const voiceCamera = useVoiceStore((s) => s.cameraOn);
  const voiceSharing = useVoiceStore((s) => s.sharing);
  const voiceNoise = useVoiceStore((s) => s.noiseOn);
  const voiceSpeaking = useVoiceStore((s) => s.speaking);

  const callStatus = useCallStore((s) => s.status);
  const callMuted = useCallStore((s) => s.muted);
  const callDeafened = useCallStore((s) => s.deafened);
  const peerName = useCallStore((s) => s.peerName);
  const callLatency = useCallStore((s) => s.latencyMs);
  const callCamera = useCallStore((s) => s.cameraOn);
  const callSharing = useCallStore((s) => s.sharing);
  const callNoise = useCallStore((s) => s.noiseOn);
  const callSpeaking = useCallStore((s) => s.speaking);

  const myId = useAuthStore((s) => s.user?.id);
  const inCall = callStatus === 'outgoing' || callStatus === 'active';

  if (inCall) {
    return {
      kind: 'call',
      active: true,
      muted: callMuted,
      deafened: callDeafened,
      title: peerName || null,
      subtitle: null,
      latencyMs: callLatency,
      cameraOn: callCamera,
      sharing: callSharing,
      noiseOn: callNoise,
      speaking: Boolean(myId && callSpeaking[myId]),
      toggleMute: () => void useCallStore.getState().toggleMute(),
      toggleDeafen: () => void useCallStore.getState().toggleDeafen(),
      toggleCamera: () => void useCallStore.getState().toggleCamera(),
      toggleShare: () => void useCallStore.getState().toggleScreenShare(),
      startShare: (options) => void useCallStore.getState().toggleScreenShare(options),
      toggleNoise: () => void useCallStore.getState().toggleNoiseSuppression(),
      leave: () => void useCallStore.getState().hangUp(),
    };
  }

  return {
    kind: voiceChannelId ? 'voice' : null,
    active: Boolean(voiceChannelId),
    muted: voiceMuted,
    deafened: voiceDeafened,
    title: voiceName,
    subtitle: voiceGuild,
    latencyMs: voiceLatency,
    cameraOn: voiceCamera,
    sharing: voiceSharing,
    noiseOn: voiceNoise,
    speaking: Boolean(myId && voiceSpeaking[myId]),
    toggleMute: () => void useVoiceStore.getState().toggleMute(),
    toggleDeafen: () => void useVoiceStore.getState().toggleDeafen(),
    toggleCamera: () => void useVoiceStore.getState().toggleCamera(),
    toggleShare: () => void useVoiceStore.getState().toggleScreenShare(),
    startShare: (options) => void useVoiceStore.getState().toggleScreenShare(options),
    toggleNoise: () => void useVoiceStore.getState().toggleNoiseSuppression(),
    leave: () => void useVoiceStore.getState().leave(),
  };
}
