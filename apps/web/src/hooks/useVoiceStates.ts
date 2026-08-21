import { useQuery } from '@tanstack/react-query';
import type { VoiceChannelStateDto, VoiceParticipantDto } from '@voxa/shared';

import { api } from '../api/client';

export const VOICE_STATES_KEY = ['voiceStates'] as const;

export function useVoiceStates() {
  return useQuery({
    queryKey: VOICE_STATES_KEY,
    queryFn: () => api<VoiceChannelStateDto[]>('/voice/states'),
    staleTime: Infinity, // актуальность держит WS-событие voice.update
  });
}

export function participantsOf(
  states: VoiceChannelStateDto[] | undefined,
  channelId: string,
): VoiceParticipantDto[] {
  return states?.find((s) => s.channelId === channelId)?.participants ?? [];
}

/**
 * В каком голосовом канале сидит человек — или null, если ни в каком.
 *
 * Сервер отдаёт только те каналы, которые нам вправе показывать, поэтому
 * достаточно поискать по этому списку: чужой сервер сюда не попадёт, и
 * «в голосовом» не покажется там, где перейти всё равно некуда.
 */
export function voiceLocationOf(
  states: VoiceChannelStateDto[] | undefined,
  userId: string | undefined,
): { channelId: string; guildId: string } | null {
  if (!userId) return null;
  for (const state of states ?? []) {
    if (!state.guildId) continue;
    if (state.participants.some((p) => p.userId === userId)) {
      return { channelId: state.channelId, guildId: state.guildId };
    }
  }
  return null;
}
