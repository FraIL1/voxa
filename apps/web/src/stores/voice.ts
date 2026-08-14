import type { VoiceTokenDto } from '@voxa/shared';
import {
  Room,
  RoomEvent,
  ConnectionQuality,
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
import {
  applyMicGain,
  micCaptureOptions,
  noiseSuppression,
  registerOutput,
  applyNoiseSuppression,
  unregisterOutput,
  watchLatency,
} from '../lib/audio-io';
import {
  playDeafen,
  playMicOff,
  playMicOn,
  playSelfJoin,
  playSelfLeave,
  playShareStart,
  playShareStop,
  playUndeafen,
} from '../lib/sounds';

const DEVICES_KEY = 'voxa-audio-devices';
const SHARE_KEY = 'voxa-share-options';
const VOLUMES_KEY = 'voxa-participant-volumes';

interface SavedDevices {
  micId: string | null;
  outputId: string | null;
  /** Камера общая для голосовых каналов и звонков в личке */
  cameraId: string | null;
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

/** Качество, частота кадров и звук демонстрации экрана */
export interface ShareOptions {
  width: number;
  height: number;
  frameRate: number;
  audio: boolean;
}

const DEFAULT_SHARE: ShareOptions = { width: 1280, height: 720, frameRate: 30, audio: true };

interface VoiceState {
  channelId: string | null;
  /** Имя сервера — во второй строке панели связи */
  guildName: string | null;
  /** Задержка до сервера, мс; null — ещё не измерена */
  latencyMs: number | null;
  /** Качество связи глазами сервера */
  quality: ConnectionQuality;
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
  cameraDeviceId: string | null;
  /** Локальная громкость участников, userId → 0..1 (persisted) */
  participantVolumes: Record<string, number>;
  /** Я демонстрирую экран */
  sharing: boolean;
  /** Своя камера включена */
  cameraOn: boolean;
  /** Подавление шума включено */
  noiseOn: boolean;
  /** Звук просили, но браузер его не дал — галочку не поставили */
  shareAudioMissing: boolean;
  /** Кто из участников показывает камеру */
  cameraUsers: string[];
  /** Счётчик для перепривязки видео: треки живут вне стора */
  videoVersion: number;
  /** Кто в канале демонстрирует экран (userId) */
  screenSharers: string[];
  /** Чей экран смотрим */
  watching: string | null;

  join: (channelId: string, channelName?: string, guildName?: string) => Promise<void>;
  /** Принудительный мут при таймауте */
  forceMuteLocal: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  setAudioDevice: (kind: 'audioinput' | 'audiooutput', deviceId: string) => Promise<void>;
  setCameraDevice: (deviceId: string) => Promise<void>;
  setParticipantVolume: (userId: string, volume: number) => void;
  /** Что показывать и как — спрашиваем перед запуском, выбор запоминается */
  shareOptions: ShareOptions;
  toggleScreenShare: (options?: ShareOptions) => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleNoiseSuppression: () => Promise<void>;
  watch: (userId: string | null) => void;
}

/** Ключ самопросмотра собственной демонстрации в поле watching */
export const SELF_SCREEN = 'self';

/** Комната LiveKit, аудиоэлементы и видеотреки живут вне стора: они не для рендера */
let room: Room | null = null;
let localScreenTrack: LocalVideoTrack | null = null;
let stopLatency: (() => void) | null = null;

/** Остальным участникам канала нужно знать, кто сейчас в эфире */
function announceSharing(sharing: boolean): void {
  const { channelId, muted, deafened } = useVoiceStore.getState();
  if (!channelId) return;
  emitVoiceState({ channelId, muted, deafened, sharing });
}

/* Точка входа для тестов: сам показ экрана автоматикой не запустить — окно
   выбора рисует браузер. Проверять же передачу состояния по сети надо. */
if (import.meta.env.DEV) {
  (window as unknown as { __voxaAnnounceSharing: typeof announceSharing }).__voxaAnnounceSharing =
    announceSharing;
}
const audioElements = new Map<string, HTMLMediaElement>();
const screenVideoTracks = new Map<string, RemoteVideoTrack>();
const cameraTracks = new Map<string, RemoteVideoTrack>();
let localCameraTrack: LocalVideoTrack | null = null;

/** Видеотрек камеры участника (для attach в компоненте) */
export function cameraTrackOf(userId: string): RemoteVideoTrack | LocalVideoTrack | undefined {
  if (userId === SELF_CAMERA) return localCameraTrack ?? undefined;
  return cameraTracks.get(userId);
}

/** Ключ собственной камеры в списке участников с видео */
export const SELF_CAMERA = 'self-camera';

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
  registerOutput(element);
  audioElements.set(track.sid ?? String(audioElements.size), element);
}

function detachTrack(track: RemoteTrack): void {
  for (const element of track.detach()) element.remove();
  if (track.sid) {
    const element = audioElements.get(track.sid);
    if (element) unregisterOutput(element);
    audioElements.delete(track.sid);
  }
}

function cleanupRoom(): void {
  for (const element of audioElements.values()) {
    unregisterOutput(element);
    element.remove();
  }
  audioElements.clear();
  screenVideoTracks.clear();
  cameraTracks.clear();
  localScreenTrack = null;
  localCameraTrack = null;
  stopLatency?.();
  stopLatency = null;
  room = null;
}

const savedDevices = loadJson<SavedDevices>(DEVICES_KEY, {
  micId: null,
  outputId: null,
  cameraId: null,
});

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  channelId: null,
  channelName: null,
  guildName: null,
  latencyMs: null,
  quality: ConnectionQuality.Unknown,
  connecting: false,
  muted: false,
  deafened: false,
  error: null,
  speaking: {},
  micDeviceId: savedDevices.micId,
  outputDeviceId: savedDevices.outputId,
  cameraDeviceId: savedDevices.cameraId,
  participantVolumes: loadJson<Record<string, number>>(VOLUMES_KEY, {}),
  sharing: false,
  cameraOn: false,
  cameraUsers: [],
  videoVersion: 0,
  noiseOn: noiseSuppression(),
  shareAudioMissing: false,
  screenSharers: [],
  watching: null,
  shareOptions: loadJson<ShareOptions>(SHARE_KEY, DEFAULT_SHARE),

  join: async (channelId, channelName, guildName) => {
    const state = get();
    if (state.channelId === channelId || state.connecting) return;
    if (room) await get().leave();

    /* Разговор может быть только один: вход в канал завершает звонок в личке.
       Импорт динамический — стор звонков сам знает про голосовой, и обычный
       импорт замкнул бы их друг на друга. */
    const { useCallStore } = await import('./call');
    const callStatus = useCallStore.getState().status;
    if (callStatus === 'outgoing' || callStatus === 'active') {
      await useCallStore.getState().hangUp();
    }

    set({
      connecting: true,
      channelId,
      channelName: channelName ?? null,
      guildName: guildName ?? null,
      error: null,
    });
    try {
      const grant = await api<VoiceTokenDto>(`/channels/${channelId}/voice-token`, {
        method: 'POST',
      });

      const { micDeviceId, outputDeviceId } = get();
      const next = new Room({
        audioCaptureDefaults: micCaptureOptions(micDeviceId),
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
          if (track.source === Track.Source.Camera) {
            cameraTracks.set(participant.identity, track as RemoteVideoTrack);
            set((s) => ({
              cameraUsers: [...new Set([...s.cameraUsers, participant.identity])],
              videoVersion: s.videoVersion + 1,
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
          if (track.source === Track.Source.Camera) {
            cameraTracks.delete(participant.identity);
            set((s) => ({
              cameraUsers: s.cameraUsers.filter((id) => id !== participant.identity),
              videoVersion: s.videoVersion + 1,
            }));
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

      next.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        if (participant.identity === next.localParticipant.identity) set({ quality });
      });

      stopLatency?.();
      stopLatency = watchLatency(
        () => room,
        (latencyMs) => set({ latencyMs }),
      );

      // «Остановить демонстрацию» из панели браузера
      next.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        if (pub.source === Track.Source.ScreenShare) {
          localScreenTrack = null;
          announceSharing(false);
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
          emitVoiceState({ channelId: null, muted: false, deafened: false, sharing: false });
        }
      });

      await next.connect(grant.url, grant.token);
      await next.localParticipant.setMicrophoneEnabled(true);
      await applyMicGain(
        next.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack,
      );

      set({ connecting: false, muted: false, deafened: false });
      emitVoiceState({ channelId, muted: false, deafened: false, sharing: false });
      playSelfJoin();
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
    for (const element of audioElements.values()) {
      unregisterOutput(element);
      element.remove();
    }
    audioElements.clear();
    screenVideoTracks.clear();
    cameraTracks.clear();
    localScreenTrack = null;
    localCameraTrack = null;
    stopLatency?.();
    stopLatency = null;
    set({
      channelId: null,
      guildName: null,
      latencyMs: null,
      quality: ConnectionQuality.Unknown,
      channelName: null,
      connecting: false,
      speaking: {},
      muted: false,
      deafened: false,
      sharing: false,
      cameraOn: false,
      cameraUsers: [],
      screenSharers: [],
      watching: null,
    });
    emitVoiceState({ channelId: null, muted: false, deafened: false, sharing: false });
    playSelfLeave();
  },

  /** Таймаут: мгновенный мут без права размутиться (сервер дублирует на SFU) */
  forceMuteLocal: async () => {
    const { channelId, muted } = get();
    if (!room || !channelId || muted) return;
    await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    set({ muted: true });
    emitVoiceState({ channelId, muted: true, deafened: get().deafened, sharing: get().sharing });
  },

  toggleMute: async () => {
    const { channelId, muted, deafened } = get();
    if (!room || !channelId) return;
    // Таймаут сервера отбирает право публиковать на уровне SFU — здесь
    // отдельная проверка не нужна: setMicrophoneEnabled просто не сработает
    const nextMuted = !muted;
    // Снятие мьюта выводит и из deafen (как в Discord)
    const nextDeafened = nextMuted ? deafened : false;
    if (!nextDeafened && deafened) {
      for (const element of audioElements.values()) element.muted = false;
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted);
    } catch (error) {
      // Без этого не включившийся микрофон выглядел как «кнопка не нажимается»
      set({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    set({ muted: nextMuted, deafened: nextDeafened });
    emitVoiceState({ channelId, muted: nextMuted, deafened: nextDeafened, sharing: get().sharing });
    // Снятие мьюта вывело и из deafen — звучит возвращение звука, оно главнее
    if (deafened && !nextDeafened) playUndeafen();
    else if (nextMuted) playMicOff();
    else playMicOn();
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
    emitVoiceState({ channelId, muted: nextMuted, deafened: nextDeafened, sharing: get().sharing });
    if (nextDeafened) playDeafen();
    else playUndeafen();
  },

  setAudioDevice: async (kind, deviceId) => {
    const saved = loadJson<SavedDevices>(DEVICES_KEY, savedDevices);
    const nextSaved =
      kind === 'audioinput' ? { ...saved, micId: deviceId } : { ...saved, outputId: deviceId };
    saveJson(DEVICES_KEY, nextSaved);
    set(kind === 'audioinput' ? { micDeviceId: deviceId } : { outputDeviceId: deviceId });
    if (room) await room.switchActiveDevice(kind, deviceId);
  },

  /** Выбор камеры общий на всё приложение: звонки в личке берут его же */
  setCameraDevice: async (deviceId) => {
    saveJson(DEVICES_KEY, {
      ...loadJson<SavedDevices>(DEVICES_KEY, savedDevices),
      cameraId: deviceId,
    });
    set({ cameraDeviceId: deviceId });
    if (room) await room.switchActiveDevice('videoinput', deviceId).catch(() => undefined);
  },

  setParticipantVolume: (userId, volume) => {
    const volumes = { ...get().participantVolumes, [userId]: volume };
    saveJson(VOLUMES_KEY, volumes);
    set({ participantVolumes: volumes });
    room?.remoteParticipants.get(userId)?.setVolume(volume);
  },

  /** Подавление шума меняется на лету: дорожка пересоздаётся с новой настройкой */
  toggleNoiseSuppression: async () => {
    const next = !noiseSuppression();
    try {
      await applyNoiseSuppression(next);
      set({ noiseOn: next, error: null });
    } catch (error) {
      // Молча глотать нельзя: сломанный микрофон выглядел бы как загадка
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  /** Камера в канале — то же самое, что в звонке: устройство берём из настроек */
  toggleCamera: async () => {
    const { cameraOn, cameraDeviceId } = get();
    if (!room) return;
    const next = !cameraOn;
    try {
      await room.localParticipant.setCameraEnabled(
        next,
        cameraDeviceId ? { deviceId: cameraDeviceId } : undefined,
      );
      localCameraTrack =
        (room.localParticipant.getTrackPublication(Track.Source.Camera)?.track as
          LocalVideoTrack | undefined) ?? null;
      set((s) => ({ cameraOn: next, videoVersion: s.videoVersion + 1 }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  toggleScreenShare: async (options) => {
    const { channelId, sharing } = get();
    if (!room || !channelId) return;
    const next = options ?? get().shareOptions;
    if (options) {
      saveJson(SHARE_KEY, options);
      set({ shareOptions: options });
    }
    try {
      const publication = await room.localParticipant.setScreenShareEnabled(!sharing, {
        audio: next.audio,
        /* Звук системы браузер предлагает, только если его явно попросить.
           Поставить галочку за человека нельзя — это его решение, окно выбора
           рисует браузер. Мы лишь делаем так, чтобы галочка вообще была. */
        systemAudio: next.audio ? 'include' : 'exclude',
        // Можно переключить показываемое окно, не начиная заново
        surfaceSwitching: 'include',
        resolution: { width: next.width, height: next.height, frameRate: next.frameRate },
      });
      if (sharing) {
        localScreenTrack = null;
        playShareStop();
        announceSharing(false);
        set({ shareAudioMissing: false });
        set((s) => ({
          sharing: false,
          watching: s.watching === SELF_SCREEN ? (s.screenSharers[0] ?? null) : s.watching,
        }));
      } else {
        localScreenTrack = (publication?.videoTrack as LocalVideoTrack | undefined) ?? null;
        // Звучит только если человек действительно выбрал экран, а не закрыл диалог
        if (publication) playShareStart();
        announceSharing(Boolean(publication));
        /* Просили звук, а его нет — значит галочку в окне браузера не
           поставили. Молчать нельзя: человек будет думать, что звук идёт. */
        const withAudio = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
        set({ shareAudioMissing: Boolean(publication) && next.audio && !withAudio });
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
  sharing: boolean;
} {
  const { channelId, muted, deafened, sharing } = useVoiceStore.getState();
  return { channelId, muted, deafened, sharing };
}
