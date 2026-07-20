import { useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';

import { useGuilds } from '../hooks/useGuilds';
import MemberList from './MemberList';
import Sidebar from './Sidebar';

/** Контекст сервера: дерево каналов + канал + участники. */
export default function ServerLayout() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data: guilds } = useGuilds();
  const navigate = useNavigate();

  // Кик/бан/выход с текущего сервера — уходим на домашний экран
  useEffect(() => {
    if (guilds && guildId && !guilds.some((g) => g.id === guildId)) {
      void navigate('/home', { replace: true });
    }
  }, [guilds, guildId, navigate]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-column">
        <Outlet />
      </main>
      <MemberList />
    </div>
  );
}
