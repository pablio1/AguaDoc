import { useNavigate } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function Topbar() {
  const navigate = useNavigate();
  const { state } = useApp();
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <header className="flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/75 px-5 backdrop-blur-xl">
      <div className="flex max-w-md flex-1 items-center gap-2 rounded-xl border border-slate-200/80 bg-foam/80 px-3 py-2">
        <Search size={15} className="text-slate-400" />
        <input
          placeholder="Search customers, orders…"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-slate-400"
        />
      </div>

      <button
        type="button"
        onClick={() => navigate('/notifications')}
        className="relative ml-auto rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-ink"
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
