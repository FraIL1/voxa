import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSupportTicketInput, SupportStatus, SupportTicketDto } from '@voxa/shared';

import { api } from '../api/client';

const TICKETS_KEY = ['support', 'tickets'];
const COUNT_KEY = ['support', 'count'];

/** Отправка обращения — доступна любому вошедшему */
export function useSendSupportTicket() {
  return useMutation({
    mutationFn: (input: CreateSupportTicketInput) =>
      api<SupportTicketDto>('/support', { method: 'POST', body: input }),
  });
}

/** Список обращений — только владельцу приложения */
export function useSupportTickets(enabled: boolean) {
  return useQuery({
    queryKey: TICKETS_KEY,
    queryFn: () => api<SupportTicketDto[]>('/instance/support'),
    enabled,
  });
}

export function useSetSupportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SupportStatus }) =>
      api<SupportTicketDto>(`/instance/support/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TICKETS_KEY });
      void queryClient.invalidateQueries({ queryKey: COUNT_KEY });
    },
  });
}

/**
 * Сколько обращений ещё не разобрано. Нужно для точки на разделе: владелец
 * видит, что кто-то написал, не открывая панель. Обновляем раз в минуту —
 * чаще ни к чему, обращения приходят редко.
 */
export function useSupportNewCount(enabled: boolean) {
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: () => api<{ newCount: number }>('/instance/support/count'),
    enabled,
    refetchInterval: 60_000,
  });
}
