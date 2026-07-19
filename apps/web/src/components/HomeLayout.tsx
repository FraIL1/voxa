import { Outlet } from 'react-router';

import DmSidebar from './DmSidebar';

/** «Домашний» контекст: столбец диалогов + центральная область (друзья или переписка). */
export default function HomeLayout() {
  return (
    <div className="app-shell home">
      <DmSidebar />
      <main className="main-column">
        <Outlet />
      </main>
    </div>
  );
}
