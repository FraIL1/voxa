import { changePasswordSchema, updateProfileSchema, type MeDto } from '@voxa/shared';
import { LogOut, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { logout } from '../api/auth';
import { api, ApiError } from '../api/client';
import { getAutostart, isTauri, setAutostart } from '../lib/tauri';
import { useAuthStore } from '../stores/auth';
import AudioDeviceSelects from './AudioDeviceSelects';

type Tab = 'profile' | 'voice' | 'app';

/** Вкладка «Приложение» (только в десктоп-клиенте): автозапуск */
function AppTab() {
  const { t } = useTranslation();
  const [autostart, setAutostartState] = useState(false);

  useEffect(() => {
    void getAutostart().then(setAutostartState);
  }, []);

  const toggle = (): void => {
    const next = !autostart;
    setAutostartState(next);
    void setAutostart(next);
  };

  return (
    <>
      <h2>{t('settings.appTab')}</h2>
      <label className="settings-toggle">
        <input type="checkbox" checked={autostart} onChange={toggle} />
        {t('settings.autostart')}
      </label>
      <p className="settings-hint">{t('settings.trayHint')}</p>
    </>
  );
}

/** Полноэкранные настройки: профиль (ник, пароль), звук, выход из аккаунта */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [tab, setTab] = useState<Tab>('profile');

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const saveProfile = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setProfileMessage('');
    const parsed = updateProfileSchema.safeParse({ displayName });
    if (!parsed.success) {
      setProfileError(parsed.error.issues[0]?.message ?? t('auth.genericError'));
      return;
    }
    if (parsed.data.displayName === user?.displayName) return;
    setBusy(true);
    setProfileError('');
    try {
      const me = await api<MeDto>('/users/me', { method: 'PATCH', body: parsed.data });
      setUser(me);
      setProfileMessage(t('settings.saved'));
    } catch (error) {
      setProfileError(error instanceof ApiError ? error.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setPasswordMessage('');
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? t('auth.genericError'));
      return;
    }
    setBusy(true);
    setPasswordError('');
    try {
      await api<void>('/auth/change-password', { method: 'POST', body: parsed.data });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage(t('settings.passwordChanged'));
    } catch (error) {
      setPasswordError(error instanceof ApiError ? error.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <button
            className={`settings-tab${tab === 'profile' ? ' active' : ''}`}
            onClick={() => setTab('profile')}
          >
            {t('settings.profile')}
          </button>
          <button
            className={`settings-tab${tab === 'voice' ? ' active' : ''}`}
            onClick={() => setTab('voice')}
          >
            {t('settings.voiceTab')}
          </button>
          {isTauri() && (
            <button
              className={`settings-tab${tab === 'app' ? ' active' : ''}`}
              onClick={() => setTab('app')}
            >
              {t('settings.appTab')}
            </button>
          )}
          <div className="settings-nav-spacer" />
          <button className="settings-tab danger" onClick={() => void logout()}>
            <LogOut size={15} /> {t('settings.logout')}
          </button>
        </nav>

        <div className="settings-content">
          <button
            className="icon-button settings-close"
            title={t('settings.close')}
            onClick={onClose}
          >
            <X size={20} />
          </button>

          {tab === 'profile' && (
            <>
              <h2>{t('settings.profile')}</h2>
              <form className="settings-form" onSubmit={(e) => void saveProfile(e)}>
                <label>
                  {t('settings.handle')}
                  <input value={`@${user?.username ?? ''}`} disabled readOnly />
                </label>
                <p className="settings-hint">{t('settings.handleHint')}</p>
                <label>
                  {t('settings.displayName')}
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </label>
                <p className="auth-error">{profileError}</p>
                <p className="settings-ok">{profileMessage}</p>
                <button className="btn-primary" type="submit" disabled={busy}>
                  {t('settings.save')}
                </button>
              </form>

              <h2>{t('settings.passwordTitle')}</h2>
              <form className="settings-form" onSubmit={(e) => void changePassword(e)}>
                <label>
                  {t('settings.currentPassword')}
                  <input
                    type="password"
                    value={currentPassword}
                    autoComplete="current-password"
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
                <label>
                  {t('settings.newPassword')}
                  <input
                    type="password"
                    value={newPassword}
                    autoComplete="new-password"
                    placeholder={t('auth.passwordHint')}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <p className="auth-error">{passwordError}</p>
                <p className="settings-ok">{passwordMessage}</p>
                <button className="btn-primary" type="submit" disabled={busy}>
                  {t('settings.changePassword')}
                </button>
              </form>
            </>
          )}

          {tab === 'voice' && (
            <>
              <h2>{t('settings.voiceTab')}</h2>
              <div className="settings-form">
                <AudioDeviceSelects />
              </div>
            </>
          )}

          {tab === 'app' && <AppTab />}
        </div>
      </div>
    </div>
  );
}
