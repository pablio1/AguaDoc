/** Retail catalog — keep in sync with src/lib/products.js */
const SERVICE_PRODUCTS = [
  {
    id: 'refill-slim',
    label: 'Gallon Refill Only (Slim/Round)',
    price: 25,
    kind: 'refill',
    // Customer jug: pickup → station → return
    stock: [
      { id: 'stk-ref-slim', qty: 1 },
      { id: 'stk-caps', qty: 1 },
      { id: 'stk-seals', qty: 1 },
    ],
  },
  {
    id: 'new-slim',
    label: 'New Gallon Container w/ Water (Slim/Round)',
    price: 200,
    kind: 'new',
    // One-way: station → customer
    stock: [
      { id: 'stk-gal-slim', qty: 1 },
      { id: 'stk-ref-slim', qty: 1 },
      { id: 'stk-caps', qty: 1 },
      { id: 'stk-seals', qty: 1 },
    ],
  },
  {
    id: 'refill-square',
    label: 'Gallon Refill Only (Square)',
    price: 30,
    kind: 'refill',
    stock: [
      { id: 'stk-ref-square', qty: 1 },
      { id: 'stk-caps', qty: 1 },
      { id: 'stk-seals', qty: 1 },
    ],
  },
  {
    id: 'new-square',
    label: 'New Gallon Container w/ Water (Square)',
    price: 220,
    kind: 'new',
    stock: [
      { id: 'stk-gal-square', qty: 1 },
      { id: 'stk-ref-square', qty: 1 },
      { id: 'stk-caps', qty: 1 },
      { id: 'stk-seals', qty: 1 },
    ],
  },
];

const DEFAULT_PRODUCT_ID = 'refill-slim';
const REFILL_TRIP_LEGS = ['pickup', 'to_station', 'deliver'];

function getServiceProduct(productId) {
  return SERVICE_PRODUCTS.find((p) => p.id === productId)
    || SERVICE_PRODUCTS.find((p) => p.id === DEFAULT_PRODUCT_ID);
}

function isRefillProduct(productId) {
  const p = getServiceProduct(productId);
  return p?.kind === 'refill' || String(productId || '').startsWith('refill-');
}

/** Initial trip leg when rider starts an out-for-delivery run. */
function initialTripLeg(productId) {
  return isRefillProduct(productId) ? 'pickup' : 'deliver';
}

/** Stock lines to deduct for one gallon of this product × order quantity. */
function stockDeductionsForOrder(productId, quantity) {
  const product = getServiceProduct(productId);
  const qty = Math.max(0, parseInt(quantity, 10) || 0);
  if (!product || qty < 1) return [];
  return product.stock.map((line) => ({
    id: line.id,
    qty: line.qty * qty,
  }));
}

module.exports = {
  SERVICE_PRODUCTS,
  DEFAULT_PRODUCT_ID,
  REFILL_TRIP_LEGS,
  getServiceProduct,
  isRefillProduct,
  initialTripLeg,
  stockDeductionsForOrder,
};
