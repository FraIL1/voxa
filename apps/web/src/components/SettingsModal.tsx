import { changePasswordSchema, updateProfileSchema, type MeDto } from '@voxa/shared';
import {
  Check,
  Eye,
  LogOut,
  Monitor,
  Palette,
  Command,
  Info,
  Music,
  Search,
  Trash2,
  Upload,
  UserRound,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { logout } from '../api/auth';
import { api, ApiError } from '../api/client';
import { getAutostart, isTauri, setAutostart } from '../lib/tauri';
import { useAuthStore } from '../stores/auth';
import { useDensityStore, type Density } from '../stores/density';
import { useSkinStore, type Skin } from '../stores/skin';
import { useThemeStore, type ThemeMode } from '../stores/theme';
import AudioDeviceSelects from './AudioDeviceSelects';
import Avatar from './Avatar';
import { AboutTab, HotkeysTab, SoundsTab } from './SettingsTabs';
import VoiceLiveCheck from './VoiceLiveCheck';

type Tab = 'profile' | 'appearance' | 'voice' | 'sounds' | 'hotkeys' | 'about' | 'app';

/** Палитра акцента профиля: свои оттенки, не фирменные цвета чужих мессенджеров */
const ACCENTS = [
  '#22d3ee',
  '#2dd4bf',
  '#34d399',
  '#a855f7',
  '#f472b6',
  '#fb7185',
  '#fbbf24',
  '#38bdf8',
] as const;

const SKINS: Skin[] = ['flow', 'classic'];

const DENSITIES: Density[] = ['cozy', 'compact'];

const THEMES: ThemeMode[] = ['dark', 'light', 'auto'];

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

/** Полноэкранные настройки: профиль, оформление, звук, выход из аккаунта */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const density = useDensityStore((s) => s.density);
  const setDensity = useDensityStore((s) => s.setDensity);
  const skin = useSkinStore((s) => s.skin);
  const setSkin = useSkinStore((s) => s.setSkin);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const [tab, setTab] = useState<Tab>('profile');

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [statusText, setStatusText] = useState(user?.statusText ?? '');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  /* Разделы сгруппированы так же, как на эскизе: сначала про себя,
     потом про приложение, в конце редкое и опасное. */
  const groups: {
    id: string;
    label: string;
    items: {
      key: string;
      label: string;
      icon: LucideIcon;
      danger?: boolean;
      action?: () => void;
    }[];
  }[] = [
    {
      id: 'account',
      label: t('settings.groupAccount'),
      items: [{ key: 'profile', label: t('settings.profile'), icon: UserRound }],
    },
    {
      id: 'app',
      label: t('settings.groupApp'),
      items: [
        { key: 'voice', label: t('settings.voiceTab'), icon: Video },
        { key: 'appearance', label: t('settings.appearanceTab'), icon: Palette },
        { key: 'sounds', label: t('settings.soundsTab'), icon: Music },
        { key: 'hotkeys', label: t('settings.hotkeysTab'), icon: Command },
        ...(isTauri()
          ? [{ key: 'app', label: t('settings.appTab'), icon: Monitor as LucideIcon }]
          : []),
      ],
    },
    {
      id: 'other',
      label: t('settings.groupOther'),
      items: [
        { key: 'about', label: t('settings.about'), icon: Info },
        {
          key: 'logout',
          label: t('settings.logout'),
          icon: LogOut,
          danger: true,
          action: () => void logout(),
        },
      ],
    },
  ];

  const matches = (name: string): boolean =>
    !query.trim() || name.toLowerCase().includes(query.trim().toLowerCase());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /** Сохранение профиля: имя и рассказ о себе идут вместе */
  const saveProfile = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setProfileMessage('');
    const parsed = updateProfileSchema.safeParse({ displayName, bio });
    if (!parsed.success) {
      setProfileError(parsed.error.issues[0]?.message ?? t('auth.genericError'));
      return;
    }
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

  /** Аватар уходит на сервер сразу после выбора файла */
  const pickAvatar = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileError('');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      setUser(await api<MeDto>('/users/me/avatar', { method: 'POST', body: form }));
    } catch (error) {
      setProfileError(error instanceof ApiError ? error.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const dropAvatar = async (): Promise<void> => {
    setBusy(true);
    try {
      setUser(await api<MeDto>('/users/me/avatar', { method: 'DELETE' }));
    } catch (error) {
      setProfileError(error instanceof ApiError ? error.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  /** Своя строчка статуса — тоже отдельным запросом, без формы профиля */
  const saveStatusText = async (): Promise<void> => {
    if ((user?.statusText ?? '') === statusText.trim()) return;
    try {
      setUser(
        await api<MeDto>('/users/me/presence', {
          method: 'PATCH',
          body: { statusText: statusText.trim() },
        }),
      );
    } catch (error) {
      setProfileError(error instanceof ApiError ? error.message : t('auth.genericError'));
    }
  };

  /** Акцент применяется сразу — это не форма, а выбор мышью */
  const pickAccent = async (color: string): Promise<void> => {
    setProfileError('');
    try {
      const me = await api<MeDto>('/users/me', {
        method: 'PATCH',
        body: { displayName: user?.displayName ?? displayName, accentColor: color },
      });
      setUser(me);
    } catch (error) {
      setProfileError(error instanceof ApiError ? error.message : t('auth.genericError'));
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
          <div className="settings-nav-title">{t('settings.title')}</div>

          <label className="settings-search">
            <Search size={15} />
            <input
              type="text"
              value={query}
              placeholder={t('settings.search')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          {groups.map(({ id, label, items }) => {
            const visible = items.filter(({ label: name }) => matches(name));
            if (visible.length === 0) return null;
            return (
              <div key={id} className="settings-nav-group">
                <div className="settings-nav-group-name">{label}</div>
                {visible.map(({ key, label: name, icon: Icon, danger, action }) => (
                  <button
                    key={key}
                    className={`settings-tab${tab === key ? ' active' : ''}${danger ? ' danger' : ''}`}
                    onClick={action ?? (() => setTab(key as Tab))}
                  >
                    <Icon size={17} />
                    {name}
                  </button>
                ))}
              </div>
            );
          })}

          <div className="settings-nav-spacer" />
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
              <div className="avatar-row">
                <Avatar
                  name={user?.displayName ?? '?'}
                  url={user?.avatarUrl}
                  className="settings-avatar"
                />
                <div className="avatar-actions">
                  <label className="btn-secondary icon-upload">
                    <Upload size={15} /> {t('settings.changeAvatar')}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif"
                      hidden
                      onChange={(e) => void pickAvatar(e)}
                    />
                  </label>
                  {user?.avatarUrl && (
                    <button
                      type="button"
                      className="btn-secondary danger-text"
                      disabled={busy}
                      onClick={() => void dropAvatar()}
                    >
                      <Trash2 size={15} /> {t('settings.removeAvatar')}
                    </button>
                  )}
                  <p className="settings-hint">{t('settings.avatarHint')}</p>
                </div>
              </div>

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
                <label>
                  {t('settings.bio')}
                  <textarea
                    value={bio}
                    rows={3}
                    maxLength={190}
                    placeholder={t('settings.bioPlaceholder')}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </label>
                <p className="settings-hint">
                  {t('settings.bioLeft', { count: 190 - bio.length })}
                </p>
                <label>
                  {t('settings.statusText')}
                  <input
                    value={statusText}
                    maxLength={60}
                    placeholder={t('settings.statusTextPlaceholder')}
                    onChange={(e) => setStatusText(e.target.value)}
                    onBlur={() => void saveStatusText()}
                  />
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

          {tab === 'appearance' && (
            <>
              <h2>{t('settings.appearanceTab')}</h2>
              <div className="settings-form">
                <label>{t('settings.skin')}</label>
                <div className="skin-choices">
                  {SKINS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`skin-choice${skin === value ? ' active' : ''}`}
                      onClick={() => setSkin(value)}
                    >
                      <span className={`skin-preview ${value}`} aria-hidden>
                        <i className="glow" />
                        <i className="rail" />
                        <i className="side" />
                        <i className="main" />
                      </span>
                      <span className="theme-choice-label">{t(`settings.skin_${value}`)}</span>
                    </button>
                  ))}
                </div>
                <p className="settings-hint">{t('settings.skinHint')}</p>

                <label>{t('settings.density')}</label>
                <div className="skin-choices">
                  {DENSITIES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`skin-choice${density === value ? ' active' : ''}`}
                      onClick={() => setDensity(value)}
                    >
                      <span className={`density-preview ${value}`} aria-hidden>
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="theme-choice-label">{t(`settings.density_${value}`)}</span>
                    </button>
                  ))}
                </div>
                <p className="settings-hint">{t('settings.densityHint')}</p>

                <label>{t('settings.theme')}</label>
                <div className="theme-choices">
                  {THEMES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`theme-choice${themeMode === mode ? ' active' : ''}`}
                      onClick={() => setThemeMode(mode)}
                    >
                      <span className={`theme-preview ${mode}`} aria-hidden>
                        <i className="rail" />
                        <i className="side" />
                        <i className="main" />
                      </span>
                      <span className="theme-choice-label">{t(`settings.theme_${mode}`)}</span>
                    </button>
                  ))}
                </div>
                <p className="settings-hint">{t('settings.themeHint')}</p>

                <label>{t('settings.accent')}</label>
                <div className="accent-swatches">
                  <button
                    type="button"
                    className={`accent-swatch reset${user?.accentColor ? '' : ' active'}`}
                    title={t('settings.accentDefault')}
                    onClick={() => void pickAccent('')}
                  >
                    ✕
                  </button>
                  {ACCENTS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`accent-swatch${user?.accentColor === color ? ' active' : ''}`}
                      style={{ background: color }}
                      title={color}
                      onClick={() => void pickAccent(color)}
                    >
                      {user?.accentColor === color && <Check size={14} color="#04121a" />}
                    </button>
                  ))}
                </div>
                <p className="settings-hint">{t('settings.accentHint')}</p>
              </div>
            </>
          )}

          {tab === 'voice' && (
            <>
              <h2>{t('settings.voiceTab')}</h2>
              <div className="settings-form voice-form">
                <AudioDeviceSelects />
              </div>
            </>
          )}

          {tab === 'sounds' && <SoundsTab />}
          {tab === 'hotkeys' && <HotkeysTab />}
          {tab === 'about' && <AboutTab />}
          {tab === 'app' && <AppTab />}
        </div>

        {/* Третья колонка: результат виден сразу, не надо закрывать настройки ради проверки */}
        {tab === 'profile' && (
          <aside className="settings-aside">
            <div className="settings-aside-head">
              <Eye size={16} />
              <div>
                <b>{t('settings.previewProfileTitle')}</b>
                <span>{t('settings.previewProfileHint')}</span>
              </div>
            </div>

            <div
              className="preview-profile"
              style={
                user?.accentColor
                  ? ({ '--preview-accent': user.accentColor } as React.CSSProperties)
                  : undefined
              }
            >
              <div className="preview-profile-top" />
              <Avatar
                name={displayName || (user?.displayName ?? 'Я')}
                url={user?.avatarUrl}
                className="preview-profile-avatar"
              />
              <div className="preview-profile-body">
                <div className="preview-profile-name">
                  {displayName || (user?.displayName ?? 'Я')}
                </div>
                <div className="preview-profile-login">@{user?.username}</div>
                {statusText.trim() && (
                  <div className="preview-profile-status">{statusText.trim()}</div>
                )}
                <p className={`preview-profile-bio${bio.trim() ? '' : ' empty'}`}>
                  {bio.trim() || t('settings.previewNoBio')}
                </p>
              </div>
            </div>
          </aside>
        )}

        {tab === 'voice' && (
          <aside className="settings-aside">
            <div className="settings-aside-head">
              <Eye size={16} />
              <div>
                <b>{t('settings.previewVoiceTitle')}</b>
                <span>{t('settings.previewVoiceHint')}</span>
              </div>
            </div>
            <VoiceLiveCheck />
          </aside>
        )}

        {tab === 'appearance' && (
          <aside className="settings-aside">
            <div className="settings-aside-head">
              <Eye size={16} />
              <div>
                <b>{t('settings.previewTitle')}</b>
                <span>{t('settings.previewHint')}</span>
              </div>
            </div>

            <div className="preview-chat">
              <div className="preview-msg">
                <Avatar name="Кирилл" className="preview-avatar" />
                <div>
                  <div className="preview-msg-meta">
                    <b>Кирилл</b>
                    <i>14:02</i>
                  </div>
                  <p>{t('settings.previewMsgOne')}</p>
                </div>
              </div>
              <div className="preview-msg">
                <Avatar
                  name={user?.displayName ?? 'Я'}
                  url={user?.avatarUrl}
                  className="preview-avatar"
                />
                <div>
                  <div className="preview-msg-meta">
                    <b style={user?.accentColor ? { color: user.accentColor } : undefined}>
                      {user?.displayName ?? 'Я'}
                    </b>
                    <i>14:03</i>
                  </div>
                  <p>{t('settings.previewMsgTwo')}</p>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
