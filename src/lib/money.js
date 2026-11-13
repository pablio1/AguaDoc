/** Round to cents (2 decimal places) — use for all debt / payment math. */
export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Format PHP amounts as ₱1,234.56 (always 2 decimal places). */
export function formatMoney(value) {
  const amount = roundMoney(value);
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Safe numeric sum for money fields that may arrive as strings from MySQL. */
export function sumMoney(items, pick) {
  const total = (items || []).reduce((sum, item) => {
    const n = Number(typeof pick === 'function' ? pick(item) : item?.[pick]);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  return roundMoney(total);
}
