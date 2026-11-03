import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, Map, CreditCard,
  Droplets, BarChart3, Bell, Sparkles, LogOut,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import BrandMark from '../BrandMark';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/reports', icon: BarChart3, label: 'Sales Report' },
  { path: '/inventory', icon: Droplets, label: 'Inventory & Stocks' },
  { path: '/customers', icon: Users, label: 'Debt Management' },
  { path: '/orders', icon: ClipboardList, label: 'Orders & Dispatch' },
  { path: '/delivery-route', icon: Map, label: 'Live Delivery Map' },
  { path: '/payments', icon: CreditCard, label: 'Payments & Billing' },
  { path: '/notifications', icon: Bell, label: 'Notifications' },
  { path: '/predictions', icon: Sparkles, label: 'AI Predictions' },
];

export default function Sidebar({ onLogout }) {
  const { state } = useApp();
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <aside className="flex h-screen w-[248px] min-w-[248px] flex-col bg-[#0f172a] text-white">
      <div className="border-b border-white/10 px-4 py-4">
        <BrandMark light size="sm" className="!max-w-[168px]" />
        <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
          Station Manager
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                isActive
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon size={16} className="shrink-0 opacity-90" />
            <span className="flex-1">{label}</span>
            {path === '/notifications' && unread > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-200"
        >
          <LogOut size={15} /> Sign out
        </button>
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-3 ring-1 ring-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-[11px] font-bold text-white">
            AD
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">Admin</p>
            <p className="truncate text-[11px] text-slate-400">Staff console</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
