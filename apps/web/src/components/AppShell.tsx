import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';

import { toggleActiveDeafen, toggleActiveMute } from '../hooks/useAudioSession';
import { useRealtime } from '../hooks/useRealtime';
import { registerGlobalShortcuts } from '../lib/tauri';
import { useAuthStore } from '../stores/auth';
import { useProfileViewStore } from '../stores/profileView';
import IncomingCallModal from './IncomingCallModal';
import ProfileModal from './ProfileCard';
import ServerRail from './ServerRail';
import TimeoutNotice from './TimeoutNotice';

export default function AppShell() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const profileUserId = useProfileViewStore((s) => s.userId);
  const closeProfile = useProfileViewStore((s) => s.close);

  useRealtime();

  // Хоткеи PRD 7.4: mute Ctrl+Shift+M, deafen Ctrl+Shift+D.
  // В окне — обычный keydown; в Tauri дополнительно глобальные (вне фокуса).
  // Управляют активной сессией: голосовым каналом или звонком в личке.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || !e.shiftKey) return;
      if (e.code === 'KeyM') {
        e.preventDefault();
        toggleActiveMute();
      } else if (e.code === 'KeyD') {
        e.preventDefault();
        toggleActiveDeafen();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    let cleanupGlobal: (() => void) | undefined;
    void registerGlobalShortcuts({
      toggleMute: toggleActiveMute,
      toggleDeafen: toggleActiveDeafen,
    }).then((cleanup) => {
      cleanupGlobal = cleanup;
    });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      cleanupGlobal?.();
    };
  }, []);

  if (status === 'loading') return <div className="splash">{t('app.loading')}</div>;
  if (status === 'guest') return <Navigate to="/login" replace />;

  return (
    <div className="app-root">
      <ServerRail />
      <Outlet />
      <TimeoutNotice />
      <IncomingCallModal />
      {profileUserId && <ProfileModal userId={profileUserId} onClose={closeProfile} />}
    </div>
  );
}
