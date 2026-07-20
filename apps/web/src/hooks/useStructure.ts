import { useQuery } from '@tanstack/react-query';
import type { ChannelDto, CommunityStructureDto } from '@voxa/shared';

import { api } from '../api/client';

export function useStructure(guildId: string | undefined) {
  return useQuery({
    queryKey: ['structure', guildId],
    queryFn: () => api<CommunityStructureDto>(`/guilds/${guildId}/structure`),
    staleTime: 60_000,
    enabled: Boolean(guildId),
  });
}

export function allChannelsOf(structure: CommunityStructureDto | undefined): ChannelDto[] {
  if (!structure) return [];
  return [...structure.categories.flatMap((c) => c.channels), ...structure.uncategorized];
}
