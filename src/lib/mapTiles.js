// CARTO basemap tiles require an API key:
// https://carto.com/basemaps/apikey/
// Set VITE_CARTO_API_KEY in the project-root .env file.

const KEY = import.meta.env.VITE_CARTO_API_KEY || '';

function withKey(url) {
  if (!KEY) return url;
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(KEY)}`;
}

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

/** Light basemap — customer order pin, admin delivery route, tracking */
export function cartoVoyagerUrl() {
  return withKey('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png');
}

/** Dark basemap — rider live map */
export function cartoDarkUrl() {
  return withKey('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png');
}

export function hasCartoKey() {
  return Boolean(KEY);
}
