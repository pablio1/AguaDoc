import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGetDeliveryRoute, apiUpdateOrder } from '../api';
import { CARTO_ATTRIBUTION, cartoVoyagerUrl } from '../lib/mapTiles';

// Vite/webpack break Leaflet's default marker icon paths — rebuild them from CDN so pins actually render.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Numbered stop icon (1, 2, 3...) so the driver can match map pins to the sidebar list.
function numberedIcon(n) {
  return L.divIcon({
    className: 'aguadoc-stop-marker',
    html: `<div style="
      background:#0ea5c9;color:white;font-weight:700;font-size:13px;
      width:28px;height:28px;border-radius:50%;display:flex;
      align-items:center;justify-content:center;border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    ">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const depotIcon = L.divIcon({
  className: 'aguadoc-depot-marker',
  html: `<div style="
    background:#0f2a4a;color:white;font-size:15px;
    width:32px;height:32px;border-radius:8px;display:flex;
    align-items:center;justify-content:center;border:2px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.4);
  ">💧</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

/** Leaflet often mounts before the flex container has its final size — grey tiles = wrong size. */
function MapResizeFix({ deps = [] }) {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize({ animate: false });
    fix();
    const t1 = setTimeout(fix, 50);
    const t2 = setTimeout(fix, 250);
    window.addEventListener('resize', fix);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', fix);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
  return null;
}

function FitRoute({ depot, stops, routeLine }) {
  const map = useMap();
  useEffect(() => {
    const points = [];
    if (depot?.lat != null && depot?.lng != null) points.push([depot.lat, depot.lng]);
    (stops || []).forEach((s) => {
      if (s.lat != null && s.lng != null) points.push([Number(s.lat), Number(s.lng)]);
    });
    (routeLine || []).forEach((p) => {
      if (p?.[0] != null && p?.[1] != null) points.push(p);
    });
    if (points.length >= 2) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    }
    setTimeout(() => map.invalidateSize({ animate: false }), 0);
  }, [map, depot, stops, routeLine]);
  return null;
}

export default function DeliveryRoutePage() {
  const [data, setData]       = useState({ depot: null, stops: [], geometry: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGetDeliveryRoute()
      .then(res => {
        if (res.success === false) {
          setError(res.message || 'Could not calculate route.');
          setData({ depot: res.depot || null, stops: [], geometry: [] });
        } else {
          setData(res);
        }
      })
      .catch(() => setError('Could not reach the server.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function markDelivered(orderId) {
    await apiUpdateOrder(orderId, { status: 'Delivered' });
    load(); // route shrinks as stops are completed
  }

  const center = data.depot ? [data.depot.lat, data.depot.lng] : [10.3157, 123.9740];
  // Leaflet wants [lat, lng]; OSRM geometry comes back as [lng, lat] — flip it.
  const routeLine = data.geometry?.map(([lng, lat]) => [lat, lng]) || [];

  return (
    // Explicit viewport height — `h-full` fails under AppLayout's scrollable main.
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[480px] gap-4">
      {/* Sidebar: ordered stop list */}
      <div className="agua-card flex w-80 shrink-0 flex-col overflow-hidden p-4">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 className="font-display font-semibold text-ink">Delivery Route</h2>
          <button
            type="button"
            onClick={load}
            className="text-xs font-semibold text-accent2 hover:underline"
          >
            Refresh
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && <p className="text-sm text-muted">Calculating best route...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && !error && data.stops.length === 0 && (
            <p className="text-sm text-muted">No pending deliveries with a mapped address right now.</p>
          )}

          <ol className="space-y-3">
            {data.stops.map((stop, i) => (
              <li key={stop.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-start gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
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
                  className="mt-2 w-full rounded-lg border border-accent/40 py-1.5 text-xs font-semibold text-accent2 hover:bg-accent/10"
                >
                  Mark Delivered
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Map — absolute fill so Leaflet always gets a real pixel size */}
      <div className="agua-card relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <MapContainer
          center={center}
          zoom={14}
          className="absolute inset-0 z-0 h-full w-full"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer attribution={CARTO_ATTRIBUTION} url={cartoVoyagerUrl()} />
          <MapResizeFix deps={[loading, data.stops.length, routeLine.length]} />
          <FitRoute depot={data.depot} stops={data.stops} routeLine={routeLine} />

          {data.depot && (
            <Marker position={[data.depot.lat, data.depot.lng]} icon={depotIcon}>
              <Popup>{data.depot.name || 'Station'}</Popup>
            </Marker>
          )}

          {data.stops.map((stop, i) => (
            <Marker key={stop.id} position={[Number(stop.lat), Number(stop.lng)]} icon={numberedIcon(i + 1)}>
              <Popup>
                <strong>{stop.ref}</strong><br />
                {stop.address}<br />
                {stop.quantity} gallons
              </Popup>
            </Marker>
          ))}

          {routeLine.length > 0 && (
            <Polyline positions={routeLine} pathOptions={{ color: '#0ea5c9', weight: 4 }} />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
