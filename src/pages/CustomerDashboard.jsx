import { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, PlusCircle, Package, CreditCard, LogOut, Bell, User, Info,
  MapPinned, Radio, Search, ClipboardList, Clock, CheckCircle2, Truck, MapPin,
  Store, Cog, Bike, ChevronDown, ChevronUp,
} from 'lucide-react';
import BrandMark from '../components/BrandMark';
import GeoMap from '../components/map/GeoMap';
import {
  apiGetOrders, apiUpdateUser, apiAcceptTerms, apiGetNotifications,
  apiMarkNotificationRead, apiMarkAllNotificationsRead, apiGetRiderLocation, apiGetRiderRoute,
} from '../api';
import RequestServicePage from './RequestServicePage';
import { TermsModal, TermsGate, TERMS_VERSION } from '../components/TermsContent';
import { formatMoney } from '../lib/money';

const riderHtml = `<div style="background:#16a34a;color:white;font-size:15px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);">🛵</div>`;
const homeHtml = `<div style="background:#3b82f6;color:white;font-size:15px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);">🏠</div>`;
const RIDER_STALE_MS = 2 * 60 * 1000;

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',       id: 'dashboard', short: 'Home'      },
  { icon: PlusCircle,      label: 'Request Service', id: 'request',   short: 'Request'   },
  { icon: Package,         label: 'My Order',        id: 'orders',    short: 'Orders'    },
  { icon: CreditCard,      label: 'Billing History', id: 'billing',   short: 'Billing'   },
  { icon: User,            label: 'Edit Profile',    id: 'profile',   short: 'Profile'   },
];

const STATUS_STYLE = {
  Pending:            'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  Assigned:           'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  Accepted:           'bg-sky-50 text-sky-700 ring-1 ring-sky-100',
  Processing:         'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  'Out for Delivery': 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  Active:             'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  Ready:              'bg-green-50 text-green-700 ring-1 ring-green-100',
  'Ready to Go':      'bg-green-50 text-green-700 ring-1 ring-green-100',
  Delivered:          'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  Cancelled:          'bg-red-50 text-red-600 ring-1 ring-red-100',
};

const COMPLETED_STATUSES = new Set(['Delivered', 'Cancelled']);

function isWalkinOrder(order) {
  return order.type === 'Walk-in / Pickup' || order.type === 'Walk-in';
}

function isCompletedOrder(order) {
  return COMPLETED_STATUSES.has(order.status);
}

function orderSteps(order) {
  if (isWalkinOrder(order)) {
    return [
      { label: 'Received', icon: Clock },
      { label: 'Preparing', icon: Cog },
      { label: 'Ready', icon: Store },
    ];
  }
  return [
    { label: 'Placed', icon: Clock },
    { label: 'Assigned', icon: Bike },
    { label: 'On the way', icon: Truck },
    { label: 'Delivered', icon: CheckCircle2 },
  ];
}

function orderStepIndex(order) {
  const map = {
    Pending: 0,
    Assigned: 1,
    Accepted: 1,
    Processing: 1,
    Active: 1,
    'Out for Delivery': 2,
    Ready: 2,
    'Ready to Go': 2,
    Delivered: isWalkinOrder(order) ? 2 : 3,
    Cancelled: -1,
  };
  return map[order.status] ?? 0;
}

function formatOrderDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function OrderCard({
  order,
  completed,
  trackingOrderId,
  setTrackingOrderId,
  rider,
  trackRoute,
}) {
  const walkin = isWalkinOrder(order);
  const steps = orderSteps(order);
  const currentStep = orderStepIndex(order);
  const isOutForDelivery = order.status === 'Out for Delivery';
  const canTrackLive = !walkin && !completed && (
    isOutForDelivery ||
    ['Assigned', 'Accepted', 'Processing', 'Pending'].includes(order.status)
  );
  const tracking = trackingOrderId === order.id;
  const TypeIcon = walkin ? Store : Truck;

  return (
    <article
      className={`agua-card overflow-hidden transition ${
        isOutForDelivery ? 'ring-1 ring-emerald-200 shadow-md shadow-emerald-500/10' : ''
      }`}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
              <TypeIcon size={12} />
              {walkin ? 'Pickup' : 'Delivery'}
            </span>
            <span className={`agua-badge ${STATUS_STYLE[order.status] || 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/80'}`}>
              {order.status}
            </span>
            {isOutForDelivery && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                <Radio size={10} className="animate-pulse" /> Live
              </span>
            )}
          </div>
          <p className="mt-2 font-mono text-sm font-bold text-ink">{order.ref || order.id}</p>
          <p className="mt-1 text-sm text-muted">
            {order.quantity} gallon{Number(order.quantity) === 1 ? '' : 's'}
            <span className="mx-1.5 text-slate-300">·</span>
            {formatOrderDate(order.date)}
          </p>
          {!walkin && order.address && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
              <MapPin size={13} className="mt-0.5 shrink-0 text-blue-500" />
              <span className="line-clamp-2">{order.address}</span>
            </p>
          )}
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="font-display text-xl font-bold text-blue-600">{formatMoney(order.total)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {walkin ? 'Pay on arrival' : (order.payMethod || 'Online payment')}
          </p>
        </div>
      </div>

      {!completed && currentStep >= 0 && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <div className="flex items-center">
            {steps.map((step, i) => {
              const done = currentStep > i || (order.status === 'Delivered' && i === steps.length - 1);
              const current = currentStep === i && order.status !== 'Delivered';
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${
                        done
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : current
                            ? 'border-blue-500 bg-white text-blue-600 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-300'
                      }`}
                    >
                      {done ? <CheckCircle2 size={16} /> : <Icon size={15} />}
                    </div>
                    <span
                      className={`mt-1.5 max-w-[72px] text-center text-[10px] font-semibold leading-tight sm:text-[11px] ${
                        done || current ? 'text-ink' : 'text-slate-300'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`mx-1.5 mb-5 h-0.5 flex-1 rounded sm:mx-2 ${done ? 'bg-blue-500' : 'bg-slate-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completed && (
        <div className="flex items-center gap-2 border-t border-slate-100 bg-emerald-50/40 px-5 py-3 text-xs font-medium text-emerald-700">
          <CheckCircle2 size={14} />
          {order.status === 'Cancelled' ? 'This order was cancelled' : 'Order completed successfully'}
        </div>
      )}

      {canTrackLive && (
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={() => setTrackingOrderId(tracking ? null : order.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${
              isOutForDelivery
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <span className="flex items-center gap-2">
              {isOutForDelivery ? <Radio size={16} className="animate-pulse" /> : <MapPinned size={16} />}
              {tracking
                ? 'Hide map'
                : isOutForDelivery
                  ? 'Track rider live'
                  : 'Preview delivery map'}
            </span>
            {tracking ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {tracking && (() => {
            const riderIsLive = rider?.lat != null && rider?.updatedAt
              && (Date.now() - new Date(rider.updatedAt).getTime()) < RIDER_STALE_MS;
            const homePos = order.lat != null && order.lng != null
              ? [Number(order.lat), Number(order.lng)]
              : null;
            const riderPos = riderIsLive ? [rider.lat, rider.lng] : null;
            const center = riderPos || homePos || [10.3157, 123.9740];
            return (
              <div className="mt-3">
                <div className={`h-64 overflow-hidden rounded-xl border sm:h-72 ${
                  isOutForDelivery ? 'border-emerald-200 shadow-lg shadow-emerald-500/10' : 'border-slate-200'
                }`}>
                  <GeoMap
                    key={`track-${order.id}`}
                    theme="light"
                    center={{ lat: center[0], lng: center[1] }}
                    zoom={14}
                    className="h-full"
                    fitPoints={[riderPos, homePos].filter(Boolean)}
                    follow={riderPos ? { enabled: true, lat: riderPos[0], lng: riderPos[1], bearing: 0, pitch: 0, zoom: 15 } : null}
                    markers={[
                      homePos && {
                        id: 'home',
                        lat: homePos[0],
                        lng: homePos[1],
                        html: homeHtml,
                        popupHtml: 'Your delivery address',
                      },
                      riderPos && {
                        id: 'rider',
                        lat: riderPos[0],
                        lng: riderPos[1],
                        html: riderHtml,
                        popupHtml: 'Your rider (live)',
                      },
                    ].filter(Boolean)}
                    routes={trackRoute.length > 1 ? [{
                      id: 'track',
                      geometry: trackRoute,
                      color: '#3b82f6',
                      width: 5,
                      opacity: 0.9,
                    }] : []}
                    geometryFormat="latlng"
                  />
                </div>
                <p className={`mt-2 flex items-center justify-center gap-2 text-xs font-medium ${
                  riderIsLive ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${
                    riderIsLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                  }`} />
                  {riderIsLive
                    ? 'Live rider location updating…'
                    : isOutForDelivery
                      ? 'Waiting for rider to share GPS…'
                      : 'Drop-off shown now. Rider appears when delivery starts.'}
                </p>
              </div>
            );
          })()}
        </div>
      )}
    </article>
  );
}

export default function CustomerDashboard({ user, onLogout, onUpdateUser }) {
  const [active, setActive]   = useState('dashboard');
  const [ordersTab, setOrdersTab] = useState('active'); // active | completed
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
    setOrdersTab('active');
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
    { icon: ClipboardList, label: 'Total orders',     key: 'total'     },
    { icon: Clock,         label: 'Active services',  key: 'active'    },
    { icon: CheckCircle2,  label: 'Ready',            key: 'ready'     },
    { icon: Truck,         label: 'Delivered',        key: 'delivered' },
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

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [orders]
  );
  const activeOrders = useMemo(
    () => sortedOrders.filter((o) => !isCompletedOrder(o)),
    [sortedOrders]
  );
  const completedOrders = useMemo(
    () => sortedOrders.filter((o) => isCompletedOrder(o)),
    [sortedOrders]
  );
  const ordersForTab = ordersTab === 'completed' ? completedOrders : activeOrders;

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
      <aside className="hidden h-screen w-[248px] min-w-[248px] shrink-0 flex-col bg-[#0f172a] text-white md:flex">
        <div className="border-b border-white/10 px-4 py-4">
          <BrandMark light size="sm" className="!max-w-[168px]" />
          <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Customer portal
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {NAV.map(({ icon: Icon, label, id }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition ${
                active === id
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={16} className="shrink-0 opacity-90" />
              {label}
            </button>
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[11px] font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{firstName}</p>
              <p className="truncate text-[11px] text-slate-400">{user?.email || 'Customer'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Topbar */}
        <header className="relative flex h-14 items-center gap-2 border-b border-slate-200/80 bg-white px-3 sm:gap-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:max-w-md">
            <Search size={15} className="shrink-0 text-slate-400" />
            <input placeholder="Search orders…" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-slate-400" />
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
                        ${n.read ? '' : 'bg-blue-50/80'}`}
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
            <div className={`agua-card flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium ${
              checkoutBanner.type === 'success'
                ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-800'
                : 'border-amber-200/80 bg-amber-50/90 text-amber-800'
            }`}>
              <span className="flex items-center gap-2">
                {checkoutBanner.type === 'success'
                  ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                  : <Info size={18} className="shrink-0 text-amber-600" />}
                {checkoutBanner.text}
              </span>
              <button type="button" onClick={() => setCheckoutBanner(null)} className="shrink-0 text-xs font-semibold underline opacity-70 hover:opacity-100">Dismiss</button>
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
                    setOrdersTab('active');
                    setTrackingOrderId(outForDeliveryOrders[0].id);
                  }}
                  className="agua-card w-full text-left border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 to-white px-5 py-4 transition hover:shadow-md"
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
              <div className="agua-card relative overflow-hidden px-5 py-6 sm:px-7">
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="agua-fade-up">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent2">Customer dashboard</p>
                    <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Good day, {firstName}</h2>
                    <p className="mt-1 text-sm text-muted">Your orders, deliveries, and account in one place.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white shadow-lg shadow-blue-500/25">
                      {initials}
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-semibold text-ink">{user?.username || user?.fullName}</p>
                      <p className="truncate text-xs text-muted">{user?.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActive('request')}
                      className="agua-btn agua-btn-primary ml-1 hidden shrink-0 !py-2 !text-xs sm:inline-flex"
                    >
                      <PlusCircle size={14} /> New order
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                {STATS.map(({ icon: StatIcon, label, key }) => (
                  <div key={key} className="agua-card px-5 py-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-accent2 ring-1 ring-blue-100">
                      <StatIcon size={18} />
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                    <p className="mt-1 font-display text-2xl font-bold text-ink">
                      {loading ? '…' : stats[key]}
                    </p>
                  </div>
                ))}
              </div>

              {/* Recent Activity */}
              <div className="agua-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h3 className="font-display text-base font-bold text-ink">Recent activity</h3>
                    <p className="mt-0.5 text-xs text-muted">Latest orders and service requests</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setOrdersTab('active'); setActive('orders'); }}
                    className="agua-btn agua-btn-secondary !py-1.5 !text-xs"
                  >
                    View all
                  </button>
                </div>
                <div className="overflow-x-auto px-5 pb-4">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-muted">
                      <th className="pb-2 text-left font-semibold">Ref</th>
                      <th className="pb-2 text-left font-semibold">Type</th>
                      <th className="pb-2 text-left font-semibold">Date</th>
                      <th className="pb-2 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} className="py-8 text-center text-muted">Loading…</td></tr>
                    ) : recentOrders.length === 0 ? (
                      <tr><td colSpan={4} className="py-8 text-center text-muted">No activity yet.</td></tr>
                    ) : recentOrders.map(order => (
                      <tr key={order.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5 font-mono text-xs text-ink">{order.ref || order.id}</td>
                        <td className="py-2.5 text-ink">{order.type}</td>
                        <td className="py-2.5 text-muted">{new Date(order.date).toLocaleDateString()}</td>
                        <td className="py-2.5">
                          <span className={`agua-badge ${STATUS_STYLE[order.status] || 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/80'}`}>
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
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight text-ink">My orders</h2>
                  <p className="mt-1 text-sm text-muted">
                    Follow active deliveries and review past completed orders.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActive('request')}
                  className="agua-btn agua-btn-primary shrink-0 !py-2"
                >
                  <PlusCircle size={16} /> New order
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOrdersTab('active')}
                  className={`agua-card px-4 py-3.5 text-left transition ${
                    ordersTab === 'active' ? 'ring-2 ring-blue-500 shadow-md' : 'hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">In progress</p>
                    <Clock size={16} className={ordersTab === 'active' ? 'text-blue-500' : 'text-slate-300'} />
                  </div>
                  <p className="mt-1 font-display text-2xl font-bold text-ink">{activeOrders.length}</p>
                  <p className="mt-0.5 text-xs text-muted">Pending & on the way</p>
                </button>
                <button
                  type="button"
                  onClick={() => setOrdersTab('completed')}
                  className={`agua-card px-4 py-3.5 text-left transition ${
                    ordersTab === 'completed' ? 'ring-2 ring-blue-500 shadow-md' : 'hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Completed</p>
                    <CheckCircle2 size={16} className={ordersTab === 'completed' ? 'text-emerald-500' : 'text-slate-300'} />
                  </div>
                  <p className="mt-1 font-display text-2xl font-bold text-ink">{completedOrders.length}</p>
                  <p className="mt-0.5 text-xs text-muted">Delivered history</p>
                </button>
              </div>

              <div className="flex rounded-xl border border-slate-200 bg-white p-1">
                {[
                  { id: 'active', label: 'Active', count: activeOrders.length },
                  { id: 'completed', label: 'Completed', count: completedOrders.length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOrdersTab(tab.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                      ordersTab === tab.id
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'text-muted hover:bg-slate-50 hover:text-ink'
                    }`}
                  >
                    {tab.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      ordersTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="agua-card p-10 text-center text-muted">Loading orders…</div>
              ) : orders.length === 0 ? (
                <div className="agua-card p-10 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                    <Package size={26} />
                  </div>
                  <p className="font-semibold text-ink">No orders yet</p>
                  <p className="mt-1 text-sm text-muted">Place your first refill to see it tracked here.</p>
                  <button
                    type="button"
                    onClick={() => setActive('request')}
                    className="agua-btn agua-btn-primary mt-5"
                  >
                    Request service
                  </button>
                </div>
              ) : ordersForTab.length === 0 ? (
                <div className="agua-card p-10 text-center">
                  <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${
                    ordersTab === 'active'
                      ? 'bg-amber-50 text-amber-600 ring-amber-100'
                      : 'bg-emerald-50 text-emerald-600 ring-emerald-100'
                  }`}>
                    {ordersTab === 'active' ? <Clock size={26} /> : <CheckCircle2 size={26} />}
                  </div>
                  <p className="font-semibold text-ink">
                    {ordersTab === 'active' ? 'Nothing in progress' : 'No completed orders yet'}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {ordersTab === 'active'
                      ? 'New and ongoing orders will show up in this list.'
                      : 'Delivered orders will move here automatically.'}
                  </p>
                  {ordersTab === 'active' && (
                    <button
                      type="button"
                      onClick={() => setActive('request')}
                      className="agua-btn agua-btn-primary mt-5"
                    >
                      Place an order
                    </button>
                  )}
                  {ordersTab === 'completed' && activeOrders.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOrdersTab('active')}
                      className="agua-btn agua-btn-secondary mt-5"
                    >
                      View active orders
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">
                    {ordersTab === 'active' ? 'Active orders' : 'Completed orders'} · {ordersForTab.length}
                  </p>
                  <div className="max-h-[min(62vh,720px)] space-y-4 overflow-y-auto overscroll-contain pr-0.5">
                    {ordersForTab.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        completed={ordersTab === 'completed'}
                        trackingOrderId={trackingOrderId}
                        setTrackingOrderId={setTrackingOrderId}
                        rider={rider}
                        trackRoute={trackRoute}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* ── Billing History ── */}
          {active === 'billing' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Billing history</h2>
                <p className="mt-1 text-sm text-muted">Past payments and invoices will appear here.</p>
              </div>
              <div className="agua-card p-10 text-center">
                <CreditCard size={28} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-muted">No billing records yet.</p>
              </div>
            </div>
          )}

          {/* ── Edit Profile ── */}
          {active === 'profile' && (
            <div className="max-w-xl space-y-5">
              {/* Profile header card */}
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Edit profile</h2>
                <p className="mt-1 text-sm text-muted">Update your contact details and password.</p>
              </div>
              <div className="agua-card flex items-center gap-4 p-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xl font-bold text-white shadow-lg shadow-blue-500/25">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-ink">{user?.fullName || user?.username}</p>
                  <p className="text-sm text-muted">@{user?.username}</p>
                </div>
              </div>

              <form onSubmit={handleProfileSave} className="agua-card space-y-4 p-5">
                <h3 className="font-display text-base font-bold text-ink">Profile information</h3>

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
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Full name</label>
                  <input
                    value={profileForm.fullName}
                    onChange={e => setProfileForm(f => ({ ...f, fullName: e.target.value }))}
                    className="agua-input mt-1.5"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                    className="agua-input mt-1.5"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Phone</label>
                  <input
                    value={profileForm.phone}
                    onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                    className="agua-input mt-1.5"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Address</label>
                  <input
                    value={profileForm.address}
                    onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))}
                    className="agua-input mt-1.5"
                  />
                </div>

                <hr className="border-slate-100" />

                <h3 className="font-display text-base font-bold text-ink">Change password</h3>
                <p className="-mt-2 text-xs text-muted">Leave blank if you don&apos;t want to change your password.</p>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Current password</label>
                  <input
                    type="password"
                    value={pwForm.currentPassword}
                    onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                    className="agua-input mt-1.5"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted">New password</label>
                    <input
                      type="password"
                      value={pwForm.newPassword}
                      onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                      className="agua-input mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted">Confirm new password</label>
                    <input
                      type="password"
                      value={pwForm.confirmPassword}
                      onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      className="agua-input mt-1.5"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={profileSaving}
                  className="agua-btn agua-btn-primary disabled:opacity-50"
                >
                  {profileSaving ? 'Saving…' : 'Save changes'}
                </button>
              </form>
            </div>
          )}
        </main>

        {/* Bottom nav (mobile/tablet only — desktop uses the sidebar instead) */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl md:hidden">
          <div className="flex items-stretch">
            {NAV.map(({ icon: Icon, id, short }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${
                  active === id ? 'text-accent2' : 'text-slate-400'
                }`}
              >
                <span className={`rounded-xl p-1.5 ${active === id ? 'bg-blue-50 text-accent2' : ''}`}>
                  <Icon size={18} strokeWidth={active === id ? 2.25 : 2} />
                </span>
                <span className="text-center leading-none">{short}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}