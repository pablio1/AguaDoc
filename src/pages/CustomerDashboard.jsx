import { useState, useEffect } from 'react';
import { LayoutDashboard, ShoppingCart, CreditCard, LogOut, Bell, User, Info } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGetOrders, apiUpdateUser, apiAcceptTerms, apiGetNotifications, apiMarkNotificationRead, apiMarkAllNotificationsRead, apiGetRiderLocation } from '../api';
import RequestServicePage from './RequestServicePage';
import { TermsModal, TermsGate, TERMS_VERSION } from '../components/TermsContent';

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

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',       id: 'dashboard' },
  { icon: ShoppingCart,    label: 'Request Service', id: 'request'   },
  { icon: ShoppingCart,    label: 'My Order',        id: 'orders'    },
  { icon: CreditCard,      label: 'Billing History', id: 'billing'   },
  { icon: User,            label: 'Edit Profile',    id: 'profile'   },
];

const STATUS_STYLE = {
  Pending:            'bg-yellow-50 text-yellow-600',
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

  // Only poll the rider's live position while a delivery is actually being tracked.
  useEffect(() => {
    if (!trackingOrderId) return;
    const loadRider = () => apiGetRiderLocation().then(setRider).catch(() => {});
    loadRider();
    const interval = setInterval(loadRider, 5000);
    return () => clearInterval(interval);
  }, [trackingOrderId]);

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
    <div className="flex h-screen bg-[#f0f6fb] overflow-hidden">

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
      <aside className="hidden md:flex w-52 bg-[#0f2a4a] flex-col py-6 px-4 shrink-0">
        <div className="flex items-center gap-2 mb-10 px-1">
          <div className="w-8 h-8 bg-[#0ea5c9] rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">💧</span>
          </div>
          <span className="text-white font-bold text-base">AguaDoc.</span>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map(({ icon: Icon, label, id }) => (
            <button key={id} onClick={() => setActive(id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition text-left
                ${active === id ? 'bg-[#0ea5c9] text-white' : 'text-gray-300 hover:bg-white/10'}`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>

        {/* Sign Out pinned to bottom of sidebar */}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-red-500/20 hover:text-red-400 transition mt-2"
        >
          <LogOut size={16} /> Sign Out
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="relative bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 flex-1 bg-gray-50 rounded-xl px-3 sm:px-4 py-2 min-w-0 sm:max-w-sm">
            <span className="text-gray-400 text-sm shrink-0">🔍</span>
            <input placeholder="Search orders..." className="bg-transparent text-sm outline-none flex-1 min-w-0 text-gray-500" />
          </div>
          <button
            onClick={() => setShowTerms(true)}
            title="Terms & Agreement (credit / utang)"
            className="text-gray-400 hover:text-[#0ea5c9] shrink-0"
          >
            <Info size={20} />
          </button>
          <button
            onClick={() => setShowNotifs(v => !v)}
            className="relative text-gray-400 hover:text-gray-600 shrink-0"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          {/* Sidebar is hidden on mobile, so its Sign Out button needs a stand-in here */}
          <button
            onClick={onLogout}
            className="md:hidden shrink-0 text-gray-400 hover:text-red-500"
          >
            <LogOut size={20} />
          </button>

          {showNotifs && (
            <>
              {/* click-away backdrop */}
              <div className="fixed inset-0 z-10" onClick={() => setShowNotifs(false)} />
              <div className="absolute right-3 sm:right-6 top-14 w-[90vw] max-w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                  <span className="text-[13px] font-bold">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllNotifsRead} className="text-[11.5px] text-[#0ea5c9] font-semibold hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="text-center text-gray-400 text-xs py-6">No notifications yet.</div>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => handleMarkNotifRead(n)}
                      className={`px-4 py-2.5 border-b border-gray-50 last:border-b-0 cursor-pointer hover:bg-gray-50
                        ${n.read ? '' : 'bg-blue-50'}`}
                    >
                      <p className="text-[12.5px] text-gray-700">{n.message}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-24 md:pb-6">

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
              {/* Welcome banner */}
              <div className="bg-[#0f2a4a] rounded-2xl px-5 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-white text-lg font-semibold">Good day, {firstName}! 👋</h2>
                  <p className="text-gray-400 text-sm mt-0.5">Here's a summary of your interactions and orders.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#0ea5c9] flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {initials}
                  </div>
                  <div className="text-sm min-w-0">
                    <p className="text-white font-medium truncate">{user?.username || user?.fullName}</p>
                    <p className="text-gray-400 text-xs truncate">{user?.email}</p>
                  </div>
                  {/* Hidden on mobile — the header already has a Sign Out icon there */}
                  <button onClick={onLogout}
                    className="hidden sm:flex items-center gap-1.5 text-gray-300 hover:text-white text-sm ml-4 border border-white/20 rounded-lg px-3 py-1.5 transition shrink-0">
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {STATS.map(({ emoji, label, key }) => (
                  <div key={key} className="bg-white rounded-2xl px-5 py-5 shadow-sm">
                    <div className="text-2xl mb-3">{emoji}</div>
                    <p className="text-xs text-gray-400 font-semibold tracking-wide">{label}</p>
                    <p className="text-2xl font-bold text-[#0f172a] mt-1">
                      {loading ? '...' : stats[key]}
                    </p>
                  </div>
                ))}
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-2xl shadow-sm p-5">
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
                <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Loading...</div>
              ) : orders.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
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
                    : ['Pending', 'Processing', 'Delivered'];

                  const stepIndex = {
                    'Pending':     0,
                    'Processing':  1,
                    'Active':      1,
                    'Ready':       2,
                    'Ready to Go': 2,
                    'Delivered':   2,
                  };

                  const currentStep = stepIndex[order.status] ?? 0;

                  const STEP_ICON = isWalkin
                    ? ['🕐', '⚙️', '✅']
                    : ['🕐', '⚙️', '🚚'];

                  const statusColor = {
                    'Pending':     'bg-yellow-100 text-yellow-700',
                    'Processing':  'bg-blue-100 text-blue-700',
                    'Active':      'bg-blue-100 text-blue-700',
                    'Ready':       'bg-green-100 text-green-700',
                    'Ready to Go': 'bg-green-100 text-green-700',
                    'Delivered':   'bg-gray-100 text-gray-500',
                  };

                  return (
                    <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
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

                      {/* Live delivery tracking — only offered once the order is actually out for delivery */}
                      {!isWalkin && ['Accepted', 'Processing', 'Out for Delivery'].includes(order.status) && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => setTrackingOrderId(trackingOrderId === order.id ? null : order.id)}
                            className="text-xs font-semibold text-[#0ea5c9] hover:underline"
                          >
                            {trackingOrderId === order.id ? '▲ Hide map' : '🛵 Track my delivery'}
                          </button>

                          {trackingOrderId === order.id && (
                            (() => {
                              const riderIsLive = rider?.lat != null && rider?.updatedAt &&
                                (Date.now() - new Date(rider.updatedAt).getTime()) < RIDER_STALE_MS;
                              const homePos = order.lat != null && order.lng != null ? [order.lat, order.lng] : null;
                              const center = riderIsLive ? [rider.lat, rider.lng] : homePos || [10.3157, 123.9740];
                              return (
                                <div className="mt-2">
                                  <div className="h-52 rounded-xl overflow-hidden border border-gray-200">
                                    <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }}>
                                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                      {homePos && (
                                        <Marker position={homePos} icon={homeIcon}><Popup>Your delivery address</Popup></Marker>
                                      )}
                                      {riderIsLive && (
                                        <Marker position={[rider.lat, rider.lng]} icon={riderIcon}><Popup>Your rider</Popup></Marker>
                                      )}
                                    </MapContainer>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1.5 text-center">
                                    {riderIsLive ? '📡 Live location' : 'Waiting for rider to start sharing their location...'}
                                  </p>
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
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-semibold text-[#0f172a] mb-4">Billing History</h3>
              <p className="text-gray-400 text-sm text-center py-8">No billing records yet...</p>
            </div>
          )}

          {/* ── Edit Profile ── */}
          {active === 'profile' && (
            <div className="max-w-xl space-y-5">
              {/* Profile header card */}
              <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#0ea5c9] flex items-center justify-center text-white font-bold text-xl shrink-0">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-[#0f172a]">{user?.fullName || user?.username}</p>
                  <p className="text-gray-400 text-sm">@{user?.username}</p>
                </div>
              </div>

              <form onSubmit={handleProfileSave} className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-stretch z-30">
          {NAV.map(({ icon: Icon, label, id }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium
                ${active === id ? 'text-[#0ea5c9]' : 'text-gray-400'}`}
            >
              <Icon size={18} />
              <span className="leading-none text-center">{label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}