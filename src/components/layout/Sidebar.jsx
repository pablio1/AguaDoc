import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, Map, CreditCard,
  Droplets, BarChart3, Bell, Sparkles, LogOut, MessageSquareText, X,
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
  { path: '/sms', icon: MessageSquareText, label: 'SMS Module' },
  { path: '/payments', icon: CreditCard, label: 'Payments & Billing' },
  { path: '/notifications', icon: Bell, label: 'Notifications' },
  { path: '/predictions', icon: Sparkles, label: 'AI Predictions' },
];

export default function Sidebar({ onLogout, open = false, onClose }) {
  const { state } = useApp();
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(248px,86vw)] flex-col bg-[#0f172a] text-white shadow-2xl transition-transform duration-300 ease-out lg:static lg:z-auto lg:h-screen lg:w-[248px] lg:min-w-[248px] lg:translate-x-0 lg:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-white/10 px-4 py-5">
          <div className="flex items-center gap-3">
            <BrandMark iconOnly size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold leading-tight text-white">AquaDoc</p>
              <p className="text-[11px] font-medium text-slate-400">Station Manager</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              onClick={onClose}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[13px] font-medium transition ${
                  isActive
                    ? 'bg-[#2563EB] text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                }`
              }
            >
              <Icon size={17} className="shrink-0" strokeWidth={2} />
              <span className="flex-1 truncate">{label}</span>
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
    </>
  );
}
