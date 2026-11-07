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
      <div className="border-b border-white/10 px-4 py-5">
        <div className="flex items-center gap-3">
          <BrandMark iconOnly size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-tight text-white">AquaDoc</p>
            <p className="text-[11px] font-medium text-slate-400">Station Manager</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[13px] font-medium transition ${
                isActive
                  ? 'bg-[#2563EB] text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              }`
            }
          >
            <Icon size={17} className="shrink-0" strokeWidth={2} />
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
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={15} /> Sign out
        </button>
        <p className="px-1 text-center text-[10px] font-medium tracking-wide text-slate-500">
          AquaDoc v2.9 • Enterprise
        </p>
      </div>
    </aside>
  );
}
