import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
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
    <div className="flex h-full gap-4">
      {/* Sidebar: ordered stop list */}
      <div className="w-80 shrink-0 bg-white rounded-2xl shadow-sm p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[#0f172a]">Delivery Route</h2>
          <button
            onClick={load}
            className="text-xs text-[#0ea5c9] font-semibold hover:underline"
          >
            Refresh
          </button>
        </div>

        {loading && <p className="text-sm text-gray-400">Calculating best route...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!loading && !error && data.stops.length === 0 && (
          <p className="text-sm text-gray-400">No pending deliveries with a mapped address right now.</p>
        )}

        <ol className="space-y-3">
          {data.stops.map((stop, i) => (
            <li key={stop.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <span className="w-6 h-6 shrink-0 rounded-full bg-[#0ea5c9] text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0f172a]">{stop.ref}</p>
                  <p className="text-xs text-gray-400 truncate">{stop.address}</p>
                  <p className="text-xs text-gray-400">{stop.quantity} gal • {stop.status}</p>
                </div>
              </div>
              <button
                onClick={() => markDelivered(stop.id)}
                className="mt-2 w-full text-xs font-semibold text-[#0ea5c9] border border-[#0ea5c9]/40 rounded-lg py-1.5 hover:bg-[#0ea5c9]/10"
              >
                Mark Delivered
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* Map */}
      <div className="flex-1 rounded-2xl overflow-hidden shadow-sm">
        <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution={CARTO_ATTRIBUTION} url={cartoVoyagerUrl()} />

          {data.depot && (
            <Marker position={[data.depot.lat, data.depot.lng]} icon={depotIcon}>
              <Popup>{data.depot.name || 'Station'}</Popup>
            </Marker>
          )}

          {data.stops.map((stop, i) => (
            <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={numberedIcon(i + 1)}>
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
