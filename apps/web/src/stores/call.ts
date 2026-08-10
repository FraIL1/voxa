import type {
  DmCallEndReason,
  DmCallIncomingPayload,
  UserPublicDto,
  VoiceTokenDto,
} from '@voxa/shared';
import {
  RemoteTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  type LocalVideoTrack,
  type RemoteParticipant,
} from 'livekit-client';
import { create } from 'zustand';

import { api } from '../api/client';
import { playJoinSound, playLeaveSound } from '../lib/sounds';

/** Комната звонка живёт вне стора: LiveKit-объекты не для рендера */
let room: Room | null = null;
let localVideo: LocalVideoTrack | null = null;
/** Видео участников по их id — в беседе их может быть несколько */
const remoteVideos = new Map<string, RemoteVideoTrack>();
const audioElements = new Map<string, HTMLAudioElement>();

export function remoteVideoTrack(userId: string): RemoteVideoTrack | null {
  return remoteVideos.get(userId) ?? null;
}

export function localVideoTrack(): LocalVideoTrack | null {
  return localVideo;
}

/** Приглушить/вернуть звук собеседников (режим «наушники выключены») */
function applyDeafen(deafened: boolean): void {
  for (const element of audioElements.values()) element.muted = deafened;
}

function attachAudio(track: RemoteTrack, identity: string): void {
  const element = track.attach();
  element.autoplay = true;
  audioElements.set(identity, element as HTMLAudioElement);
  document.body.appendChild(element);
}

function cleanup(): void {
  for (const element of audioElements.values()) element.remove();
  audioElements.clear();
  remoteVideos.clear();
  localVideo = null;
  room = null;
}

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'active';

interface CallState {
  status: CallStatus;
  /** Диалог, в котором идёт звонок */
  conversationId: string | null;
  /** Данные входящего вызова (для модалки) */
  incoming: DmCallIncomingPayload | null;
  /** Заголовок разговора: имя собеседника или название беседы */
  peerName: string;
  /** Аватар собеседника (в беседе не используется) */
  peerAvatar: string | null;
  /** Разговор в беседе: участников может быть больше двух */
  isGroup: boolean;
  /** Кто сейчас в разговоре (без меня) */
  participants: UserPublicDto[];
  /** Разговоры, идущие прямо сейчас: conversationId → участники */
  ongoing: Record<string, UserPublicDto[]>;
  muted: boolean;
  /** Звук собеседника выключен (и микрофон вместе с ним, как в каналах) */
  deafened: boolean;
  cameraOn: boolean;
  /** Кто включил камеру (id участников) */
  videoUserIds: string[];
  /** Момент, когда разговор начался (для таймера длительности) */
  startedAt: number | null;
  /** Счётчик обновлений видеодорожек — чтобы компоненты перерисовались */
  videoVersion: number;
  error: string | null;
  /** Чем закончился прошлый звонок (для короткого уведомления) */
  endedReason: DmCallEndReason | null;

  startCall: (
    conversationId: string,
    peerName: string,
    video: boolean,
    peerAvatar?: string | null,
    isGroup?: boolean,
  ) => Promise<void>;
  /** Войти в идущий разговор беседы, не дожидаясь вызова */
  joinCall: (conversationId: string, title: string) => Promise<void>;
  acceptIncoming: (peerName: string) => Promise<void>;
  declineIncoming: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  /** Обработчики WS-событий */
  onIncoming: (payload: DmCallIncomingPayload) => void;
  onAccepted: () => void;
  onState: (conversationId: string, participants: UserPublicDto[]) => void;
  onEnded: (conversationId: string, reason: DmCallEndReason) => void;
  clearEndedReason: () => void;
}

/** Состояние, к которому возвращаемся после завершения разговора */
const IDLE_STATE = {
  status: 'idle' as CallStatus,
  conversationId: null,
  participants: [] as UserPublicDto[],
  videoUserIds: [] as string[],
  cameraOn: false,
  muted: false,
  deafened: false,
  startedAt: null,
};

export const useCallStore = create<CallState>()((set, get) => ({
  status: 'idle',
  conversationId: null,
  incoming: null,
  peerName: '',
  peerAvatar: null,
  isGroup: false,
  participants: [],
  ongoing: {},
  muted: false,
  deafened: false,
  cameraOn: false,
  videoUserIds: [],
  startedAt: null,
  videoVersion: 0,
  error: null,
  endedReason: null,

  startCall: async (conversationId, peerName, video, peerAvatar = null, isGroup = false) => {
    if (get().status !== 'idle') return;
    set({
      status: 'outgoing',
      conversationId,
      peerName,
      peerAvatar,
      isGroup,
      participants: [],
      startedAt: null,
      error: null,
      endedReason: null,
    });
    try {
      const grant = await api<VoiceTokenDto>(`/dm/conversations/${conversationId}/call`, {
        method: 'POST',
        body: { video },
      });
      await connect(grant, video, set, get);
    } catch (error) {
      cleanup();
      set({
        ...IDLE_STATE,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  joinCall: async (conversationId, title) => {
    if (get().status !== 'idle') return;
    set({
      status: 'active',
      conversationId,
      peerName: title,
      peerAvatar: null,
      isGroup: true,
      startedAt: Date.now(),
      error: null,
      endedReason: null,
    });
    try {
      const grant = await api<VoiceTokenDto>(`/dm/conversations/${conversationId}/call/accept`, {
        method: 'POST',
      });
      await connect(grant, false, set, get);
    } catch (error) {
      cleanup();
      set({
        ...IDLE_STATE,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  acceptIncoming: async (peerName) => {
    const incoming = get().incoming;
    if (!incoming) return;
    const conversationId = incoming.conversationId;
    set({
      status: 'active',
      conversationId,
      peerName: incoming.isGroup ? (incoming.conversationName ?? peerName) : peerName,
      peerAvatar: incoming.from.avatarUrl,
      isGroup: incoming.isGroup,
      incoming: null,
      startedAt: Date.now(),
      error: null,
    });
    try {
      const grant = await api<VoiceTokenDto>(`/dm/conversations/${conversationId}/call/accept`, {
        method: 'POST',
      });
      await connect(grant, incoming.video, set, get);
    } catch (error) {
      cleanup();
      set({
        ...IDLE_STATE,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  declineIncoming: async () => {
    const incoming = get().incoming;
    if (!incoming) return;
    set({ incoming: null, status: 'idle' });
    await api<void>(`/dm/conversations/${incoming.conversationId}/call/decline`, {
      method: 'POST',
    }).catch(() => undefined);
  },

  hangUp: async () => {
    const conversationId = get().conversationId;
    const current = room;
    room = null;
    if (current) await current.disconnect();
    cleanup();
    set(IDLE_STATE);
    playLeaveSound();
    if (conversationId) {
      await api<void>(`/dm/conversations/${conversationId}/call/end`, { method: 'POST' }).catch(
        () => undefined,
      );
    }
  },

  toggleMute: async () => {
    const { muted, deafened } = get();
    const next = !muted;
    // Включение микрофона снимает и «наушники» — как в голосовых каналах
    const nextDeafened = next ? deafened : false;
    set({ muted: next, deafened: nextDeafened });
    applyDeafen(nextDeafened);
    await room?.localParticipant.setMicrophoneEnabled(!next).catch(() => undefined);
  },

  toggleDeafen: async () => {
    const next = !get().deafened;
    // Выключенный звук выключает и микрофон, включение — возвращает его
    set({ deafened: next, muted: next });
    applyDeafen(next);
    await room?.localParticipant.setMicrophoneEnabled(!next).catch(() => undefined);
  },

  toggleCamera: async () => {
    const next = !get().cameraOn;
    try {
      await room?.localParticipant.setCameraEnabled(next);
      localVideo =
        (room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as
          LocalVideoTrack | undefined) ?? null;
      set((s) => ({ cameraOn: next, videoVersion: s.videoVersion + 1 }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  onIncoming: (payload) => {
    // Уже в звонке — новый вызов игнорируем (сервер сам ответит «занято»)
    if (get().status !== 'idle') return;
    set({ incoming: payload, status: 'incoming', endedReason: null });
  },

  onAccepted: () => {
    if (get().status === 'outgoing') set({ status: 'active', startedAt: Date.now() });
  },

  onState: (conversationId, participants) => {
    set((s) => {
      const ongoing = { ...s.ongoing };
      if (participants.length === 0) delete ongoing[conversationId];
      else ongoing[conversationId] = participants;

      // Список для экрана обновляем только для своего разговора
      return s.conversationId === conversationId ? { ongoing, participants } : { ongoing };
    });
  },

  onEnded: (conversationId, reason) => {
    const state = get();
    if (
      state.conversationId !== conversationId &&
      state.incoming?.conversationId !== conversationId
    )
      return;
    const current = room;
    room = null;
    void current?.disconnect();
    cleanup();
    set({ ...IDLE_STATE, incoming: null, endedReason: reason });
  },

  clearEndedReason: () => set({ endedReason: null }),
}));

/** Подключение к комнате разговора и подписка на дорожки участников */
async function connect(
  grant: VoiceTokenDto,
  video: boolean,
  set: (partial: Partial<CallState> | ((s: CallState) => Partial<CallState>)) => void,
  get: () => CallState,
): Promise<void> {
  const next = new Room();
  room = next;

  next.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
    if (track.kind === Track.Kind.Audio) {
      attachAudio(track, participant.identity);
      applyDeafen(get().deafened);
      return;
    }
    if (track.source === Track.Source.Camera) {
      remoteVideos.set(participant.identity, track as RemoteVideoTrack);
      set((s) => ({
        videoUserIds: [...new Set([...s.videoUserIds, participant.identity])],
        videoVersion: s.videoVersion + 1,
      }));
    }
  });

  next.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant) => {
    if (track.kind === Track.Kind.Audio) {
      track.detach().forEach((el) => el.remove());
      audioElements.delete(participant.identity);
      return;
    }
    if (track.source === Track.Source.ScreenShare || track.source === Track.Source.Camera) {
      remoteVideos.delete(participant.identity);
      set((s) => ({
        videoUserIds: s.videoUserIds.filter((id) => id !== participant.identity),
        videoVersion: s.videoVersion + 1,
      }));
    }
  });

  // Кто-то вошёл в комнату — разговор реально начался
  next.on(RoomEvent.ParticipantConnected, () => {
    if (get().status !== 'idle')
      set({ status: 'active', startedAt: get().startedAt ?? Date.now() });
    playJoinSound();
  });

  next.on(RoomEvent.Disconnected, () => {
    if (room === next) {
      cleanup();
      set(IDLE_STATE);
    }
  });

  await next.connect(grant.url, grant.token);
  // Мьют могли нажать ещё на дозвоне — подключаемся с тем состоянием,
  // которое человек выбрал, а не с микрофоном наотмашь
  const { muted, deafened } = get();
  await next.localParticipant.setMicrophoneEnabled(!muted);
  applyDeafen(deafened);
  if (video) {
    await next.localParticipant.setCameraEnabled(true).catch(() => undefined);
    localVideo =
      (next.localParticipant.getTrackPublication(Track.Source.Camera)?.track as
        LocalVideoTrack | undefined) ?? null;
  }

  // Если собеседник уже в комнате (принял быстрее) — разговор активен
  const someoneElse = next.remoteParticipants.size > 0;
  set((s) => ({
    status: someoneElse ? 'active' : s.status,
    startedAt: someoneElse ? (s.startedAt ?? Date.now()) : s.startedAt,
    cameraOn: video,
    videoVersion: s.videoVersion + 1,
  }));
}
