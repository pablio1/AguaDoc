import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Toast from '../ui/Toast';

export default function AppLayout({ children, onLogout }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openedForPath, setOpenedForPath] = useState(null);

  // Auto-close when navigating: open only while still on the path it was opened for
  const drawerOpen = menuOpen && openedForPath === location.pathname;

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function openMenu() {
    setOpenedForPath(location.pathname);
    setMenuOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg font-sans text-sm text-ink">
      <Sidebar
        onLogout={onLogout}
        open={drawerOpen}
        onClose={closeMenu}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={openMenu} />
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#F8F9FB] p-3 sm:p-5 lg:p-6">
          <div className="agua-fade-up mx-auto w-full max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>
      <Toast />
    </div>
  );
}
