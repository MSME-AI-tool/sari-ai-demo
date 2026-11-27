import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecast } from '../src/data.ts';

const product = { id: 'coffee', name: 'Coffee', unit: 'sachet', stock: 21, threshold: 5, price: 1000, cost: 600, category: 'Drinks' };
function snapshot(dates) {
  return { today: '2026-11-27', products: [product], sales: dates.map(([day], i) => ({ id: String(i), day, method: 'cash', total: 1 })),
    items: dates.map(([, quantity], i) => ({ sale_id: String(i), product_id: 'coffee', quantity, price: 1000, cost: 600 })),
    movements: [], expenses: [], payments: [] };
}
test('restored forecast averages all seven completed days, excluding today and older records', () => {
  const result = forecast(snapshot([['2026-11-20', 7], ['2026-11-23', 7], ['2026-11-26', 7], ['2026-11-27', 99], ['2026-11-19', 99]]))[0];
  assert.equal(result.daily, 3);
  assert.equal(result.days, 7);
});
test('two selling days or several sales on the same day cannot imply enough history', () => {
  const result = forecast(snapshot([['2026-11-25', 7], ['2026-11-25', 7], ['2026-11-26', 7]]))[0];
  assert.equal(result.daily, null);
  assert.equal(result.days, null);
});
test('empty stock is out of stock even before enough history exists', () => {
  const store = snapshot([]);
  store.products = [{ ...product, stock: 0 }];
  assert.equal(forecast(store)[0].days, 0);
  assert.equal(forecast(store)[0].daily, null);
});
