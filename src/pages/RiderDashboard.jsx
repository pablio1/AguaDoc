import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Bike, Package, MapPin, Navigation, CheckCircle2, LogOut,
  RefreshCw, Phone, Clock, ChevronRight, Radio,
} from 'lucide-react';
import {
  apiGetRiderBookings,
  apiUpdateRiderBookingStatus,
  apiPostRiderLocation,
  apiGetRiderRoute,
} from '../api';
import { CARTO_ATTRIBUTION, cartoDarkUrl } from '../lib/mapTiles';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const riderIcon = L.divIcon({
  className: '',
  html: `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#0891b2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;border:3px solid #fff;box-shadow:0 8px 20px rgba(8,145,178,.45);">🛵</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const dropIcon = L.divIcon({
  className: '',
  html: `<div style="width:36px;height:36px;border-radius:12px;background:#0f172a;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;border:2px solid #fff;box-shadow:0 6px 16px rgba(15,23,42,.4);">📍</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const DEPOT = [10.3157, 123.9740];

function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.panTo([lat, lng], { animate: true });
  }, [lat, lng, map]);
  return null;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter((p) => p?.[0] != null && p?.[1] != null);
    if (valid.length >= 2) map.fitBounds(valid, { padding: [60, 60], maxZoom: 16 });
    else if (valid.length === 1) map.setView(valid[0], 15);
  }, [points, map]);
  return null;
}

function formatEta(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatKm(meters) {
  if (!meters && meters !== 0) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

const STATUS_PILL = {
  Pending: 'bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/30',
  Assigned: 'bg-indigo-400/20 text-indigo-100 ring-1 ring-indigo-300/30',
  Accepted: 'bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/30',
  Processing: 'bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/30',
  'Out for Delivery': 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/30',
  Delivered: 'bg-white/10 text-white/70 ring-1 ring-white/15',
};

export default function RiderDashboard({ user, onLogout }) {
  const [tab, setTab] = useState('active'); // active | history
  const [mine, setMine] = useState([]);
  const [done, setDone] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [gps, setGps] = useState(null); // { lat, lng }
  const [gpsError, setGpsError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [routeLine, setRouteLine] = useState([]);
  const [routeMeta, setRouteMeta] = useState(null);
  const watchRef = useRef(null);

  const showToast = (text, type = 'ok') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2800);
  };

  const load = useCallback(async () => {
    try {
      const data = await apiGetRiderBookings(user.id);
      setMine(Array.isArray(data.mine) ? data.mine : []);
      setDone(Array.isArray(data.done) ? data.done : []);
    } catch {
      showToast('Could not load bookings', 'err');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  const activeOrder = useMemo(
    () => mine.find((o) => o.id === activeId) || mine.find((o) => o.status === 'Out for Delivery') || mine[0] || null,
    [mine, activeId]
  );

  // Prefer active delivery on map when rider has one
  useEffect(() => {
    if (mine.length && !activeId) {
      const out = mine.find((o) => o.status === 'Out for Delivery');
      setActiveId((out || mine[0]).id);
    }
  }, [mine, activeId]);

  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported on this device');
      return;
    }
    setSharing(true);
    setGpsError(null);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGps(next);
        apiPostRiderLocation(next.lat, next.lng).catch(() => {});
      },
      (err) => {
        setGpsError(err.message || 'GPS permission denied');
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }, []);

  const stopGps = useCallback(() => {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setSharing(false);
  }, []);

  useEffect(() => () => stopGps(), [stopGps]);

  // Auto-share GPS while out for delivery
  useEffect(() => {
    const delivering = mine.some((o) => o.status === 'Out for Delivery');
    if (delivering && !sharing) startGps();
  }, [mine, sharing, startGps]);

  // Fetch road route when we have GPS + destination
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!gps || !activeOrder?.lat || !activeOrder?.lng) {
        setRouteLine([]);
        setRouteMeta(null);
        return;
      }
      const data = await apiGetRiderRoute(gps.lat, gps.lng, activeOrder.lat, activeOrder.lng);
      if (cancelled || data.success === false) return;
      setRouteLine((data.geometry || []).map(([lng, lat]) => [lat, lng]));
      setRouteMeta({ distanceM: data.distanceM, durationS: data.durationS });
    }
    run().catch(() => {});
    return () => { cancelled = true; };
  }, [gps, activeOrder?.id, activeOrder?.lat, activeOrder?.lng]);

  async function setStatus(order, status) {
    setBusyId(order.id);
    try {
      await apiUpdateRiderBookingStatus(order.id, user.id, status);
      if (status === 'Out for Delivery') startGps();
      if (status === 'Delivered') showToast(`${order.ref} delivered`);
      await load();
    } catch (e) {
      showToast(e.message, 'err');
    } finally {
      setBusyId(null);
    }
  }

  const list = tab === 'active' ? mine : done;
  const mapCenter = gps ? [gps.lat, gps.lng] : activeOrder?.lat ? [activeOrder.lat, activeOrder.lng] : DEPOT;
  const fitPoints = [
    gps ? [gps.lat, gps.lng] : null,
    activeOrder?.lat != null ? [Number(activeOrder.lat), Number(activeOrder.lng)] : null,
  ];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#07111f] text-white">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,201,0.22),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(34,197,94,0.12),_transparent_45%)]" />

      {/* Full-bleed map */}
      <div className="absolute inset-0">
        <MapContainer
          center={mapCenter}
          zoom={14}
          zoomControl={false}
          style={{ height: '100%', width: '100%', background: '#0b1628' }}
        >
          <TileLayer attribution={CARTO_ATTRIBUTION} url={cartoDarkUrl()} />
          <FitBounds points={fitPoints} />
          {gps && <Recenter lat={gps.lat} lng={gps.lng} />}
          {gps && (
            <Marker position={[gps.lat, gps.lng]} icon={riderIcon}>
              <Popup>You are here</Popup>
            </Marker>
          )}
          {activeOrder?.lat != null && activeOrder?.lng != null && (
            <Marker position={[Number(activeOrder.lat), Number(activeOrder.lng)]} icon={dropIcon}>
              <Popup>
                <strong>{activeOrder.ref}</strong>
                <br />
                {activeOrder.address}
              </Popup>
            </Marker>
          )}
          {routeLine.length > 1 && (
            <Polyline positions={routeLine} pathOptions={{ color: '#22d3ee', weight: 5, opacity: 0.9 }} />
          )}
        </MapContainer>
      </div>

      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 z-[1000] p-3 sm:p-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b1628]/75 px-3 py-2.5 shadow-2xl backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-600 shadow-lg shadow-cyan-500/30">
              <Bike size={20} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">{user.fullName || 'Rider'}</p>
              <p className="flex items-center gap-1 text-[11px] text-white/50">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${sharing ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
                {sharing ? 'Live location sharing' : 'Location idle'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={load}
              className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={sharing ? stopGps : startGps}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                sharing
                  ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                  : 'bg-white/10 text-white/80 hover:bg-white/15'
              }`}
            >
              <Radio size={14} />
              {sharing ? 'Sharing' : 'Share GPS'}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-xl p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {gpsError && (
          <p className="mx-auto mt-2 max-w-3xl rounded-xl bg-red-500/20 px-3 py-2 text-center text-xs text-red-100 ring-1 ring-red-400/30">
            {gpsError}
          </p>
        )}
      </header>

      {/* Route HUD */}
      {activeOrder && (routeMeta || activeOrder.status === 'Out for Delivery') && (
        <div className="absolute top-24 inset-x-0 z-[1000] flex justify-center px-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-cyan-400/20 bg-[#062033]/85 px-4 py-3 shadow-xl backdrop-blur-xl">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-cyan-200/70">ETA</p>
              <p className="text-lg font-bold text-cyan-100">{formatEta(routeMeta?.durationS)}</p>
            </div>
            <div className="h-8 w-px bg-white/15" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-cyan-200/70">Distance</p>
              <p className="text-lg font-bold text-cyan-100">{formatKm(routeMeta?.distanceM)}</p>
            </div>
            <div className="h-8 w-px bg-white/15" />
            <div className="max-w-[140px]">
              <p className="text-[10px] uppercase tracking-wider text-cyan-200/70">Drop-off</p>
              <p className="truncate text-sm font-semibold text-white">{activeOrder.ref}</p>
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      <div className="absolute bottom-0 inset-x-0 z-[1000]">
        <div className="mx-auto max-w-3xl rounded-t-3xl border border-white/10 bg-[#0b1628]/92 shadow-[0_-20px_60px_rgba(0,0,0,.45)] backdrop-blur-2xl">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />

          {/* Tabs */}
          <div className="flex gap-1 px-3 pt-3">
            {[
              { id: 'active', label: 'Assigned to me', count: mine.length, icon: Navigation },
              { id: 'history', label: 'Done', count: done.length, icon: CheckCircle2 },
            ].map(({ id, label, count, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition ${
                  tab === id
                    ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/25'
                    : 'text-white/55 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                <Icon size={14} />
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === id ? 'bg-white/20' : 'bg-white/10'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="max-h-[42vh] space-y-2 overflow-y-auto overscroll-contain px-3 pb-5 pt-3">
            {loading && <p className="py-8 text-center text-sm text-white/40">Loading bookings…</p>}
            {!loading && list.length === 0 && (
              <div className="py-10 text-center">
                <MapPin className="mx-auto mb-2 text-white/25" size={28} />
                <p className="text-sm text-white/45">
                  {tab === 'active' && 'No deliveries assigned yet — wait for admin'}
                  {tab === 'history' && 'No completed deliveries yet'}
                </p>
              </div>
            )}

            {list.map((order) => {
              const selected = activeOrder?.id === order.id;
              return (
                <article
                  key={order.id}
                  className={`rounded-2xl border p-3.5 transition ${
                    selected
                      ? 'border-cyan-400/40 bg-cyan-500/10 shadow-lg shadow-cyan-900/20'
                      : 'border-white/8 bg-white/5 hover:border-white/15 hover:bg-white/[0.07]'
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() => setActiveId(order.id)}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                      <Package size={18} className="text-cyan-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold tracking-tight">{order.ref}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_PILL[order.status] || STATUS_PILL.Pending}`}>
                          {order.status}
                        </span>
                        {order.priority === 'priority' && (
                          <span className="shrink-0 rounded-full bg-rose-500/25 px-2 py-0.5 text-[10px] font-semibold text-rose-100 ring-1 ring-rose-400/30">
                            Priority
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-white/55">
                        {order.customerName || 'Customer'} · {order.quantity} gal · ₱{Number(order.total || 0).toFixed(2)}
                      </p>
                      <p className="mt-1 flex items-start gap-1 text-xs text-white/40">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{order.address || 'No address'}</span>
                      </p>
                    </div>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-white/25" />
                  </button>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.customerPhone && (
                      <a
                        href={`tel:${order.customerPhone}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/15"
                      >
                        <Phone size={13} /> Call
                      </a>
                    )}

                    {tab === 'active' && order.status !== 'Out for Delivery' && order.status !== 'Delivered' && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => setStatus(order, 'Out for Delivery')}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/25 disabled:opacity-60"
                      >
                        <Navigation size={14} />
                        Start delivery
                      </button>
                    )}

                    {tab === 'active' && order.status === 'Out for Delivery' && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => setStatus(order, 'Delivered')}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-white to-slate-100 px-3 py-2 text-xs font-bold text-slate-900 disabled:opacity-60"
                      >
                        <CheckCircle2 size={14} />
                        Mark delivered
                      </button>
                    )}

                    {order.lat != null && order.lng != null && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/15"
                      >
                        <Clock size={13} /> Navigate
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {toast && (
        <div className={`absolute left-1/2 top-20 z-[1100] -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-semibold shadow-xl backdrop-blur-xl ${
          toast.type === 'err' ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white'
        }`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
