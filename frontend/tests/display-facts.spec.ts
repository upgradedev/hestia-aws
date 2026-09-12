import { test, expect } from '@playwright/test';
import { recordedRepairCost, purchaseTimeline } from '../src/displayFacts';

test('HE8 repair display preserves changed and zero facts without inventing amounts', () => {
  expect(recordedRepairCost(7391)).toBe('€73.91 recorded repair cost');
  expect(recordedRepairCost(0)).toBe('€0.00 recorded repair cost');
  for (const invalid of [undefined, null, -1, 0.5, NaN, Infinity, '18500']) {
    expect(recordedRepairCost(invalid)).toBe('Repair amount not recorded');
  }
});

test('HE7 purchase illustration validates calendar facts and keeps unknown distinct from zero', () => {
  expect(purchaseTimeline('2024-09-13', '2026-09-12', 24)).toEqual({ months: 23, percent: 23 / 24 * 100 });
  expect(purchaseTimeline('2024-09-13', '2026-09-13', 24)).toEqual({ months: 24, percent: 100 });
  expect(purchaseTimeline('2024-09-13', '2028-09-13', 24)?.percent).toBe(100);
  expect(purchaseTimeline('2024-02-29', '2024-03-29', 24)?.months).toBe(1);
  for (const [purchase, reference, months] of [
    ['2024-02-30', '2026-09-12', 24], ['2024-09-13', '2024-09-12', 24],
    ['unknown', '2026-09-12', 24], ['2024-09-13', 'bad', 24],
    ['2024-09-13', '2026-09-12', 0], ['2024-09-13', '2026-09-12', NaN],
  ] as const) expect(purchaseTimeline(purchase, reference, months)).toBeNull();
});
