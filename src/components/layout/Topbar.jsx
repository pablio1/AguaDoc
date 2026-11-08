import { useNavigate } from 'react-router-dom';
import { Bell, Menu, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import BrandMark from '../BrandMark';

export default function Topbar({ onMenuClick }) {
  const navigate = useNavigate();
  const { state } = useApp();
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur-sm sm:gap-3 sm:px-5">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-ink lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex min-w-0 items-center gap-2 lg:hidden">
        <BrandMark iconOnly size="sm" className="!h-8 !w-8" />
        <div className="min-w-0 sm:block">
          <p className="truncate text-[13px] font-bold leading-tight text-ink">AquaDoc</p>
        </div>
      </div>

      <div className="ml-auto hidden max-w-md flex-1 items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2 transition focus-within:border-blue-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/10 sm:flex lg:ml-0">
        <Search size={15} className="shrink-0 text-slate-400" />
        <input
          placeholder="Search customers, orders…"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-slate-400"
        />
      </div>

      <button
        type="button"
        onClick={() => navigate('/notifications')}
        className="relative ml-auto rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-ink sm:ml-0"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
    </header>
  );
}
