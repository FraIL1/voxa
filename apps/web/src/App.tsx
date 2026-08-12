import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';

import AppShell from './components/AppShell';
import ChannelRedirect from './components/ChannelRedirect';
import ChannelView from './components/ChannelView';
import DmView from './components/DmView';
import FriendsView from './components/FriendsView';
import HomeLayout from './components/HomeLayout';
import ServerLayout from './components/ServerLayout';
import Splash from './components/Splash';
import TitleBar from './components/TitleBar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ServerInvitePage from './pages/ServerInvitePage';
import { isTauri, revealWindow } from './lib/tauri';
import { useAuthStore } from './stores/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createBrowserRouter([
  // Корень — витрина для гостя; вошедшего она сама уводит на домашний экран
  { path: '/', Component: LandingPage },
  { path: '/login', Component: LoginPage },
  { path: '/register', Component: RegisterPage },
  { path: '/register/:code', Component: RegisterPage },
  { path: '/invite/:code', Component: ServerInvitePage },
  {
    // Безадресный слой: проверка входа и общая оболочка для всех экранов
    Component: AppShell,
    children: [
      {
        Component: HomeLayout,
        children: [
          { path: 'home', Component: FriendsView },
          { path: 'dm/:conversationId', Component: DmView },
        ],
      },
      {
        path: 'guilds/:guildId',
        Component: ServerLayout,
        children: [
          { index: true, Component: ChannelRedirect },
          { path: 'channels/:channelId', Component: ChannelView },
        ],
      },
    ],
  },
]);

/** Сколько минимум держим заставку в приложении, чтобы её было видно */
const SPLASH_MIN_MS = 1100;

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const status = useAuthStore((s) => s.status);
  // В браузере заставка ни к чему: страница и так открывается мгновенно
  const [splashHold, setSplashHold] = useState(() => isTauri());

  useEffect(() => {
    // Окно десктопа скрыто до этого момента — показываем, когда есть что рисовать
    void bootstrap().finally(() => void revealWindow());
  }, [bootstrap]);

  useEffect(() => {
    if (!splashHold) return;
    const id = window.setTimeout(() => setSplashHold(false), SPLASH_MIN_MS);
    return () => window.clearTimeout(id);
  }, [splashHold]);

  const booting = status === 'loading' || splashHold;

  return (
    <QueryClientProvider client={queryClient}>
      {/* В приложении сверху своя полоса заголовка, в браузере её нет */}
      <div className={isTauri() ? 'app-window framed' : 'app-window'}>
        <TitleBar />
        <div className="app-window-body">
          {booting ? <Splash hint="Запускаем Voxa" /> : <RouterProvider router={router} />}
        </div>
      </div>
    </QueryClientProvider>
  );
}
