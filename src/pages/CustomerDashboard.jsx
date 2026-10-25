import { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, ShoppingCart, CreditCard, LogOut, Bell, User, Info, MapPinned, Radio } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  apiGetOrders, apiUpdateUser, apiAcceptTerms, apiGetNotifications,
  apiMarkNotificationRead, apiMarkAllNotificationsRead, apiGetRiderLocation, apiGetRiderRoute,
} from '../api';
import RequestServicePage from './RequestServicePage';
import { TermsModal, TermsGate, TERMS_VERSION } from '../components/TermsContent';
import { CARTO_ATTRIBUTION, cartoVoyagerUrl } from '../lib/mapTiles';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});
const riderIcon = L.divIcon({
  className: 'aguadoc-rider-marker',
  html: `<div style="background:#16a34a;color:white;font-size:15px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);">🛵</div>`,
  iconSize: [30, 30], iconAnchor: [15, 15],
});
const homeIcon = L.divIcon({
  className: 'aguadoc-home-marker',
  html: `<div style="background:#0ea5c9;color:white;font-size:15px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);">🏠</div>`,
  iconSize: [30, 30], iconAnchor: [15, 15],
});
const RIDER_STALE_MS = 2 * 60 * 1000;

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = (points || []).filter((p) => p?.[0] != null && p?.[1] != null);
    if (valid.length >= 2) map.fitBounds(valid, { padding: [40, 40], maxZoom: 16 });
    else if (valid.length === 1) map.setView(valid[0], 15);
  }, [points, map]);
  return null;
}

function RecenterOnRider({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.panTo([lat, lng], { animate: true });
  }, [lat, lng, map]);
  return null;
}

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',       id: 'dashboard' },
  { icon: ShoppingCart,    label: 'Request Service', id: 'request'   },
  { icon: ShoppingCart,    label: 'My Order',        id: 'orders'    },
  { icon: CreditCard,      label: 'Billing History', id: 'billing'   },
  { icon: User,            label: 'Edit Profile',    id: 'profile'   },
];

const STATUS_STYLE = {
  Pending:            'bg-yellow-50 text-yellow-600',
  Assigned:           'bg-indigo-50 text-indigo-600',
  Accepted:           'bg-sky-50 text-sky-600',
  Processing:         'bg-blue-50 text-blue-600',
  'Out for Delivery': 'bg-emerald-50 text-emerald-600',
  Active:             'bg-blue-50 text-blue-600',
  Ready:              'bg-green-50 text-green-600',
  Delivered:          'bg-gray-100 text-gray-500',
};

export default function CustomerDashboard({ user, onLogout, onUpdateUser }) {
  const [active, setActive]   = useState('dashboard');
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs]        = useState(false);
  const [showTerms, setShowTerms]          = useState(false); // the ⓘ reminder
  const [acceptingTerms, setAcceptingTerms] = useState(false);
  const [checkoutBanner, setCheckoutBanner] = useState(null); // { type: 'success'|'cancel', text }
  const [trackingOrderId, setTrackingOrderId] = useState(null); // which order's live map is expanded
  const [rider, setRider] = useState(null); // { lat, lng, updatedAt } | null
  const [trackRoute, setTrackRoute] = useState([]); // [lat,lng][]

  // Edit Profile state
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    email:    user?.email    || '',
    phone:    user?.phone    || '',
    address:  user?.address  || '',
  });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileMsg, setProfileMsg]   = useState(null); // { type: 'success'|'error', text }
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    apiGetOrders(user.id)
      .then(data => { setOrders(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user.id]);

  // Handle the return trip from Xendit's hosted checkout page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;

    setCheckoutBanner(
      checkout === 'success'
        ? { type: 'success', text: 'Payment received! Your delivery order is confirmed.' }
        : { type: 'cancel',  text: 'Payment was not completed. Your order was not placed — feel free to try again.' }
    );
    setActive('orders'); // jump to where they can see the result
    window.history.replaceState({}, '', window.location.pathname); // clean the URL
    apiGetOrders(user.id).then(data => setOrders(Array.isArray(data) ? data : [])); // pick up the now-paid order
  }, [user.id]);

  useEffect(() => {
    const loadNotifs = () => {
      apiGetNotifications('customer', user.id)
        .then(data => setNotifications(Array.isArray(data) ? data : []))
        .catch(() => {});
    };
    loadNotifs();
    const interval = setInterval(loadNotifs, 15000); // check every 15s for new ones
    return () => clearInterval(interval);
  }, [user.id]);

  const outForDeliveryOrders = useMemo(
    () => orders.filter((o) => o.status === 'Out for Delivery' && o.type !== 'Walk-in / Pickup'),
    [orders]
  );

  // Auto-open live map when an order is out for delivery
  useEffect(() => {
    if (!outForDeliveryOrders.length) return;
    setTrackingOrderId((prev) => {
      if (prev && outForDeliveryOrders.some((o) => o.id === prev)) return prev;
      return outForDeliveryOrders[0].id;
    });
  }, [outForDeliveryOrders]);

  // Poll rider GPS while the live map is open
  useEffect(() => {
    if (!trackingOrderId) return;
    const loadRider = () => apiGetRiderLocation().then(setRider).catch(() => {});
    loadRider();
    const interval = setInterval(loadRider, 4000);
    return () => clearInterval(interval);
  }, [trackingOrderId]);

  // Draw route from rider → customer drop-off
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const order = orders.find((o) => o.id === trackingOrderId);
      if (!order?.lat || !order?.lng || rider?.lat == null || rider?.lng == null) {
        setTrackRoute([]);
        return;
      }
      const data = await apiGetRiderRoute(rider.lat, rider.lng, order.lat, order.lng);
      if (cancelled || data.success === false) return;
      setTrackRoute((data.geometry || []).map(([lng, lat]) => [lat, lng]));
    }
    run().catch(() => setTrackRoute([]));
    return () => { cancelled = true; };
  }, [trackingOrderId, rider?.lat, rider?.lng, orders]);

  const unreadCount = notifications.filter(n => !n.read).length;

  async function handleMarkNotifRead(n) {
    if (n.read) return;
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: 1 } : x)); // instant feedback
    try { await apiMarkNotificationRead(n.id); } catch { /* next poll will retry */ }
  }

  async function handleMarkAllNotifsRead() {
    setNotifications(prev => prev.map(x => ({ ...x, read: 1 })));
    try { await apiMarkAllNotificationsRead('customer', user.id); } catch { /* next poll will retry */ }
  }

  function timeAgo(dateStr) {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const stats = {
    total:     orders.length,
    active:    orders.filter(o => o.status === 'Active' || o.status === 'Pending').length,
    ready:     orders.filter(o => o.status === 'Ready').length,
    delivered: orders.filter(o => o.status === 'Delivered').length,
  };

  const STATS = [
    { emoji: '📋', label: 'TOTAL ORDER',     key: 'total'     },
    { emoji: '⏳', label: 'ACTIVE SERVICES', key: 'active'    },
    { emoji: '✅', label: 'READY',           key: 'ready'     },
    { emoji: '🏁', label: 'DELIVERED',       key: 'delivered' },
  ];

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileMsg(null);

    if (pwForm.newPassword && pwForm.newPassword !== pwForm.confirmPassword) {
      setProfileMsg({ type: 'error', text: 'New password and confirm password do not match.' });
      return;
    }
    if (pwForm.newPassword && !pwForm.currentPassword) {
      setProfileMsg({ type: 'error', text: 'Please enter your current password to set a new one.' });
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await apiUpdateUser(user.id, {
        fullName: profileForm.fullName,
        email:    profileForm.email,
        phone:    profileForm.phone,
        address:  profileForm.address,
        currentPassword: pwForm.newPassword ? pwForm.currentPassword : undefined,
        newPassword:     pwForm.newPassword || undefined,
      });

      if (updated?.success === false) {
        setProfileMsg({ type: 'error', text: updated.message || 'Failed to update profile.' });
      } else {
        onUpdateUser?.({ ...user, ...updated });
        setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setProfileMsg({ type: 'success', text: 'Profile updated successfully!' });
      }
    } catch {
      setProfileMsg({ type: 'error', text: 'Something went wrong. Please try again.' });
    } finally {
      setProfileSaving(false);
    }
  }

  const initials  = (user?.username || user?.fullName || 'U').slice(0, 1).toUpperCase();
  const firstName = (user?.fullName || user?.username || 'User').split(' ')[0];
  const recentOrders = [...orders].reverse().slice(0, 10);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">

      {/* Accounts created before the credit terms existed must accept them once */}
      {!user?.termsAcceptedAt && (
        <TermsGate
          loading={acceptingTerms}
          onDecline={onLogout}
          onAccept={async () => {
            setAcceptingTerms(true);
            try {
              const res = await apiAcceptTerms(user.id, TERMS_VERSION);
              onUpdateUser?.({ ...user, termsAcceptedAt: res.termsAcceptedAt, termsVersion: res.termsVersion });
            } catch {
              alert('Could not save your agreement. Please try again.');
            } finally {
              setAcceptingTerms(false);
            }
          }}
        />
      )}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}

      {/* Sidebar (desktop/tablet only — mobile uses the bottom nav bar instead) */}
      <aside className="agua-dark-mesh hidden w-60 shrink-0 flex-col px-4 py-6 md:flex">
        <div className="mb-8 px-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-600 text-lg shadow-lg shadow-cyan-500/30">
              💧
            </div>
            <div>
              <p className="font-display text-lg font-bold tracking-tight text-white">AguaDoc</p>
              <p className="text-[11px] text-white/45">Customer portal</p>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ icon: Icon, label, id }) => (
            <button key={id} type="button" onClick={() => setActive(id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition
                ${active === id
                  ? 'bg-gradient-to-r from-cyan-400/25 to-teal-500/10 text-cyan-100 ring-1 ring-cyan-300/25'
                  : 'text-white/55 hover:bg-white/8 hover:text-white'}`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          onClick={onLogout}
          className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/50 transition hover:bg-rose-500/15 hover:text-rose-200"
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Topbar */}
        <header className="relative flex items-center gap-2 border-b border-slate-200/70 bg-white/75 px-3 py-3 backdrop-blur-xl sm:gap-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200/80 bg-foam/80 px-3 py-2 sm:max-w-sm sm:px-4">
            <span className="shrink-0 text-sm text-slate-400">🔍</span>
            <input placeholder="Search orders…" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400" />
          </div>
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            title="Terms & Agreement (credit / utang)"
            className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-accent"
          >
            <Info size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowNotifs((v) => !v)}
            className="relative shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-ink"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 md:hidden"
          >
            <LogOut size={18} />
          </button>

          {showNotifs && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowNotifs(false)} />
              <div className="absolute right-3 top-14 z-20 w-[90vw] max-w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:right-6">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                  <span className="text-[13px] font-bold">Notifications</span>
                  {unreadCount > 0 && (
                    <button type="button" onClick={handleMarkAllNotifsRead} className="text-[11.5px] font-semibold text-accent2 hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">No notifications yet.</div>
                  ) : notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleMarkNotifRead(n)}
                      className={`cursor-pointer border-b border-slate-50 px-4 py-2.5 last:border-b-0 hover:bg-slate-50
                        ${n.read ? '' : 'bg-cyan-50/70'}`}
                    >
                      <p className="text-[12.5px] text-slate-700">{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </header>

        {/* Content */}
        <main className="agua-mesh flex-1 space-y-5 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">

          {checkoutBanner && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between
              ${checkoutBanner.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
              <span>{checkoutBanner.type === 'success' ? '✅' : '⚠️'} {checkoutBanner.text}</span>
              <button onClick={() => setCheckoutBanner(null)} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
            </div>
          )}

          {/* ── Request Service Page ── */}
          {active === 'request' && (
            <RequestServicePage
              user={user}
              onOrderPlaced={() => {
                apiGetOrders(user.id).then(data => setOrders(Array.isArray(data) ? data : []));
                setActive('dashboard');
              }}
            />
          )}

          {/* ── Dashboard Page ── */}
          {active === 'dashboard' && (
            <>
              {outForDeliveryOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActive('orders');
                    setTrackingOrderId(outForDeliveryOrders[0].id);
                  }}
                  className="w-full text-left rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 px-5 py-4 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
                      <Radio size={20} className="animate-pulse" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-emerald-900">Rider is on the way</p>
                      <p className="text-sm text-emerald-700/80 truncate">
                        {outForDeliveryOrders[0].ref || 'Your order'} is out for delivery — tap to open the live map
                      </p>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">
                      <MapPinned size={14} /> Live map
                    </span>
                  </div>
                </button>
              )}

              {/* Welcome banner */}
              <div className="agua-dark-mesh flex flex-col gap-4 rounded-[1.5rem] px-5 py-6 shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div className="agua-fade-up">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">Customer dashboard</p>
                  <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-white">Good day, {firstName}</h2>
                  <p className="mt-1 text-sm text-white/55">Your orders, deliveries, and account in one place.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 text-sm font-bold text-white shadow-lg shadow-cyan-500/30">
                    {initials}
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-semibold text-white">{user?.username || user?.fullName}</p>
                    <p className="truncate text-xs text-white/45">{user?.email}</p>
                  </div>
                  <button type="button" onClick={onLogout}
                    className="ml-2 hidden shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white sm:flex">
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                {STATS.map(({ emoji, label, key }) => (
                  <div key={key} className="agua-card px-5 py-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="mb-3 text-2xl">{emoji}</div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                    <p className="mt-1 font-display text-2xl font-bold text-ink">
                      {loading ? '…' : stats[key]}
                    </p>
                  </div>
                ))}
              </div>

              {/* Recent Activity */}
              <div className="agua-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#0f172a]">Recent Service & Order Activity</h3>
                  <button
                    onClick={() => setActive('orders')}
                    className="text-xs text-[#0ea5c9] border border-[#0ea5c9] px-3 py-1 rounded-lg hover:bg-[#0ea5c9] hover:text-white transition">
                    View All
                  </button>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-100">
                      <th className="text-left pb-2 font-semibold">REF #</th>
                      <th className="text-left pb-2 font-semibold">TYPE</th>
                      <th className="text-left pb-2 font-semibold">DATE</th>
                      <th className="text-left pb-2 font-semibold">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} className="text-center text-gray-400 py-8">Loading...</td></tr>
                    ) : recentOrders.length === 0 ? (
                      <tr><td colSpan={4} className="text-center text-gray-400 py-8">No activity yet...</td></tr>
                    ) : recentOrders.map(order => (
                      <tr key={order.id} className="border-b border-gray-50">
                        <td className="py-2 text-gray-700 font-mono text-xs">{order.ref || order.id}</td>
                        <td className="py-2 text-gray-700">{order.type}</td>
                        <td className="py-2 text-gray-500">{new Date(order.date).toLocaleDateString()}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[order.status] || 'bg-gray-100 text-gray-500'}`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}

          {/* ── My Orders Page ── */}
          {active === 'orders' && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0f172a]">My Orders</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Track all your orders and their current status.</p>
                </div>
                <button
                  onClick={() => setActive('request')}
                  className="bg-[#0ea5c9] hover:bg-[#0284a8] text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                >
                  + New Order
                </button>
              </div>

              {loading ? (
                <div className="agua-card p-10 text-center text-gray-400">Loading...</div>
              ) : orders.length === 0 ? (
                <div className="agua-card p-10 text-center">
                  <div className="text-4xl mb-3">📦</div>
                  <p className="text-gray-500 font-medium">No orders yet</p>
                  <p className="text-gray-400 text-sm mt-1">Place your first order to get started.</p>
                  <button
                    onClick={() => setActive('request')}
                    className="mt-4 bg-[#0ea5c9] hover:bg-[#0284a8] text-white text-sm font-semibold px-5 py-2 rounded-xl transition"
                  >
                    Request Service
                  </button>
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto space-y-4 pr-1">
                {[...orders].reverse().map(order => {
                  const isWalkin = order.type === 'Walk-in / Pickup';

                  // Define steps based on order type
                  const steps = isWalkin
                    ? ['Pending', 'Processing', 'Ready to Go']
                    : ['Pending', 'Assigned', 'Out for Delivery', 'Delivered'];

                  const stepIndex = {
                    'Pending':            0,
                    'Assigned':           1,
                    'Accepted':           1,
                    'Processing':         1,
                    'Active':             1,
                    'Out for Delivery':   2,
                    'Ready':              2,
                    'Ready to Go':        2,
                    'Delivered':           3,
                  };

                  const currentStep = stepIndex[order.status] ?? 0;
                  const isOutForDelivery = order.status === 'Out for Delivery';
                  const canTrackLive = !isWalkin && (
                    isOutForDelivery ||
                    ['Assigned', 'Accepted', 'Processing'].includes(order.status)
                  );

                  const STEP_ICON = isWalkin
                    ? ['🕐', '⚙️', '✅']
                    : ['🕐', '🛵', '🚚', '✅'];

                  const statusColor = {
                    'Pending':            'bg-yellow-100 text-yellow-700',
                    'Assigned':           'bg-indigo-100 text-indigo-700',
                    'Accepted':           'bg-sky-100 text-sky-700',
                    'Processing':         'bg-blue-100 text-blue-700',
                    'Active':             'bg-blue-100 text-blue-700',
                    'Out for Delivery':   'bg-emerald-100 text-emerald-700',
                    'Ready':              'bg-green-100 text-green-700',
                    'Ready to Go':        'bg-green-100 text-green-700',
                    'Delivered':           'bg-gray-100 text-gray-500',
                  };

                  return (
                    <div key={order.id} className="agua-card p-5">
                      {/* Order header */}
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-[#0f172a]">
                              {order.ref || order.id}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor[order.status] || 'bg-gray-100 text-gray-500'}`}>
                              {order.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span>{order.type}</span>
                            <span>•</span>
                            <span>{order.quantity} gallon{order.quantity > 1 ? 's' : ''}</span>
                            <span>•</span>
                            <span>{new Date(order.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-[#0ea5c9]">₱{order.total}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {isWalkin ? 'Pay on arrival' : order.payMethod || 'Online payment'}
                          </p>
                        </div>
                      </div>

                      {/* Status tracker */}
                      <div className="flex items-center">
                        {steps.map((label, i) => {
                          const done   = currentStep > i;
                          const active = currentStep === i;
                          return (
                            <div key={i} className="flex items-center flex-1 last:flex-none">
                              <div className="flex flex-col items-center">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base border-2 transition
                                  ${done    ? 'bg-[#0ea5c9] border-[#0ea5c9]'
                                  : active  ? 'bg-white border-[#0ea5c9]'
                                           : 'bg-white border-gray-200'}`}>
                                  {done ? (
                                    <span className="text-white text-sm">✓</span>
                                  ) : (
                                    <span className={active ? '' : 'grayscale opacity-40'}>
                                      {STEP_ICON[i]}
                                    </span>
                                  )}
                                </div>
                                <span className={`text-xs mt-1.5 font-semibold text-center leading-tight
                                  ${done ? 'text-[#0ea5c9]' : active ? 'text-[#0f172a]' : 'text-gray-300'}`}>
                                  {label}
                                </span>
                              </div>
                              {i < steps.length - 1 && (
                                <div className={`flex-1 h-0.5 mx-2 mb-5 rounded ${done ? 'bg-[#0ea5c9]' : 'bg-gray-200'}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Address/notes if delivery */}
                      {!isWalkin && order.address && (
                        <div className="mt-3 pt-3 border-t border-gray-100 flex items-start gap-2 text-xs text-gray-400">
                          <span>📍</span>
                          <span>{order.address}</span>
                        </div>
                      )}

                      {/* Live rider map — featured when Out for Delivery */}
                      {canTrackLive && (
                        <div className={`mt-3 pt-3 border-t ${isOutForDelivery ? 'border-emerald-100' : 'border-gray-100'}`}>
                          {isOutForDelivery ? (
                            <button
                              type="button"
                              onClick={() => setTrackingOrderId(trackingOrderId === order.id ? null : order.id)}
                              className="w-full flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-white shadow-md shadow-emerald-500/25"
                            >
                              <span className="flex items-center gap-2 text-sm font-bold">
                                <Radio size={16} className="animate-pulse" />
                                {trackingOrderId === order.id ? 'Hide live map' : 'View live rider map'}
                              </span>
                              <MapPinned size={18} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setTrackingOrderId(trackingOrderId === order.id ? null : order.id)}
                              className="text-xs font-semibold text-[#0ea5c9] hover:underline"
                            >
                              {trackingOrderId === order.id ? '▲ Hide map' : '🛵 Preview delivery map'}
                            </button>
                          )}

                          {trackingOrderId === order.id && (
                            (() => {
                              const riderIsLive = rider?.lat != null && rider?.updatedAt &&
                                (Date.now() - new Date(rider.updatedAt).getTime()) < RIDER_STALE_MS;
                              const homePos = order.lat != null && order.lng != null
                                ? [Number(order.lat), Number(order.lng)]
                                : null;
                              const riderPos = riderIsLive ? [rider.lat, rider.lng] : null;
                              const center = riderPos || homePos || [10.3157, 123.9740];
                              return (
                                <div className="mt-3">
                                  <div className={`h-64 sm:h-72 rounded-xl overflow-hidden border ${
                                    isOutForDelivery ? 'border-emerald-200 shadow-lg shadow-emerald-500/10' : 'border-gray-200'
                                  }`}>
                                    <MapContainer
                                      key={`track-${order.id}`}
                                      center={center}
                                      zoom={14}
                                      style={{ height: '100%', width: '100%' }}
                                    >
                                      <TileLayer attribution={CARTO_ATTRIBUTION} url={cartoVoyagerUrl()} />
                                      <FitBounds points={[riderPos, homePos]} />
                                      {riderPos && <RecenterOnRider lat={riderPos[0]} lng={riderPos[1]} />}
                                      {homePos && (
                                        <Marker position={homePos} icon={homeIcon}>
                                          <Popup>Your delivery address</Popup>
                                        </Marker>
                                      )}
                                      {riderPos && (
                                        <Marker position={riderPos} icon={riderIcon}>
                                          <Popup>Your rider (live)</Popup>
                                        </Marker>
                                      )}
                                      {trackRoute.length > 1 && (
                                        <Polyline
                                          positions={trackRoute}
                                          pathOptions={{ color: '#0ea5c9', weight: 5, opacity: 0.85 }}
                                        />
                                      )}
                                    </MapContainer>
                                  </div>
                                  <div className={`mt-2 flex items-center justify-center gap-2 text-xs font-medium ${
                                    riderIsLive ? 'text-emerald-600' : 'text-amber-600'
                                  }`}>
                                    <span className={`inline-block h-2 w-2 rounded-full ${
                                      riderIsLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                                    }`} />
                                    {riderIsLive
                                      ? 'Live rider location updating…'
                                      : isOutForDelivery
                                        ? 'Waiting for rider to share GPS…'
                                        : 'Map shows your drop-off. Live rider appears when delivery starts.'}
                                  </div>
                                </div>
                              );
                            })()
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              )}
            </div>
          )}
          
          {/* ── Billing History ── */}
          {active === 'billing' && (
            <div className="agua-card p-5">
              <h3 className="font-semibold text-[#0f172a] mb-4">Billing History</h3>
              <p className="text-gray-400 text-sm text-center py-8">No billing records yet...</p>
            </div>
          )}

          {/* ── Edit Profile ── */}
          {active === 'profile' && (
            <div className="max-w-xl space-y-5">
              {/* Profile header card */}
              <div className="agua-card p-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#0ea5c9] flex items-center justify-center text-white font-bold text-xl shrink-0">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-[#0f172a]">{user?.fullName || user?.username}</p>
                  <p className="text-gray-400 text-sm">@{user?.username}</p>
                </div>
              </div>

              <form onSubmit={handleProfileSave} className="agua-card p-5 space-y-4">
                <h3 className="font-semibold text-[#0f172a]">Profile Information</h3>

                {profileMsg && (
                  <div className={`text-sm rounded-lg px-3 py-2 ${
                    profileMsg.type === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-600 border border-red-200'
                  }`}>
                    {profileMsg.text}
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-gray-500">Full Name</label>
                  <input
                    value={profileForm.fullName}
                    onChange={e => setProfileForm(f => ({ ...f, fullName: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0ea5c9]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500">Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0ea5c9]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500">Phone</label>
                  <input
                    value={profileForm.phone}
                    onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0ea5c9]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500">Address</label>
                  <input
                    value={profileForm.address}
                    onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0ea5c9]"
                  />
                </div>

                <hr className="border-gray-100" />

                <h3 className="font-semibold text-[#0f172a]">Change Password</h3>
                <p className="text-xs text-gray-400 -mt-2">Leave blank if you don't want to change your password.</p>

                <div>
                  <label className="text-xs font-semibold text-gray-500">Current Password</label>
                  <input
                    type="password"
                    value={pwForm.currentPassword}
                    onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0ea5c9]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500">New Password</label>
                    <input
                      type="password"
                      value={pwForm.newPassword}
                      onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0ea5c9]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Confirm New Password</label>
                    <input
                      type="password"
                      value={pwForm.confirmPassword}
                      onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0ea5c9]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={profileSaving}
                  className="bg-[#0ea5c9] hover:bg-[#0284a8] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
                >
                  {profileSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>
          )}
        </main>

        {/* Bottom nav (mobile/tablet only — desktop uses the sidebar instead) */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t border-slate-200/80 bg-white/90 backdrop-blur-xl md:hidden">
          {NAV.map(({ icon: Icon, label, id }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold transition
                ${active === id ? 'text-accent2' : 'text-slate-400'}`}
            >
              <span className={`rounded-xl p-1.5 ${active === id ? 'bg-cyan-50 text-accent2' : ''}`}>
                <Icon size={18} />
              </span>
              <span className="text-center leading-none">{label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}