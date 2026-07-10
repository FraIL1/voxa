import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';

import AppShell from './components/AppShell';
import ChannelRedirect from './components/ChannelRedirect';
import ChannelView from './components/ChannelView';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { useAuthStore } from './stores/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createBrowserRouter([
  { path: '/login', Component: LoginPage },
  { path: '/register', Component: RegisterPage },
  { path: '/invite/:code', Component: RegisterPage },
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: ChannelRedirect },
      { path: 'channels/:channelId', Component: ChannelView },
    ],
  },
]);

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
