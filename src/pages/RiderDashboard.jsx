import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-rotate';
import 'leaflet/dist/leaflet.css';
import {
  Bike, Package, MapPin, Navigation, CheckCircle2, LogOut,
  RefreshCw, Phone, Clock, ChevronRight, Radio, ArrowUp,
  CornerUpLeft, CornerUpRight, Undo2, RotateCw, GitFork,
  X, LocateFixed, Search,
} from 'lucide-react';
import {
  apiGetRiderBookings,
  apiUpdateRiderBookingStatus,
  apiPostRiderLocation,
  apiGetRiderRoute,
} from '../api';
import { CARTO_ATTRIBUTION, cartoDarkUrl, cartoVoyagerUrl } from '../lib/mapTiles';
import { formatMoney } from '../lib/money';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEPOT = [10.3157, 123.9740];

function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

function bearingBetween(a, b) {
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat))
    - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function distanceM(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function destinationPoint(lat, lng, bearingDeg, meters) {
  const R = 6371000;
  const δ = meters / R;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );
  return [toDeg(φ2), toDeg(λ2)];
}

function shortestAngleDiff(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function makeArrowIcon(heading = 0) {
  return L.divIcon({
    className: 'rider-nav-arrow',
    html: `<div style="width:52px;height:52px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg);">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <defs>
          <filter id="arrow-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" flood-color="#0b1526" flood-opacity="0.35"/>
          </filter>
        </defs>
        <circle cx="20" cy="20" r="11" fill="rgba(26,115,232,0.18)"/>
        <path filter="url(#arrow-shadow)" d="M20 3 L32 34 L20 27 L8 34 Z" fill="#1A73E8" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>
      </svg>
    </div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  });
}

const dropIcon = L.divIcon({
  className: 'rider-drop-icon',
  html: `<div style="width:36px;height:36px;border-radius:12px;background:#0f172a;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;border:2px solid #fff;box-shadow:0 6px 16px rgba(15,23,42,.35);">📍</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function headingFromLine(gps, line) {
  if (!gps || !line?.length) return 0;
  let nearest = 0;
  let best = Infinity;
  for (let i = 0; i < line.length; i += 1) {
    const d = distanceM(gps, { lat: line[i][0], lng: line[i][1] });
    if (d < best) {
      best = d;
      nearest = i;
    }
  }
  const next = line[Math.min(line.length - 1, nearest + 3)] || line[nearest];
  if (!next) return 0;
  return bearingBetween(gps, { lat: next[0], lng: next[1] });
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

function formatArrival(seconds) {
  if (!seconds && seconds !== 0) return '';
  const when = new Date(Date.now() + seconds * 1000);
  return when.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function ManeuverGlyph({ step, size = 26 }) {
  const type = step?.type || '';
  const modifier = (step?.modifier || '').toLowerCase();
  const props = { size, strokeWidth: 2.4 };
  if (type === 'arrive') return <MapPin {...props} />;
  if (type.includes('roundabout') || type.includes('rotary')) return <RotateCw {...props} />;
  if (modifier.includes('uturn')) return <Undo2 {...props} />;
  if (modifier.includes('left')) return <CornerUpLeft {...props} />;
  if (modifier.includes('right')) return <CornerUpRight {...props} />;
  return <ArrowUp {...props} />;
}

function bannerCopy(steps) {
  const usable = (steps || []).filter((s) => s.type !== 'depart' || s.name);
  const current = usable[0] || steps?.[0];
  const next = usable[1] || steps?.[1];
  if (!current) {
    return { title: 'Follow the route', subtitle: 'Toward drop-off' };
  }
  if (current.type === 'arrive') {
    return { title: 'Arrive at drop-off', subtitle: current.name || 'Customer location' };
  }
  const title = current.ref || current.name || 'Continue';
  const toward = next?.name || next?.ref;
  return {
    title,
    subtitle: toward ? `toward ${toward}` : (current.name && current.ref ? current.name : 'Continue on route'),
  };
}

function routeLabel(route, index, fastestIdx, shortestIdx) {
  if (index === fastestIdx) return 'Fastest';
  if (index === shortestIdx && shortestIdx !== fastestIdx) return 'Shortest';
  return `Route ${index + 1}`;
}

function FitBounds({ points, enabled }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return;
    const valid = points.filter((p) => p?.[0] != null && p?.[1] != null);
    if (valid.length >= 2) map.fitBounds(valid, { padding: [60, 60], maxZoom: 16 });
    else if (valid.length === 1) map.setView(valid[0], 15);
  }, [points, map, enabled]);
  return null;
}

const NAV_ZOOM = 17.4;
const NAV_PITCH = 48;
const LOOKAHEAD_M = 110;

function NavMapController({ follow, lat, lng, heading, pickingRoute, allPoints, onUserDrag }) {
  const map = useMap();
  const lastBearing = useRef(0);
  const followBooted = useRef(false);

  useMapEvents({
    dragstart() {
      onUserDrag();
    },
  });

  useEffect(() => {
    map.invalidateSize({ animate: false });
    return () => {
      if (typeof map.setPitch === 'function') map.setPitch(0, { animate: false });
      if (typeof map.setBearing === 'function') map.setBearing(0, { animate: false });
    };
  }, [map]);

  useEffect(() => {
    if (pickingRoute) {
      followBooted.current = false;
      if (typeof map.setPitch === 'function') map.setPitch(0, { animate: true, duration: 0.3 });
      if (typeof map.setBearing === 'function') map.setBearing(0, { animate: true, duration: 0.3 });
      const valid = (allPoints || []).filter((p) => p?.[0] != null && p?.[1] != null);
      if (valid.length >= 2) map.fitBounds(valid, { padding: [100, 100], maxZoom: 15 });
      return;
    }

    if (!follow || lat == null || lng == null) {
      followBooted.current = false;
      return;
    }

    const target = Number.isFinite(heading) ? heading : lastBearing.current;
    const smoothed = (lastBearing.current + shortestAngleDiff(lastBearing.current, target) * 0.4 + 360) % 360;
    lastBearing.current = smoothed;

    const look = destinationPoint(lat, lng, smoothed, LOOKAHEAD_M);
    const firstLock = !followBooted.current;
    followBooted.current = true;

    map.setView(look, NAV_ZOOM, { animate: true, duration: firstLock ? 0.7 : 0.35 });
    if (typeof map.setBearing === 'function') {
      map.setBearing(smoothed, { animate: true, duration: firstLock ? 0.65 : 0.35 });
    }
    if (typeof map.setPitch === 'function') {
      map.setPitch(NAV_PITCH, { animate: true, duration: firstLock ? 0.65 : 0.35 });
    }
  }, [follow, lat, lng, heading, pickingRoute, allPoints, map]);

  return null;
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
  const [tab, setTab] = useState('active');
  const [mine, setMine] = useState([]);
  const [done, setDone] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [gps, setGps] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [follow, setFollow] = useState(true);
  const [pickingRoute, setPickingRoute] = useState(false);
  const watchRef = useRef(null);
  const lastGpsRef = useRef(null);
  const lastFetchRef = useRef({ t: 0, lat: null, lng: null, destKey: null });
  const selectedDurationRef = useRef(null);

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
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
        };
        const prev = lastGpsRef.current;
        if (next.heading == null && prev) {
          const moved = distanceM(prev, next);
          if (moved > 4) next.heading = bearingBetween(prev, next);
        }
        lastGpsRef.current = next;
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

  const autoOpenedNav = useRef(false);
  useEffect(() => {
    const delivering = mine.some((o) => o.status === 'Out for Delivery');
    if (delivering && !sharing) startGps();
    if (delivering && !autoOpenedNav.current) {
      autoOpenedNav.current = true;
      setNavOpen(true);
    }
  }, [mine, sharing, startGps]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!gps || !activeOrder?.lat || !activeOrder?.lng) {
        setRoutes([]);
        return;
      }
      const destKey = `${activeOrder.id}:${activeOrder.lat},${activeOrder.lng}`;
      const prev = lastFetchRef.current;
      const moved = prev.lat != null ? distanceM({ lat: prev.lat, lng: prev.lng }, gps) : 9999;
      const elapsed = Date.now() - prev.t;
      const destChanged = prev.destKey !== destKey;
      if (!destChanged && elapsed < 8000 && moved < 50) return;

      lastFetchRef.current = { t: Date.now(), lat: gps.lat, lng: gps.lng, destKey };
      const data = await apiGetRiderRoute(gps.lat, gps.lng, activeOrder.lat, activeOrder.lng);
      if (cancelled || data.success === false) return;

      const nextRoutes = Array.isArray(data.routes) && data.routes.length
        ? data.routes
        : [{
            index: 0,
            geometry: data.geometry || [],
            distanceM: data.distanceM,
            durationS: data.durationS,
            steps: data.steps || [],
          }];

      let keep = 0;
      if (selectedDurationRef.current != null) {
        let bestDiff = Infinity;
        nextRoutes.forEach((r, i) => {
          const diff = Math.abs((r.durationS || 0) - selectedDurationRef.current);
          if (diff < bestDiff) {
            bestDiff = diff;
            keep = i;
          }
        });
      }
      setRoutes(nextRoutes);
      setSelectedRoute(keep);
      selectedDurationRef.current = nextRoutes[keep]?.durationS ?? null;
    }
    run().catch(() => {});
    return () => { cancelled = true; };
  }, [gps, activeOrder?.id, activeOrder?.lat, activeOrder?.lng]);

  async function setStatus(order, status) {
    setBusyId(order.id);
    try {
      const updated = await apiUpdateRiderBookingStatus(order.id, user.id, status);
      if (status === 'Accepted') {
        if (updated?.sms?.ok) {
          showToast(`Accepted · SMS sent to customer`);
        } else if (updated?.sms?.skipped) {
          showToast(`Accepted · no customer mobile on file`);
        } else if (updated?.sms && !updated.sms.ok) {
          showToast(`Accepted · SMS failed: ${updated.sms.reason || 'check Semaphore'}`, 'err');
        } else {
          showToast(`${order.ref} accepted`);
        }
      }
      if (status === 'Out for Delivery') {
        startGps();
        setActiveId(order.id);
        setFollow(true);
        setNavOpen(true);
        setPickingRoute(false);
        if (updated?.sms?.ok) showToast(`Delivery started · customer notified by SMS`);
      }
      if (status === 'Delivered') {
        setNavOpen(false);
        setPickingRoute(false);
        showToast(`${order.ref} delivered`);
      }
      await load();
    } catch (e) {
      showToast(e.message, 'err');
    } finally {
      setBusyId(null);
    }
  }

  function openNavigation(order) {
    setActiveId(order.id);
    setFollow(true);
    setPickingRoute(false);
    setNavOpen(true);
    if (!sharing) startGps();
  }

  function chooseRoute(index) {
    setSelectedRoute(index);
    selectedDurationRef.current = routes[index]?.durationS ?? null;
    setPickingRoute(false);
    setFollow(true);
  }

  const list = tab === 'active' ? mine : done;
  const mapCenter = gps ? [gps.lat, gps.lng] : activeOrder?.lat ? [activeOrder.lat, activeOrder.lng] : DEPOT;
  const fitPoints = [
    gps ? [gps.lat, gps.lng] : null,
    activeOrder?.lat != null ? [Number(activeOrder.lat), Number(activeOrder.lng)] : null,
  ];

  const currentRoute = routes[selectedRoute] || routes[0] || null;
  const routeLine = (currentRoute?.geometry || []).map(([lng, lat]) => [lat, lng]);
  const heading = (gps && routeLine.length > 1)
    ? headingFromLine(gps, routeLine)
    : (gps?.heading ?? 0);
  const navigating = navOpen && Boolean(activeOrder);
  const arrowIcon = useMemo(
    () => makeArrowIcon(navigating && follow ? 0 : heading),
    [navigating, follow, heading]
  );
  const banner = bannerCopy(currentRoute?.steps);

  const fastestIdx = routes.reduce((best, r, i, arr) => (
    (r.durationS || Infinity) < (arr[best]?.durationS || Infinity) ? i : best
  ), 0);
  const shortestIdx = routes.reduce((best, r, i, arr) => (
    (r.distanceM || Infinity) < (arr[best]?.distanceM || Infinity) ? i : best
  ), 0);

  const allRoutePoints = useMemo(() => {
    const pts = [];
    routes.forEach((r) => {
      (r.geometry || []).forEach(([lng, lat]) => pts.push([lat, lng]));
    });
    return pts;
  }, [routes]);

  return (
    <div className={`relative h-dvh w-full overflow-hidden ${navigating ? 'bg-[#eef1f3] text-slate-900' : 'bg-[#07111f] text-white'}`}>
      {!navigating && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,201,0.22),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(34,197,94,0.12),_transparent_45%)]" />
      )}

      <div className="absolute inset-0">
        <MapContainer
          center={mapCenter}
          zoom={14}
          zoomControl={false}
          zoomSnap={0}
          rotate
          bearing={0}
          pitch={0}
          rotateControl={false}
          touchRotate={false}
          pitchDrag={false}
          shiftKeyRotate={false}
          style={{ height: '100%', width: '100%', background: navigating ? '#eef1f3' : '#0b1628' }}
        >
          <TileLayer
            key={navigating ? 'light' : 'dark'}
            attribution={CARTO_ATTRIBUTION}
            url={navigating ? cartoVoyagerUrl() : cartoDarkUrl()}
          />
          {!navigating && <FitBounds points={fitPoints} enabled />}
          {navigating && (
            <NavMapController
              follow={follow}
              lat={gps?.lat}
              lng={gps?.lng}
              heading={heading}
              pickingRoute={pickingRoute}
              allPoints={allRoutePoints}
              onUserDrag={() => setFollow(false)}
            />
          )}
          {gps && (
            <Marker key={`arrow-${Math.round(heading)}`} position={[gps.lat, gps.lng]} icon={arrowIcon} zIndexOffset={800}>
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
          {routes.map((route, i) => {
            if (i === selectedRoute) return null;
            const positions = (route.geometry || []).map(([lng, lat]) => [lat, lng]);
            if (positions.length < 2) return null;
            return (
              <Polyline
                key={`alt-${i}`}
                positions={positions}
                eventHandlers={{ click: () => chooseRoute(i) }}
                pathOptions={{ color: '#8AB4F8', weight: 7, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
              />
            );
          })}
          {routeLine.length > 1 && (
            <>
              <Polyline
                positions={routeLine}
                pathOptions={{ color: '#fff', weight: 12, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
              />
              <Polyline
                positions={routeLine}
                pathOptions={{ color: '#1A73E8', weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
              />
            </>
          )}
        </MapContainer>
      </div>

      {!navigating && (
        <header className="absolute top-0 inset-x-0 z-[1000] p-3 sm:p-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b1628]/75 px-3 py-2.5 shadow-2xl backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-600 shadow-lg shadow-cyan-500/30">
                <Bike size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold tracking-tight">{user.fullName || 'Rider'}</p>
                <p className="flex items-center gap-1 text-[11px] text-white/50">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${sharing ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
                  {sharing ? 'Live location sharing' : 'Location idle'} · AguaDoc Rider
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
      )}

      {navigating && (
        <>
          <div className="absolute top-0 inset-x-0 z-[1000] px-3 pt-3">
            <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-[#188038] px-4 py-3 text-white shadow-[0_10px_28px_rgba(24,128,56,0.35)]">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <ManeuverGlyph step={currentRoute?.steps?.[0]} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold leading-tight tracking-tight">{banner.title}</p>
                <p className="truncate text-sm text-white/85">{banner.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setPickingRoute(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm"
                aria-label="Search routes"
              >
                <Search size={18} />
              </button>
            </div>
            {gpsError && (
              <p className="mx-auto mt-2 max-w-xl rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700 ring-1 ring-red-200">
                {gpsError}
              </p>
            )}
            {!gps && !gpsError && (
              <p className="mx-auto mt-2 max-w-xl rounded-xl bg-white/90 px-3 py-2 text-center text-xs font-medium text-slate-600 shadow-sm">
                Waiting for GPS so we can draw your route…
              </p>
            )}
          </div>
        </>
      )}

      {navigating && !follow && (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="absolute bottom-36 left-4 z-[1000] inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-sky-700 shadow-lg"
        >
          <LocateFixed size={16} />
          Re-center
        </button>
      )}

      {navigating && pickingRoute && routes.length > 0 && (
        <div className="absolute inset-x-0 bottom-28 z-[1000] px-3">
          <div className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-bold text-slate-900">Choose a route</p>
              <button
                type="button"
                onClick={() => { setPickingRoute(false); setFollow(true); }}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Close route picker"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {routes.map((route, i) => {
                const selected = i === selectedRoute;
                return (
                  <button
                    key={route.index ?? i}
                    type="button"
                    onClick={() => chooseRoute(i)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left ${selected ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className={`h-3.5 w-3.5 rounded-full border-2 ${selected ? 'border-sky-600 bg-sky-600' : 'border-slate-300'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {routeLabel(route, i, fastestIdx, shortestIdx)}
                        <span className="ml-2 font-bold text-emerald-700">{formatEta(route.durationS)}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatKm(route.distanceM)} · arrive {formatArrival(route.durationS)}
                      </p>
                    </div>
                    {selected && <span className="text-[11px] font-semibold text-sky-700">Selected</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {navigating && (
        <div className="absolute bottom-0 inset-x-0 z-[1000] px-3 pb-3">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-white px-3 py-3 shadow-[0_-8px_30px_rgba(15,42,74,0.12)]">
            <button
              type="button"
              onClick={() => { setNavOpen(false); setPickingRoute(false); }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              aria-label="Close navigation"
            >
              <X size={22} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[22px] font-bold leading-none text-emerald-700">{formatEta(currentRoute?.durationS)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatKm(currentRoute?.distanceM)}
                {currentRoute?.durationS ? ` · ${formatArrival(currentRoute.durationS)}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPickingRoute((v) => !v)}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${pickingRoute ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-100'}`}
              aria-label="Choose route"
            >
              <GitFork size={20} />
            </button>
          </div>
          {activeOrder?.status === 'Out for Delivery' && (
            <div className="mx-auto mt-2 max-w-xl">
              <button
                type="button"
                disabled={busyId === activeOrder.id}
                onClick={() => setStatus(activeOrder, 'Delivered')}
                className="w-full rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"
              >
                Mark delivered
              </button>
            </div>
          )}
        </div>
      )}

      {!navigating && (
        <div className="absolute bottom-0 inset-x-0 z-[1000]">
          <div className="mx-auto max-w-3xl rounded-t-3xl border border-white/10 bg-[#0b1628]/92 shadow-[0_-20px_60px_rgba(0,0,0,.45)] backdrop-blur-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />

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
                          {order.customerName || 'Customer'} · {order.quantity} gal · {formatMoney(order.total)}
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

                      {tab === 'active' && order.status === 'Assigned' && (
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          onClick={() => setStatus(order, 'Accepted')}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-sky-500/25 disabled:opacity-60"
                        >
                          <CheckCircle2 size={14} />
                          Accept delivery
                        </button>
                      )}

                      {tab === 'active' &&
                        ['Accepted', 'Processing'].includes(order.status) && (
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
                        <button
                          type="button"
                          onClick={() => openNavigation(order)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/15"
                        >
                          <Clock size={13} /> Navigate
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
