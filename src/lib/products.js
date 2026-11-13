/** Retail catalog for Request Service — prices match station stock SKUs. */
export const SERVICE_PRODUCTS = [
  {
    id: 'refill-slim',
    label: 'Gallon Refill Only (Slim/Round)',
    shortLabel: 'Refill · Slim/Round',
    price: 25,
    kind: 'refill',
    shape: 'slim',
  },
  {
    id: 'new-slim',
    label: 'New Gallon Container w/ Water (Slim/Round)',
    shortLabel: 'New jug · Slim/Round',
    price: 200,
    kind: 'new',
    shape: 'slim',
  },
  {
    id: 'refill-square',
    label: 'Gallon Refill Only (Square)',
    shortLabel: 'Refill · Square',
    price: 30,
    kind: 'refill',
    shape: 'square',
  },
  {
    id: 'new-square',
    label: 'New Gallon Container w/ Water (Square)',
    shortLabel: 'New jug · Square',
    price: 220,
    kind: 'new',
    shape: 'square',
  },
];

export const DEFAULT_PRODUCT_ID = 'refill-slim';

/** AguaDoc refill station (same depot used for routing). */
export const REFILL_STATION = {
  lat: 10.3157,
  lng: 123.9740,
  name: 'AguaDoc Station',
};

export const REFILL_TRIP_STEPS = [
  { id: 'pickup', label: 'Pickup empty', hint: 'Collect jug from customer' },
  { id: 'to_station', label: 'To station', hint: 'Refill at AguaDoc' },
  { id: 'deliver', label: 'Return deliver', hint: 'Bring filled jug back' },
];

export function getServiceProduct(productId) {
  return SERVICE_PRODUCTS.find((p) => p.id === productId) || SERVICE_PRODUCTS[0];
}

export function isRefillProduct(productId) {
  const p = getServiceProduct(productId);
  return p?.kind === 'refill' || String(productId || '').startsWith('refill-');
}

export function isRefillOrder(order) {
  return isRefillProduct(order?.productId) || String(order?.productLabel || '').toLowerCase().includes('refill');
}
