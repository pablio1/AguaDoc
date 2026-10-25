import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Toast from '../ui/Toast';

export default function AppLayout({ children, onLogout }) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg font-sans text-sm text-ink">
      <Sidebar onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="agua-mesh flex-1 overflow-y-auto p-5">
          <div className="agua-fade-up mx-auto max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>
      <Toast />
    </div>
  );
}
