import { WsClientEvents, type VoiceStateInput } from '@voxa/shared';
import { io, type Socket } from 'socket.io-client';

/**
 * Единственный сокет приложения. Живёт на уровне модуля, чтобы к нему
 * могли обращаться и хук realtime-событий, и композер (событие typing).
 */
let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  disconnectSocket();
  socket = io('/', { auth: { token } });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function emitTyping(channelId: string): void {
  socket?.emit(WsClientEvents.Typing, { channelId });
}

export function emitVoiceState(state: VoiceStateInput): void {
  socket?.emit(WsClientEvents.VoiceState, state);
}
