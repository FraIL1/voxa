import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';

import { toggleActiveDeafen, toggleActiveMute } from '../hooks/useAudioSession';
import { useIdleWatch } from '../hooks/useIdleWatch';
import { useRealtime } from '../hooks/useRealtime';
import { registerGlobalShortcuts } from '../lib/tauri';
import { useAuthStore } from '../stores/auth';
import { useProfileViewStore } from '../stores/profileView';
import CallDock from './CallDock';
import IncomingCallModal from './IncomingCallModal';
import ProfileModal from './ProfileCard';
import QuickSwitcher from './QuickSwitcher';
import ServerRail from './ServerRail';
import Splash from './Splash';
import TimeoutNotice from './TimeoutNotice';

export default function AppShell() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const profileUserId = useProfileViewStore((s) => s.userId);
  const closeProfile = useProfileViewStore((s) => s.close);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useRealtime();
  useIdleWatch();

  // Хоткеи PRD 7.4: mute Ctrl+Shift+M, deafen Ctrl+Shift+D.
  // В окне — обычный keydown; в Tauri дополнительно глобальные (вне фокуса).
  // Управляют активной сессией: голосовым каналом или звонком в личке.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Ctrl+K — быстрый переход; работает и без Shift
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyK') {
        e.preventDefault();
        setSwitcherOpen((v) => !v);
        return;
      }
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

  if (status === 'loading') return <Splash hint={t('app.loading')} />;
  if (status === 'guest') return <Navigate to="/login" replace />;

  return (
    <div className="app-root">
      {/* Подложка облика «Призма»: сетка и отсвет. В классическом виде скрыта */}
      <div className="app-backdrop" aria-hidden />
      <ServerRail />
      <Outlet />
      <TimeoutNotice />
      <CallDock />
      <IncomingCallModal />
      {profileUserId && <ProfileModal userId={profileUserId} onClose={closeProfile} />}
      {switcherOpen && <QuickSwitcher onClose={() => setSwitcherOpen(false)} />}
    </div>
  );
}
