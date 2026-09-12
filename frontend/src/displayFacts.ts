// Presentation helpers do not determine legal eligibility.
export function recordedRepairCost(cents: unknown): string {
  return typeof cents === 'number' && Number.isSafeInteger(cents) && cents >= 0
    ? `€${(cents / 100).toFixed(2)} recorded repair cost`
    : 'Repair amount not recorded';
}

function calendarDate(value: string): Date | null {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(day + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? date : null;
}

export function purchaseTimeline(purchaseDate: string, referenceDate: string, duration: number) {
  const purchase = calendarDate(purchaseDate);
  const reference = calendarDate(referenceDate);
  if (!purchase || !reference || reference < purchase || !Number.isSafeInteger(duration) || duration <= 0) return null;
  const months = (reference.getUTCFullYear() - purchase.getUTCFullYear()) * 12
    + reference.getUTCMonth() - purchase.getUTCMonth()
    - (reference.getUTCDate() < purchase.getUTCDate() ? 1 : 0);
  return { months, percent: Math.min(100, months / duration * 100) };
}
