import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';

import { useRealtime } from '../hooks/useRealtime';
import { registerGlobalShortcuts } from '../lib/tauri';
import { useAuthStore } from '../stores/auth';
import { useVoiceStore } from '../stores/voice';
import IncomingCallModal from './IncomingCallModal';
import ServerRail from './ServerRail';
import TimeoutNotice from './TimeoutNotice';

export default function AppShell() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);

  useRealtime();

  // Хоткеи PRD 7.4: mute Ctrl+Shift+M, deafen Ctrl+Shift+D.
  // В окне — обычный keydown; в Tauri дополнительно глобальные (вне фокуса).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const voice = useVoiceStore.getState();
      if (e.code === 'KeyM') {
        e.preventDefault();
        void voice.toggleMute();
      } else if (e.code === 'KeyD') {
        e.preventDefault();
        void voice.toggleDeafen();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    let cleanupGlobal: (() => void) | undefined;
    void registerGlobalShortcuts({
      toggleMute: () => void useVoiceStore.getState().toggleMute(),
      toggleDeafen: () => void useVoiceStore.getState().toggleDeafen(),
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
    </div>
  );
}
