import { Check, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { isTauri } from '../lib/tauri';

import Logo from './Logo';

/**
 * Левая половина входа и регистрации: знак, обещание и список того, что
 * защищено. Каждый пункт — то, что действительно работает в приложении;
 * обещаний, которых нет в коде, здесь быть не должно.
 */
export default function AuthShield({
  title,
  accent,
  lead,
  points,
}: {
  title: string;
  accent: string;
  lead: string;
  points: { name: string; rest: string }[];
}) {
  const { t } = useTranslation();

  return (
    <div className="auth-left">
      {/* Знак ведёт на приветственную страницу. В приложении её нет — там
          знак остаётся просто знаком. */}
      {isTauri() ? (
        <div className="auth-brand">
          <Logo className="auth-brand-mark" />
          <b>{t('app.name')}</b>
        </div>
      ) : (
        <Link className="auth-brand" to="/" title={t('auth.toLanding')}>
          <Logo className="auth-brand-mark" />
          <b>{t('app.name')}</b>
        </Link>
      )}

      <h1 className="auth-hero">
        {title} <em>{accent}</em>
      </h1>
      <p className="auth-lead">{lead}</p>

      <div className="auth-shield">
        <div className="auth-shield-head">
          <span className="auth-shield-mark" aria-hidden>
            <ShieldCheck size={18} />
          </span>
          <div>
            <b>{t('auth.shieldTitle')}</b>
            <span>{t('auth.shieldHint')}</span>
          </div>
        </div>

        <ul className="auth-points">
          {points.map((point) => (
            <li key={point.name}>
              <span className="auth-point-mark" aria-hidden>
                <Check size={11} />
              </span>
              <span>
                <b>{point.name}</b> {point.rest}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
