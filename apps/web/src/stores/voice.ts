import type { VoiceTokenDto } from '@voxa/shared';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { create } from 'zustand';

import { api } from '../api/client';
import { emitVoiceState } from '../api/socket';
import { playJoinSound, playLeaveSound } from '../lib/sounds';

interface VoiceState {
  channelId: string | null;
  connecting: boolean;
  muted: boolean;
  deafened: boolean;
  /** userId → говорит прямо сейчас */
  speaking: Record<string, boolean>;
  join: (channelId: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
}

/** Комната LiveKit и аудиоэлементы живут вне стора: они не для рендера */
let room: Room | null = null;
const audioElements = new Map<string, HTMLMediaElement>();

function attachTrack(track: RemoteTrack, deafened: boolean): void {
  if (track.kind !== Track.Kind.Audio) return;
  const element = track.attach();
  element.muted = deafened;
  element.style.display = 'none';
  document.body.appendChild(element);
  audioElements.set(track.sid ?? String(audioElements.size), element);
}

function detachTrack(track: RemoteTrack): void {
  for (const element of track.detach()) element.remove();
  if (track.sid) audioElements.delete(track.sid);
}

function cleanupRoom(): void {
  for (const element of audioElements.values()) element.remove();
  audioElements.clear();
  room = null;
}

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  channelId: null,
  connecting: false,
  muted: false,
  deafened: false,
  speaking: {},

  join: async (channelId) => {
    const state = get();
    if (state.channelId === channelId || state.connecting) return;
    if (room) await get().leave();

    set({ connecting: true, channelId });
    try {
      const grant = await api<VoiceTokenDto>(`/channels/${channelId}/voice-token`, {
        method: 'POST',
      });

      const next = new Room();
      room = next;

      next.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        attachTrack(track, get().deafened);
      });
      next.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication) => {
        detachTrack(track);
      });
      next.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        set({ speaking: Object.fromEntries(speakers.map((p) => [p.identity, true])) });
      });
      next.on(RoomEvent.Disconnected, () => {
        // Разрыв со стороны сервера/сети — приводим стор в порядок
        if (room === next) {
          cleanupRoom();
          set({ channelId: null, connecting: false, speaking: {} });
          emitVoiceState({ channelId: null, muted: false, deafened: false });
        }
      });

      await next.connect(grant.url, grant.token);
      await next.localParticipant.setMicrophoneEnabled(true);

      set({ connecting: false, muted: false, deafened: false });
      emitVoiceState({ channelId, muted: false, deafened: false });
      playJoinSound();
    } catch (error) {
      cleanupRoom();
      set({ channelId: null, connecting: false });
      throw error;
    }
  },

  leave: async () => {
    const current = room;
    room = null; // до disconnect: обработчик Disconnected не должен дублировать
    if (current) await current.disconnect();
    for (const element of audioElements.values()) element.remove();
    audioElements.clear();
    set({ channelId: null, connecting: false, speaking: {}, muted: false, deafened: false });
    emitVoiceState({ channelId: null, muted: false, deafened: false });
    playLeaveSound();
  },

  toggleMute: async () => {
    const { channelId, muted, deafened } = get();
    if (!room || !channelId) return;
    const nextMuted = !muted;
    // Снятие мьюта выводит и из deafen (как в Discord)
    const nextDeafened = nextMuted ? deafened : false;
    if (!nextDeafened && deafened) {
      for (const element of audioElements.values()) element.muted = false;
    }
    await room.localParticipant.setMicrophoneEnabled(!nextMuted);
    set({ muted: nextMuted, deafened: nextDeafened });
    emitVoiceState({ channelId, muted: nextMuted, deafened: nextDeafened });
  },

  toggleDeafen: async () => {
    const { channelId, muted, deafened } = get();
    if (!room || !channelId) return;
    const nextDeafened = !deafened;
    // Deafen подразумевает выключенный микрофон
    const nextMuted = nextDeafened ? true : muted;
    for (const element of audioElements.values()) element.muted = nextDeafened;
    await room.localParticipant.setMicrophoneEnabled(!nextMuted);
    set({ deafened: nextDeafened, muted: nextMuted });
    emitVoiceState({ channelId, muted: nextMuted, deafened: nextDeafened });
  },
}));

/** Текущее голосовое состояние для повторной отправки после реконнекта WS */
export function currentVoiceState(): {
  channelId: string | null;
  muted: boolean;
  deafened: boolean;
} {
  const { channelId, muted, deafened } = useVoiceStore.getState();
  return { channelId, muted, deafened };
}
