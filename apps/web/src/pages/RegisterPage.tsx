import { registerSchema, type RegistrationInviteCheckDto } from '@voxa/shared';
import { Check, Eye, EyeOff, KeyRound, Sparkles, UserRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router';

import { register } from '../api/auth';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';
import AuthShield from '../components/AuthShield';

/**
 * Насколько пароль крепкий. Считаем по длине и разнообразию знаков —
 * этого хватает, чтобы отговорить от «12345678», и не требует словарей.
 */
function passwordStrength(value: string): { score: number; label: string; tone: string } {
  if (!value) return { score: 0, label: '', tone: '' };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^\w\s]/.test(value)) score += 1;
  if (score <= 1) return { score: 1, label: 'слабый', tone: 'weak' };
  if (score === 2) return { score: 2, label: 'средний', tone: 'mid' };
  if (score === 3) return { score: 3, label: 'хороший', tone: 'ok' };
  return { score: 4, label: 'крепкий', tone: 'ok' };
}

/** Регистрация в приложении по коду, который выдал владелец приложения. */
export default function RegisterPage() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const { code } = useParams<{ code: string }>();

  const [inviteCode, setInviteCode] = useState(code ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [repeat, setRepeat] = useState('');

  /* Логин уникален, и узнать это надо до отправки: иначе человек заполнит
     всю форму и получит отказ на последнем шаге. Спрашиваем с задержкой,
     чтобы не бить в сервер на каждую букву. */
  const [checkName, setCheckName] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setCheckName(username.trim()), 400);
    return () => clearTimeout(timer);
  }, [username]);

  const { data: nameCheck } = useQuery({
    queryKey: ['usernameAvailable', checkName],
    queryFn: () => api<{ available: boolean }>(`/auth/username-available/${checkName}`),
    enabled: checkName.length >= 3,
  });

  // Код из ссылки проверяем сразу — сообщаем, если он недействителен
  const { data: codeCheck } = useQuery({
    queryKey: ['registrationCheck', code],
    queryFn: () => api<RegistrationInviteCheckDto>(`/auth/registration-invites/check/${code}`),
    enabled: Boolean(code) && status !== 'authed',
  });

  if (status === 'authed') return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const parsed = registerSchema.safeParse({ inviteCode, username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('auth.genericError'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await register(parsed.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const points = [
    { name: t('auth.regShield1'), rest: t('auth.regShield1Rest') },
    { name: t('auth.regShield2'), rest: t('auth.regShield2Rest') },
    { name: t('auth.regShield3'), rest: t('auth.regShield3Rest') },
  ];

  // Код из ссылки уже проверен сервером — показываем это, а не молчим
  const nameFree = checkName.length >= 3 && nameCheck?.available === true;
  const nameTaken = checkName.length >= 3 && nameCheck?.available === false;
  const mismatch = repeat.length > 0 && repeat !== password;
  const strength = passwordStrength(password);

  const codeOk = Boolean(code) && codeCheck?.valid === true;
  const codeBad = Boolean(code) && codeCheck?.valid === false;

  return (
    <div className="auth-screen">
      <AuthShield
        title={t('auth.regHeroTitle')}
        accent={t('auth.regHeroAccent')}
        lead={t('auth.regHeroLead')}
        points={points}
      />

      <div className="auth-right">
        <form className="auth-card" onSubmit={(e) => void onSubmit(e)}>
          <h2>{t('auth.registerTitle')}</h2>
          <p className="auth-card-hint">{t('auth.regHint')}</p>

          <label>
            <span className="auth-label-row">
              {t('auth.registrationCode')}
              {codeOk && (
                <span className="auth-ok">
                  <Check size={13} /> {t('auth.codeAccepted')}
                </span>
              )}
            </span>
            <span className={`auth-field${codeOk ? ' ok' : ''}`}>
              <Sparkles size={15} />
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoFocus={!code}
              />
              {codeOk && <Check size={15} className="auth-field-ok" />}
            </span>
          </label>

          {codeBad && (
            <p className="auth-error auth-error-box">
              <span className="auth-error-mark" aria-hidden>
                !
              </span>
              {t('auth.codeInvalid')}
            </p>
          )}

          <label>
            <span className="auth-label-row">
              {t('auth.username')}
              {nameFree && (
                <span className="auth-ok">
                  <Check size={13} /> {t('auth.usernameFree')}
                </span>
              )}
              {nameTaken && <span className="auth-bad">{t('auth.usernameTaken')}</span>}
            </span>
            <span className={`auth-field${nameFree ? ' ok' : ''}${nameTaken ? ' bad' : ''}`}>
              <UserRound size={15} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus={Boolean(code)}
              />
              {nameFree && <Check size={15} className="auth-field-ok" />}
            </span>
            <span className="auth-field-hint">{t('auth.usernameFixed')}</span>
          </label>

          <label>
            <span className="auth-label-row">
              {t('auth.password')}
              {password && (
                <span className={`auth-strength ${strength.tone}`}>{strength.label}</span>
              )}
            </span>

            <span className="auth-pass-pair">
              <span className="auth-field">
                <KeyRound size={15} />
                <input
                  type={shown ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={t('auth.passwordNew')}
                />
                <button
                  type="button"
                  className="auth-eye"
                  title={t(shown ? 'auth.hidePassword' : 'auth.showPassword')}
                  onClick={() => setShown((on) => !on)}
                >
                  {shown ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>

              <span className={`auth-field${mismatch ? ' bad' : ''}`}>
                <KeyRound size={15} />
                <input
                  type={shown ? 'text' : 'password'}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  autoComplete="new-password"
                  placeholder={t('auth.passwordRepeat')}
                />
              </span>
            </span>

            {/* Полоска из отрезков: видно, докуда дотянул, а не просто «слабый» */}
            <span className="auth-bars">
              {[0, 1, 2, 3].map((i) => (
                <i key={i} className={i < strength.score ? strength.tone : ''} />
              ))}
            </span>

            <span className="auth-field-hint">
              {mismatch ? t('auth.passwordMismatch') : t('auth.passwordPairHint')}
            </span>
          </label>

          {error && (
            <p className="auth-error auth-error-box">
              <span className="auth-error-mark" aria-hidden>
                !
              </span>
              {error}
            </p>
          )}

          <button
            className="btn-primary auth-submit"
            type="submit"
            disabled={busy || nameTaken || repeat !== password}
          >
            {busy ? t('auth.working') : t('auth.registerButton')}
          </button>

          <p className="auth-switch">
            {t('auth.haveAccount')} <Link to="/login">{t('auth.loginLink')}</Link>
          </p>
        </form>
      </div>

      <p className="auth-rights">{t('auth.rights')}</p>
    </div>
  );
}
