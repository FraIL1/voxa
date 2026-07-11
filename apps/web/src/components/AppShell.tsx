import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';

import { useRealtime } from '../hooks/useRealtime';
import { useAuthStore } from '../stores/auth';
import MemberList from './MemberList';
import Sidebar from './Sidebar';

export default function AppShell() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);

  useRealtime();

  if (status === 'loading') return <div className="splash">{t('app.loading')}</div>;
  if (status === 'guest') return <Navigate to="/login" replace />;

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
