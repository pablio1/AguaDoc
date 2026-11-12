import { useEffect, useMemo, useState } from 'react';
import { apiGetDeliveryRoute, apiUpdateOrder } from '../api';
import PageHeader from '../components/admin/PageHeader';
import EmptyState from '../components/admin/EmptyState';
import GeoMap from '../components/map/GeoMap';
import { MapPin, Route } from 'lucide-react';

function stopMarkerHtml(n) {
  return `<div style="
      background:#3B82F6;color:white;font-weight:700;font-size:13px;
      width:28px;height:28px;border-radius:50%;display:flex;
      align-items:center;justify-content:center;border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    ">${n}</div>`;
}

const depotHtml = `<div style="
    background:#0f2a4a;color:white;font-size:12px;font-weight:700;
    width:32px;height:32px;border-radius:8px;display:flex;
    align-items:center;justify-content:center;border:2px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.4);
  ">H₂O</div>`;

export default function DeliveryRoutePage() {
  const [data, setData] = useState({ depot: null, stops: [], geometry: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGetDeliveryRoute()
      .then((res) => {
        if (res.success === false) {
          setError(res.message || 'Could not calculate route.');
          setData({ depot: res.depot || null, stops: [], geometry: [], fallback: false });
        } else {
          setData(res);
          if (res.fallback && res.warning) setError(res.warning);
        }
      })
      .catch(() => setError('Could not reach the server.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function markDelivered(orderId) {
    await apiUpdateOrder(orderId, { status: 'Delivered' });
    load();
  }

  const routeLine = data.geometry || [];
  const markers = useMemo(() => {
    const list = [];
    if (data.depot?.lat != null && data.depot?.lng != null) {
      list.push({
        id: 'depot',
        lat: data.depot.lat,
        lng: data.depot.lng,
        html: depotHtml,
        popupHtml: `<strong>${data.depot.name || 'AguaDoc Station'}</strong>`,
      });
    }
    (data.stops || []).forEach((stop, i) => {
      if (stop.lat == null || stop.lng == null) return;
      list.push({
        id: stop.id,
        lat: Number(stop.lat),
        lng: Number(stop.lng),
        html: stopMarkerHtml(i + 1),
        popupHtml: `<strong>${stop.ref || ''}</strong><br/>${stop.address || ''}`,
      });
    });
    return list;
  }, [data]);

  const fitPoints = useMemo(() => {
    const pts = [];
    if (data.depot?.lat != null) pts.push([data.depot.lat, data.depot.lng]);
    (data.stops || []).forEach((s) => {
      if (s.lat != null && s.lng != null) pts.push([Number(s.lat), Number(s.lng)]);
    });
    return pts;
  }, [data]);

  const routes = useMemo(() => {
    if (!routeLine || routeLine.length < 2) return [];
    return [{
      id: 'delivery',
      geometry: routeLine,
      color: data.fallback ? '#F59E0B' : '#3B82F6',
      width: 5,
      opacity: 0.95,
    }];
  }, [routeLine, data.fallback]);

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[480px] flex-col gap-4">
      <PageHeader title="Live Delivery Map" subtitle="Optimized stops powered by Geoapify (MapLibre).">
        <button type="button" onClick={load} className="agua-btn agua-btn-primary !py-2 !text-xs">
          Refresh route
        </button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className="agua-card flex max-h-[40vh] w-full shrink-0 flex-col overflow-hidden p-4 lg:max-h-none lg:w-80">
          <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Route size={16} />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">Route stops</p>
              <p className="text-[11px] text-muted">
                {loading ? 'Calculating…' : `${data.stops.length} pending`}
                {data.provider ? ` · ${data.provider}` : ''}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && <p className="py-4 text-center text-sm text-muted">Calculating best route…</p>}
            {error && (
              <p className={`mb-3 rounded-xl px-3 py-2 text-sm ${
                data.fallback
                  ? 'border border-amber-200 bg-amber-50 text-amber-800'
                  : 'border border-red-100 bg-red-50 text-red-600'
              }`}>
                {error}
              </p>
            )}
            {!loading && data.stops.length === 0 && (
              <EmptyState
                icon={MapPin}
                title="No mapped stops"
                description="Pending deliveries with a geocoded address appear here and on the map."
              />
            )}

            <ol className="space-y-3">
              {data.stops.map((stop, i) => (
                <li key={stop.id} className="rounded-xl border border-slate-100 p-3 transition hover:border-blue-100 hover:bg-slate-50/80">
                  <div className="flex items-start gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{stop.ref}</p>
                      <p className="truncate text-xs text-muted">{stop.address}</p>
                      <p className="text-xs text-muted">{stop.quantity} gal • {stop.status}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => markDelivered(stop.id)}
                    className="mt-2 w-full rounded-lg border border-blue-200 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    Mark Delivered
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="agua-card min-h-[280px] flex-1 overflow-hidden p-0">
          <GeoMap
            theme="light"
            center={data.depot || { lat: 10.3157, lng: 123.9740 }}
            zoom={13}
            markers={markers}
            routes={routes}
            fitPoints={fitPoints}
            className="h-full min-h-[280px]"
          />
        </div>
      </div>
    </div>
  );
}
