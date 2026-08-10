import { useQuery } from '@tanstack/react-query';
import type { UserPublicDto } from '@voxa/shared';
import { PhoneCall } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { api } from '../api/client';
import { useCallStore } from '../stores/call';
import Avatar from './Avatar';

/**
 * «Здесь идёт разговор» — плашка для беседы, в которой уже говорят, а ты
 * ещё нет. Без неё присоединиться можно было бы только по звонку, и
 * опоздавший оставался за дверью.
 */
export default function OngoingCallBanner({
  conversationId,
  title,
}: {
  conversationId: string;
  title: string;
}) {
  const { t } = useTranslation();
  const status = useCallStore((s) => s.status);
  const activeConversation = useCallStore((s) => s.conversationId);
  const ongoing = useCallStore((s) => s.ongoing[conversationId]);
  const joinCall = useCallStore((s) => s.joinCall);

  // При открытии диалога состояние приходит запросом, дальше — по WS
  const { data } = useQuery({
    queryKey: ['dmCall', conversationId],
    queryFn: () =>
      api<{ participants: UserPublicDto[] }>(`/dm/conversations/${conversationId}/call`),
    staleTime: 15_000,
  });

  const participants = ongoing ?? data?.participants ?? [];
  const inThisCall = activeConversation === conversationId && status !== 'idle';
  if (participants.length === 0 || inThisCall) return null;

  return (
    <div className="ongoing-call">
      <PhoneCall size={16} />
      <div className="ongoing-call-people">
        {participants.slice(0, 5).map((p) => (
          <Avatar
            key={p.id}
            name={p.displayName}
            url={p.avatarUrl}
            className="ongoing-call-avatar"
            title={p.displayName}
          />
        ))}
      </div>
      <span className="ongoing-call-text">{t('call.ongoing', { count: participants.length })}</span>
      <button
        className="btn-primary"
        disabled={status !== 'idle'}
        onClick={() => void joinCall(conversationId, title)}
      >
        {t('call.join')}
      </button>
    </div>
  );
}
