import { Outlet } from 'react-router';

import MemberList from './MemberList';
import Sidebar from './Sidebar';

/** Контекст сервера (сообщества): дерево каналов + канал + участники. */
export default function ServerLayout() {
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
