import type { VoiceTokenDto } from '@voxa/shared';
import {
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type LocalVideoTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteVideoTrack,
} from 'livekit-client';
import { create } from 'zustand';

import { api } from '../api/client';
import { emitVoiceState } from '../api/socket';
import { useAuthStore } from './auth';
import { playJoinSound, playLeaveSound } from '../lib/sounds';

const DEVICES_KEY = 'voxa-audio-devices';
const VOLUMES_KEY = 'voxa-participant-volumes';

interface SavedDevices {
  micId: string | null;
  outputId: string | null;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage недоступен — настройки не сохранятся, но работать будем
  }
}

interface VoiceState {
  channelId: string | null;
  /** Имя канала на момент входа (для панели вне контекста сервера) */
  channelName: string | null;
  connecting: boolean;
  muted: boolean;
  deafened: boolean;
  /** Ошибка последней попытки подключения (показывается в VoiceView) */
  error: string | null;
  /** userId → говорит прямо сейчас */
  speaking: Record<string, boolean>;
  /** Выбранные аудиоустройства (persisted) */
  micDeviceId: string | null;
  outputDeviceId: string | null;
  /** Локальная громкость участников, userId → 0..1 (persisted) */
  participantVolumes: Record<string, number>;
  /** Я демонстрирую экран */
  sharing: boolean;
  /** Кто в канале демонстрирует экран (userId) */
  screenSharers: string[];
  /** Чей экран смотрим */
  watching: string | null;

  join: (channelId: string, channelName?: string) => Promise<void>;
  /** Принудительный мут при таймауте */
  forceMuteLocal: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  setAudioDevice: (kind: 'audioinput' | 'audiooutput', deviceId: string) => Promise<void>;
  setParticipantVolume: (userId: string, volume: number) => void;
  toggleScreenShare: () => Promise<void>;
  watch: (userId: string | null) => void;
}

/** Ключ самопросмотра собственной демонстрации в поле watching */
export const SELF_SCREEN = 'self';

/** Комната LiveKit, аудиоэлементы и видеотреки живут вне стора: они не для рендера */
let room: Room | null = null;
let localScreenTrack: LocalVideoTrack | null = null;
const audioElements = new Map<string, HTMLMediaElement>();
const screenVideoTracks = new Map<string, RemoteVideoTrack>();

/** Видеотрек демонстрации экрана участника (для attach в компоненте) */
export function screenVideoTrackOf(userId: string): RemoteVideoTrack | LocalVideoTrack | undefined {
  if (userId === SELF_SCREEN) return localScreenTrack ?? undefined;
  return screenVideoTracks.get(userId);
}

function attachAudioTrack(track: RemoteTrack, deafened: boolean): void {
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
  screenVideoTracks.clear();
  localScreenTrack = null;
  room = null;
}

const savedDevices = loadJson<SavedDevices>(DEVICES_KEY, { micId: null, outputId: null });

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  channelId: null,
  channelName: null,
  connecting: false,
  muted: false,
  deafened: false,
  error: null,
  speaking: {},
  micDeviceId: savedDevices.micId,
  outputDeviceId: savedDevices.outputId,
  participantVolumes: loadJson<Record<string, number>>(VOLUMES_KEY, {}),
  sharing: false,
  screenSharers: [],
  watching: null,

  join: async (channelId, channelName) => {
    const state = get();
    if (state.channelId === channelId || state.connecting) return;
    if (room) await get().leave();

    set({ connecting: true, channelId, channelName: channelName ?? null, error: null });
    try {
      const grant = await api<VoiceTokenDto>(`/channels/${channelId}/voice-token`, {
        method: 'POST',
      });

      const { micDeviceId, outputDeviceId } = get();
      const next = new Room({
        ...(micDeviceId ? { audioCaptureDefaults: { deviceId: micDeviceId } } : {}),
        ...(outputDeviceId ? { audioOutput: { deviceId: outputDeviceId } } : {}),
      });
      room = next;

      next.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            attachAudioTrack(track, get().deafened);
            const volume = get().participantVolumes[participant.identity];
            if (volume !== undefined) participant.setVolume(volume);
            return;
          }
          if (track.source === Track.Source.ScreenShare) {
            screenVideoTracks.set(participant.identity, track as RemoteVideoTrack);
            set((s) => ({
              screenSharers: [...new Set([...s.screenSharers, participant.identity])],
              // первый появившийся экран открываем автоматически
              watching: s.watching ?? participant.identity,
            }));
          }
        },
      );

      next.on(
        RoomEvent.TrackUnsubscribed,
        (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            detachTrack(track);
            return;
          }
          if (track.source === Track.Source.ScreenShare) {
            screenVideoTracks.delete(participant.identity);
            set((s) => {
              const sharers = s.screenSharers.filter((id) => id !== participant.identity);
              return {
                screenSharers: sharers,
                watching: s.watching === participant.identity ? (sharers[0] ?? null) : s.watching,
              };
            });
          }
        },
      );

      next.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        set({ speaking: Object.fromEntries(speakers.map((p) => [p.identity, true])) });
      });

      // «Остановить демонстрацию» из панели браузера
      next.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        if (pub.source === Track.Source.ScreenShare) {
          localScreenTrack = null;
          set((s) => ({
            sharing: false,
            watching: s.watching === SELF_SCREEN ? (s.screenSharers[0] ?? null) : s.watching,
          }));
        }
      });

      next.on(RoomEvent.Disconnected, () => {
        // Разрыв со стороны сервера/сети — приводим стор в порядок
        if (room === next) {
          cleanupRoom();
          set({
            channelId: null,
            channelName: null,
            connecting: false,
            speaking: {},
            sharing: false,
            screenSharers: [],
            watching: null,
          });
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
      set({
        channelId: null,
        channelName: null,
        connecting: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  leave: async () => {
    const current = room;
    room = null; // до disconnect: обработчик Disconnected не должен дублировать
    if (current) await current.disconnect();
    for (const element of audioElements.values()) element.remove();
    audioElements.clear();
    screenVideoTracks.clear();
    localScreenTrack = null;
    set({
      channelId: null,
      channelName: null,
      connecting: false,
      speaking: {},
      muted: false,
      deafened: false,
      sharing: false,
      screenSharers: [],
      watching: null,
    });
    emitVoiceState({ channelId: null, muted: false, deafened: false });
    playLeaveSound();
  },

  /** Таймаут: мгновенный мут без права размутиться (сервер дублирует на SFU) */
  forceMuteLocal: async () => {
    const { channelId, muted } = get();
    if (!room || !channelId || muted) return;
    await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    set({ muted: true });
    emitVoiceState({ channelId, muted: true, deafened: get().deafened });
  },

  toggleMute: async () => {
    const { channelId, muted, deafened } = get();
    if (!room || !channelId) return;
    // Активный таймаут: размутиться нельзя (SFU всё равно не даст)
    const timedOutUntil = useAuthStore.getState().user?.timedOutUntil;
    if (muted && timedOutUntil && new Date(timedOutUntil) > new Date()) return;
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

  setAudioDevice: async (kind, deviceId) => {
    const saved = loadJson<SavedDevices>(DEVICES_KEY, { micId: null, outputId: null });
    const nextSaved =
      kind === 'audioinput' ? { ...saved, micId: deviceId } : { ...saved, outputId: deviceId };
    saveJson(DEVICES_KEY, nextSaved);
    set(kind === 'audioinput' ? { micDeviceId: deviceId } : { outputDeviceId: deviceId });
    if (room) await room.switchActiveDevice(kind, deviceId);
  },

  setParticipantVolume: (userId, volume) => {
    const volumes = { ...get().participantVolumes, [userId]: volume };
    saveJson(VOLUMES_KEY, volumes);
    set({ participantVolumes: volumes });
    room?.remoteParticipants.get(userId)?.setVolume(volume);
  },

  toggleScreenShare: async () => {
    const { channelId, sharing } = get();
    if (!room || !channelId) return;
    try {
      // 720p/30fps по умолчанию (раздел 5.5 PRD), со звуком вкладки/окна
      const publication = await room.localParticipant.setScreenShareEnabled(!sharing, {
        audio: true,
        resolution: { width: 1280, height: 720, frameRate: 30 },
      });
      if (sharing) {
        localScreenTrack = null;
        set((s) => ({
          sharing: false,
          watching: s.watching === SELF_SCREEN ? (s.screenSharers[0] ?? null) : s.watching,
        }));
      } else {
        localScreenTrack = (publication?.videoTrack as LocalVideoTrack | undefined) ?? null;
        // самопросмотр открываем сразу — видно, что именно стримишь
        set({
          sharing: Boolean(publication),
          watching: publication ? SELF_SCREEN : get().watching,
        });
      }
    } catch {
      // пользователь закрыл диалог выбора экрана — не ошибка
    }
  },

  watch: (userId) => set({ watching: userId }),
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
