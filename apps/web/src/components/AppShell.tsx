import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';

import {
  answerIncoming,
  declineIncoming,
  leaveActive,
  toggleActiveCamera,
  toggleActiveDeafen,
  toggleActiveMute,
  toggleActiveShare,
} from '../hooks/useAudioSession';
import { useIdleWatch } from '../hooks/useIdleWatch';
import { useRealtime } from '../hooks/useRealtime';
import { registerGlobalShortcuts } from '../lib/tauri';
import { useAuthStore } from '../stores/auth';
import { comboAccelerator, matchesCombo, useHotkeysStore } from '../stores/hotkeys';
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
      const { binds } = useHotkeysStore.getState();
      if (matchesCombo(binds.switcher, e)) {
        e.preventDefault();
        setSwitcherOpen((v) => !v);
      } else if (matchesCombo(binds.mute, e)) {
        e.preventDefault();
        toggleActiveMute();
      } else if (matchesCombo(binds.deafen, e)) {
        e.preventDefault();
        toggleActiveDeafen();
      } else if (matchesCombo(binds.leaveVoice, e)) {
        e.preventDefault();
        leaveActive();
      } else if (matchesCombo(binds.camera, e)) {
        e.preventDefault();
        toggleActiveCamera();
      } else if (matchesCombo(binds.share, e)) {
        e.preventDefault();
        toggleActiveShare();
      } else if (matchesCombo(binds.answer, e)) {
        e.preventDefault();
        answerIncoming();
      } else if (matchesCombo(binds.decline, e)) {
        e.preventDefault();
        declineIncoming();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    let cleanupGlobal: (() => void) | undefined;
    const { binds } = useHotkeysStore.getState();
    const global = [
      { combo: binds.mute, run: toggleActiveMute },
      { combo: binds.deafen, run: toggleActiveDeafen },
      { combo: binds.leaveVoice, run: leaveActive },
      { combo: binds.camera, run: toggleActiveCamera },
      { combo: binds.share, run: toggleActiveShare },
      { combo: binds.answer, run: answerIncoming },
      { combo: binds.decline, run: declineIncoming },
    ]
      .map(({ combo, run }) => ({ accelerator: comboAccelerator(combo), run }))
      .filter((b): b is { accelerator: string; run: () => void } => b.accelerator !== null);

    void registerGlobalShortcuts(global).then((cleanup) => {
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
