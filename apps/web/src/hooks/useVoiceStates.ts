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
