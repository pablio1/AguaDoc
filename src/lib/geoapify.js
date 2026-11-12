/** Geoapify + MapLibre helpers */

export const GEO_ATTRIBUTION =
  'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> © OpenStreetMap contributors';

export const DEFAULT_CENTER = { lat: 10.3157, lng: 123.9740 }; // Lapu-Lapu

export function geoStyleUrl(apiKey, theme = 'light') {
  if (!apiKey) return null;
  const style = theme === 'dark' ? 'dark-matter' : 'osm-bright';
  return `https://maps.geoapify.com/v1/styles/${style}/style.json?apiKey=${encodeURIComponent(apiKey)}`;
}

/** Raster basemap when Geoapify key is missing or style fails to load */
export function fallbackStyle(theme = 'light') {
  const tiles = theme === 'dark'
    ? [
        'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ]
    : [
        'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ];
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles,
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

/** Convert OSRM-style [lng,lat][] or Leaflet [lat,lng][] into MapLibre LineString coords [lng,lat][] */
export function toLineCoords(geometry = [], format = 'lnglat') {
  return (geometry || [])
    .map((p) => {
      if (!Array.isArray(p) || p.length < 2) return null;
      const a = Number(p[0]);
      const b = Number(p[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return format === 'latlng' ? [b, a] : [a, b];
    })
    .filter(Boolean);
}

export function lineFeature(coords) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  };
}

export function emptyLineCollection() {
  return { type: 'FeatureCollection', features: [] };
}
