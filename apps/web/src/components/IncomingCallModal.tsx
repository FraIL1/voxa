import { Phone, PhoneOff, Video } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { startRingtone } from '../lib/sounds';
import { useCallStore } from '../stores/call';

/** Входящий вызов: звенит и предлагает принять или отклонить */
export default function IncomingCallModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const incoming = useCallStore((s) => s.incoming);
  const accept = useCallStore((s) => s.acceptIncoming);
  const decline = useCallStore((s) => s.declineIncoming);

  // Звонок звенит, пока висит модалка
  useEffect(() => {
    if (!incoming) return;
    const stop = startRingtone();
    return stop;
  }, [incoming]);

  if (!incoming) return null;

  const name = incoming.from.displayName;

  return (
    <div className="settings-overlay">
      <div className="incoming-call">
        <div className="avatar incoming-call-avatar" aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="incoming-call-name">{name}</div>
        <div className="incoming-call-hint">
          {incoming.video ? t('call.incomingVideo') : t('call.incomingVoice')}
        </div>

        <div className="incoming-call-actions">
          <button
            className="call-button decline"
            title={t('call.decline')}
            onClick={() => void decline()}
          >
            <PhoneOff size={20} />
          </button>
          <button
            className="call-button accept"
            title={t('call.accept')}
            onClick={() => {
              const conversationId = incoming.conversationId;
              void accept(name).then(() => navigate(`/dm/${conversationId}`));
            }}
          >
            {incoming.video ? <Video size={20} /> : <Phone size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
