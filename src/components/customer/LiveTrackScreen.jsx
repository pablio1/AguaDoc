import { useMemo, useState } from 'react';
import {
  ArrowLeft, Check, Clock, LocateFixed, MoreVertical, Package, Phone, Share2, Truck,
} from 'lucide-react';
import GeoMap from '../map/GeoMap';
import { homeMarkerHtml, truckMarkerHtml } from '../map/mapMarkers';
import BrandMark from '../BrandMark';

const DEFAULT_CENTER = [10.3157, 123.9740];

const TRACK_STEPS = [
  { key: 'confirmed', label: 'Order Confirmed', icon: Check },
  { key: 'preparing', label: 'Preparing', icon: Package },
  { key: 'out', label: 'Out for Delivery', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: Package },
];

function trackStepIndex(status) {
  if (status === 'Delivered') return 3;
  if (status === 'Out for Delivery') return 2;
  if (['Assigned', 'Accepted', 'Processing', 'Active'].includes(status)) return 1;
  return 0;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatKm(meters) {
  if (!Number.isFinite(meters)) return null;
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'R';
}

export default function LiveTrackScreen({
  order,
  rider,
  trackRoute = [],
  trackMeta = {},
  onClose,
}) {
  const [follow, setFollow] = useState(true);
  const step = trackStepIndex(order.status);
  const riderIsLive = rider?.lat != null && rider?.lng != null;

  const homePos = useMemo(() => (
    order.lat != null && order.lng != null
      ? [Number(order.lat), Number(order.lng)]
      : null
  ), [order.lat, order.lng]);

  const riderPos = riderIsLive
    ? [Number(rider.lat), Number(rider.lng)]
    : null;
  const center = riderPos || homePos || DEFAULT_CENTER;

  const etaLabel = formatEta(trackMeta.durationS);
  const distLabel = formatKm(trackMeta.distanceM);
  const riderName = order.riderName || 'Your rider';
  const riderPhone = order.riderPhone || null;

  const markers = [
    homePos && {
      id: 'home',
      lat: homePos[0],
      lng: homePos[1],
      html: homeMarkerHtml,
      popupHtml: 'Your delivery address',
    },
    riderPos && {
      id: 'truck',
      lat: riderPos[0],
      lng: riderPos[1],
      html: truckMarkerHtml,
      popupHtml: `${riderName} (live)`,
    },
  ].filter(Boolean);

  const routes = trackRoute.length > 1
    ? [{
        id: 'track',
        geometry: trackRoute,
        color: '#16A34A',
        width: 6,
        opacity: 0.95,
      }]
    : [];

  async function shareTracking() {
    const text = `Tracking AguaDoc order ${order.ref || order.id}`;
    try {
      if (navigator.share) await navigator.share({ title: 'AguaDoc delivery', text });
      else await navigator.clipboard?.writeText(text);
    } catch { /* user cancelled */ }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#F3F6F4] text-slate-900">
      {/* Header */}
      <header className="relative z-20 flex items-center gap-3 bg-[#14532d] px-3 py-3 text-white shadow-lg shadow-emerald-950/20 sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/15"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="overflow-hidden rounded-full ring-2 ring-white/25">
            <BrandMark iconOnly size="sm" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">AguaDoc Station</p>
            <p className="truncate text-[11px] text-emerald-100/80">{order.ref || order.id}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={shareTracking}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/15"
          aria-label="Share"
        >
          <Share2 size={16} />
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/15"
          aria-label="More"
        >
          <MoreVertical size={16} />
        </button>
      </header>

      {/* Map */}
      <div className="relative min-h-0 flex-1">
        <GeoMap
          key={`live-track-${order.id}`}
          theme="light"
          center={{ lat: center[0], lng: center[1] }}
          zoom={15}
          className="h-full w-full"
          fitPoints={!follow ? [riderPos, homePos].filter(Boolean) : null}
          follow={
            follow && riderPos
              ? { enabled: true, lat: riderPos[0], lng: riderPos[1], bearing: 0, pitch: 0, zoom: 15.5 }
              : { enabled: false }
          }
          onUserDrag={() => setFollow(false)}
          markers={markers}
          routes={routes}
          geometryFormat="latlng"
        />

        {(etaLabel || distLabel) && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 sm:left-4 sm:top-4">
            <div className="pointer-events-auto inline-flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-lg shadow-slate-900/10 ring-1 ring-slate-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Clock size={15} />
              </span>
              <span>
                Estimated delivery{' '}
                <span className="text-emerald-700">{etaLabel || '—'}</span>
                {distLabel ? (
                  <span className="font-medium text-slate-400"> | {distLabel} away</span>
                ) : null}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setFollow(true)}
          className="absolute bottom-4 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-emerald-700 shadow-lg shadow-slate-900/15 ring-1 ring-slate-100 transition hover:bg-emerald-50 sm:right-4"
          aria-label="Recenter on rider"
        >
          <LocateFixed size={18} />
        </button>
      </div>

      {/* Bottom sheet */}
      <div className="relative z-20 -mt-2 rounded-t-[28px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(15,23,42,0.12)] sm:px-5">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />

        {/* Stepper */}
        <div className="mb-5 flex items-start justify-between gap-1 px-1">
          {TRACK_STEPS.map((s, i) => {
            const done = step > i || (order.status === 'Delivered' && i === TRACK_STEPS.length - 1);
            const current = step === i && order.status !== 'Delivered';
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex flex-1 items-start last:flex-none">
                <div className="flex w-[68px] flex-col items-center sm:w-[78px]">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
                      done
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : current
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                          : 'border-slate-200 bg-white text-slate-300'
                    }`}
                  >
                    {done && !current ? <Check size={16} strokeWidth={2.5} /> : <Icon size={15} />}
                  </div>
                  <p
                    className={`mt-2 text-center text-[10px] font-semibold leading-tight sm:text-[11px] ${
                      done || current ? 'text-slate-800' : 'text-slate-300'
                    }`}
                  >
                    {s.label}
                  </p>
                </div>
                {i < TRACK_STEPS.length - 1 && (
                  <div
                    className={`mt-5 h-0.5 flex-1 rounded ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Rider card */}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-sm font-bold text-white shadow-md shadow-emerald-600/25">
            {initials(riderName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-slate-900">
              {order.status === 'Out for Delivery' ? 'Rider is on the way' : `${riderName} assigned`}
            </p>
            <p className="truncate text-xs text-slate-500">
              {riderIsLive
                ? 'Your order is on the way to you'
                : order.status === 'Out for Delivery'
                  ? 'Waiting for live GPS…'
                  : 'We’ll show the truck when delivery starts'}
            </p>
          </div>
          {riderPhone ? (
            <a
              href={`tel:${riderPhone}`}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500"
              aria-label="Call rider"
            >
              <Phone size={18} />
            </a>
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-400">
              <Phone size={18} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
