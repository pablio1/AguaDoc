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

export function getServiceProduct(productId) {
  return SERVICE_PRODUCTS.find((p) => p.id === productId) || SERVICE_PRODUCTS[0];
}
