/** Format PHP amounts as ₱1,234.56 (always 2 decimal places). */
export function formatMoney(value) {
  const n = Number(value);
  const amount = Number.isFinite(n) ? n : 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Safe numeric sum for money fields that may arrive as strings from MySQL. */
export function sumMoney(items, pick) {
  return (items || []).reduce((sum, item) => {
    const n = Number(typeof pick === 'function' ? pick(item) : item?.[pick]);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}
