import { useQuery } from '@tanstack/react-query';
import type { ChannelDto, CommunityStructureDto } from '@voxa/shared';

import { api } from '../api/client';

export function useStructure() {
  return useQuery({
    queryKey: ['structure'],
    queryFn: () => api<CommunityStructureDto>('/channels'),
    staleTime: 60_000,
  });
}

export function allChannelsOf(structure: CommunityStructureDto | undefined): ChannelDto[] {
  if (!structure) return [];
  return [...structure.categories.flatMap((c) => c.channels), ...structure.uncategorized];
}
