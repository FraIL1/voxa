import type { SupportKind } from '@voxa/shared';
import { LifeBuoy, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useSendSupportTicket } from '../hooks/useSupport';
import { isTauri } from '../lib/tauri';
import Select from './Select';

const KINDS: SupportKind[] = ['PROBLEM', 'BUG', 'IDEA'];

/** Сколько знаков просит сервер — говорим об этом заранее, а не после отправки */
const MIN_LENGTH = 20;

/**
 * Раздел «Поддержка»: человек описывает поломку, обращение уходит владельцу
 * приложения. Версия и система прикладываются сами — без них половину
 * сообщений «у меня не работает» невозможно разобрать.
 */
export default function SupportTab() {
  const { t } = useTranslation();
  const send = useSendSupportTicket();
  const [kind, setKind] = useState<SupportKind>('PROBLEM');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const short = message.trim().length < MIN_LENGTH;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setError('');
    send.mutate(
      {
        kind,
        message: message.trim(),
        appVersion: '0.1.0',
        platform: isTauri() ? 'desktop' : 'web',
      },
      {
        onSuccess: () => {
          setMessage('');
          setDone(true);
        },
        onError: (err: Error) => setError(err.message),
      },
    );
  };

  return (
    <>
      <h2>{t('support.title')}</h2>
      <p className="settings-hint">{t('support.hint')}</p>

      <form className="settings-form support-form" onSubmit={submit}>
        <label>
          {t('support.kind')}
          <Select
            value={kind}
            options={KINDS.map((value) => ({ value, label: t(`support.${value}`) }))}
            onChange={(value) => setKind(value as SupportKind)}
          />
        </label>

        <label>
          {t('support.message')}
          <textarea
            className="support-message"
            rows={8}
            maxLength={4000}
            value={message}
            placeholder={t('support.placeholder')}
            onChange={(e) => {
              setMessage(e.target.value);
              setDone(false);
            }}
          />
        </label>

        <p className="settings-hint">
          <LifeBuoy size={13} /> {t('support.attached')}
        </p>

        {error && <p className="auth-error">{error}</p>}
        {done && <p className="settings-ok">{t('support.sent')}</p>}

        <button className="btn-primary support-send" disabled={short || send.isPending}>
          <Send size={15} />
          {t('support.send')}
        </button>
      </form>
    </>
  );
}
