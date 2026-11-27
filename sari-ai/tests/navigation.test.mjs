import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRoute } from '../src/navigation.ts';

test('history URLs resolve to distinct pages and preserve existing evidence links', () => {
  assert.equal(resolveRoute('#stock').page, 'stock');
  assert.deepEqual(resolveRoute('#stock/history/product%20one/move-2'), { page: 'stock-history', productId: 'product one', movementId: 'move-2' });
  assert.equal(resolveRoute('#sales').page, 'sales');
  assert.deepEqual(resolveRoute('#sales/entry/sale%20one'), { page: 'sales-history', saleId: 'sale one', period: 'all' });
  assert.deepEqual(resolveRoute('#sales/history/entry/sale-2'), { page: 'sales-history', saleId: 'sale-2', period: 'all' });
  assert.equal(resolveRoute('#sales/period/7').period, '7');
  assert.equal(resolveRoute('#sales/history/complete/7').period, 'complete7');
});
test('planner routes open a separate Restock Planner tab with the selected product', () => {
  assert.deepEqual(resolveRoute('#stock/planner/coffee'), { page: 'restock-planner', productId: 'coffee' });
  assert.deepEqual(resolveRoute('#forecasting/coffee'), { page: 'restock-planner', productId: 'coffee' });
  assert.deepEqual(resolveRoute('#forecasting/planner/coffee'), { page: 'restock-planner', productId: 'coffee' });
  assert.equal(resolveRoute('#forecasting').page, 'forecasting');
  assert.deepEqual(resolveRoute('#home/money'), { page: 'home', homeView: 'money' });
  assert.deepEqual(resolveRoute('#sales/history/range/2026-01-01/2026-06-30').range, { start: '2026-01-01', end: '2026-06-30' });
});
test('malformed links cannot crash route rendering or select arbitrary periods', () => {
  assert.equal(resolveRoute('#stock/history/%E0%A4%A').productId, '');
  assert.equal(resolveRoute('#sales/history/period/999').period, '7');
  assert.equal(resolveRoute('#unknown').page, 'home');
});
