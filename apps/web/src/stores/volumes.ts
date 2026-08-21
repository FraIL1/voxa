import { Track, type Room } from 'livekit-client';
import { create } from 'zustand';

/*
 * Личная громкость участников.
 *
 * Настройка ничего не отправляет на сервер: она меняет звук только в этом
 * браузере, и остальные о ней не знают. Голос человека и звук его
 * демонстрации регулируются порознь — LiveKit умеет разводить их по
 * источникам дорожки.
 *
 * Склад общий для голосовых каналов и звонков: приглушённый в канале
 * остаётся приглушённым и в личном разговоре, иначе одного и того же
 * крикуна пришлось бы убавлять дважды.
 */

const VOICE_KEY = 'voxa-participant-volumes';
const SCREEN_KEY = 'voxa-screen-volumes';

export type VolumeKind = 'voice' | 'screen';

function load(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function save(key: string, value: Record<string, number>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage недоступен — громкости не переживут перезапуск, не беда
  }
}

/* Тип сужен намеренно: setVolume принимает только эти два источника */
function sourceOf(kind: VolumeKind): Track.Source.Microphone | Track.Source.ScreenShareAudio {
  return kind === 'screen' ? Track.Source.ScreenShareAudio : Track.Source.Microphone;
}

/* Комнаты живут в своих сторах (канал и звонок) и меняются на ходу, поэтому
   держим не сами комнаты, а способ их получить. */
const roomGetters: (() => Room | null)[] = [];

export function registerVolumeRoom(getRoom: () => Room | null): void {
  if (!roomGetters.includes(getRoom)) roomGetters.push(getRoom);
}

/** Применить сохранённые громкости к участнику (после подписки на дорожку) */
export function applyStoredVolumes(room: Room | null, userId: string): void {
  const participant = room?.remoteParticipants.get(userId);
  if (!participant) return;
  const { voice, screen } = useVolumesStore.getState();
  if (voice[userId] !== undefined) {
    participant.setVolume(voice[userId], Track.Source.Microphone);
  }
  if (screen[userId] !== undefined) {
    participant.setVolume(screen[userId], Track.Source.ScreenShareAudio);
  }
}

interface VolumesState {
  /** userId → громкость голоса, 0..1 */
  voice: Record<string, number>;
  /** userId → громкость звука его демонстрации, 0..1 */
  screen: Record<string, number>;
  setVolume: (userId: string, kind: VolumeKind, volume: number) => void;
  /** Вернуть громкость к обычной (1) по обоим источникам */
  reset: (userId: string) => void;
}

export const useVolumesStore = create<VolumesState>()((set, get) => ({
  voice: load(VOICE_KEY),
  screen: load(SCREEN_KEY),

  setVolume: (userId, kind, volume) => {
    const key = kind === 'screen' ? SCREEN_KEY : VOICE_KEY;
    const next = { ...get()[kind], [userId]: volume };
    save(key, next);
    set(kind === 'screen' ? { screen: next } : { voice: next });

    const source = sourceOf(kind);
    for (const getRoom of roomGetters) {
      getRoom()?.remoteParticipants.get(userId)?.setVolume(volume, source);
    }
  },

  reset: (userId) => {
    const { setVolume } = get();
    setVolume(userId, 'voice', 1);
    setVolume(userId, 'screen', 1);
  },
}));

/** Громкость участника; по умолчанию обычная */
export function volumeOf(state: VolumesState, userId: string, kind: VolumeKind): number {
  return state[kind][userId] ?? 1;
}
