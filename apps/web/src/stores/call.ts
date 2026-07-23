import type { DmCallEndReason, DmCallIncomingPayload, VoiceTokenDto } from '@voxa/shared';
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
let remoteVideo: RemoteVideoTrack | null = null;
let localVideo: LocalVideoTrack | null = null;
const audioElements = new Map<string, HTMLAudioElement>();

export function remoteVideoTrack(): RemoteVideoTrack | null {
  return remoteVideo;
}

export function localVideoTrack(): LocalVideoTrack | null {
  return localVideo;
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
  remoteVideo = null;
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
  /** Имя собеседника для панели звонка */
  peerName: string;
  muted: boolean;
  cameraOn: boolean;
  /** Собеседник включил камеру */
  peerVideo: boolean;
  /** Счётчик обновлений видеодорожек — чтобы компоненты перерисовались */
  videoVersion: number;
  error: string | null;
  /** Чем закончился прошлый звонок (для короткого уведомления) */
  endedReason: DmCallEndReason | null;

  startCall: (conversationId: string, peerName: string, video: boolean) => Promise<void>;
  acceptIncoming: (peerName: string) => Promise<void>;
  declineIncoming: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  /** Обработчики WS-событий */
  onIncoming: (payload: DmCallIncomingPayload) => void;
  onAccepted: () => void;
  onEnded: (conversationId: string, reason: DmCallEndReason) => void;
  clearEndedReason: () => void;
}

export const useCallStore = create<CallState>()((set, get) => ({
  status: 'idle',
  conversationId: null,
  incoming: null,
  peerName: '',
  muted: false,
  cameraOn: false,
  peerVideo: false,
  videoVersion: 0,
  error: null,
  endedReason: null,

  startCall: async (conversationId, peerName, video) => {
    if (get().status !== 'idle') return;
    set({ status: 'outgoing', conversationId, peerName, error: null, endedReason: null });
    try {
      const grant = await api<VoiceTokenDto>(`/dm/conversations/${conversationId}/call`, {
        method: 'POST',
        body: { video },
      });
      await connect(grant, video, set, get);
    } catch (error) {
      cleanup();
      set({
        status: 'idle',
        conversationId: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  acceptIncoming: async (peerName) => {
    const incoming = get().incoming;
    if (!incoming) return;
    const conversationId = incoming.conversationId;
    set({ status: 'active', conversationId, peerName, incoming: null, error: null });
    try {
      const grant = await api<VoiceTokenDto>(`/dm/conversations/${conversationId}/call/accept`, {
        method: 'POST',
      });
      await connect(grant, incoming.video, set, get);
    } catch (error) {
      cleanup();
      set({
        status: 'idle',
        conversationId: null,
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
    set({
      status: 'idle',
      conversationId: null,
      peerVideo: false,
      cameraOn: false,
      muted: false,
    });
    playLeaveSound();
    if (conversationId) {
      await api<void>(`/dm/conversations/${conversationId}/call/end`, { method: 'POST' }).catch(
        () => undefined,
      );
    }
  },

  toggleMute: async () => {
    const next = !get().muted;
    set({ muted: next });
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
    if (get().status === 'outgoing') set({ status: 'active' });
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
    set({
      status: 'idle',
      conversationId: null,
      incoming: null,
      peerVideo: false,
      cameraOn: false,
      muted: false,
      endedReason: reason,
    });
  },

  clearEndedReason: () => set({ endedReason: null }),
}));

/** Подключение к комнате звонка и подписка на дорожки собеседника */
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
      return;
    }
    if (track.source === Track.Source.Camera) {
      remoteVideo = track as RemoteVideoTrack;
      set((s) => ({ peerVideo: true, videoVersion: s.videoVersion + 1 }));
    }
  });

  next.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) {
      track.detach().forEach((el) => el.remove());
      return;
    }
    if (track.source === Track.Source.Camera) {
      remoteVideo = null;
      set((s) => ({ peerVideo: false, videoVersion: s.videoVersion + 1 }));
    }
  });

  // Собеседник вошёл в комнату — звонок реально начался
  next.on(RoomEvent.ParticipantConnected, () => {
    if (get().status !== 'idle') set({ status: 'active' });
    playJoinSound();
  });

  next.on(RoomEvent.Disconnected, () => {
    if (room === next) {
      cleanup();
      set({ status: 'idle', conversationId: null, peerVideo: false, cameraOn: false });
    }
  });

  await next.connect(grant.url, grant.token);
  await next.localParticipant.setMicrophoneEnabled(true);
  if (video) {
    await next.localParticipant.setCameraEnabled(true).catch(() => undefined);
    localVideo =
      (next.localParticipant.getTrackPublication(Track.Source.Camera)?.track as
        LocalVideoTrack | undefined) ?? null;
  }

  // Если собеседник уже в комнате (принял быстрее) — звонок активен
  const someoneElse = next.remoteParticipants.size > 0;
  set((s) => ({
    status: someoneElse ? 'active' : s.status,
    muted: false,
    cameraOn: video,
    videoVersion: s.videoVersion + 1,
  }));
}
