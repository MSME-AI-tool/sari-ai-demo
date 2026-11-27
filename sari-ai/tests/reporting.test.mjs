import assert from 'node:assert/strict';
import { test } from 'node:test';
import { periodRange, validateRange, rangeDays, groupKey, productSeries } from '../src/reporting.ts';
import { analyze } from '../src/data.ts';

test('report presets are inclusive and calendar months handle leap years and month ends', () => {
  assert.deepEqual(periodRange('2026-11-27', '3days'), { start: '2026-11-25', end: '2026-11-27' });
  assert.deepEqual(periodRange('2026-11-27', 'week'), { start: '2026-11-21', end: '2026-11-27' });
  assert.deepEqual(periodRange('2024-03-31', 'month'), { start: '2024-03-01', end: '2024-03-31' });
  assert.deepEqual(periodRange('2026-11-27', '6months'), { start: '2026-05-28', end: '2026-11-27' });
  assert.equal(rangeDays({ start: '2024-02-28', end: '2024-03-01' }), 3);
});
test('invalid, reversed and future dates are rejected', () => {
  for (const range of [{ start: '2026-02-30', end: '2026-03-02' }, { start: '2026-04-01', end: '2026-03-01' }, { start: '', end: '' }, { start: '2026-11-27', end: '2026-11-28' }])
    assert.equal(validateRange(range, '2026-11-27'), false);
});
test('weekly buckets begin Monday and monthly buckets preserve year boundaries', () => {
  assert.equal(groupKey('2026-11-27', 'week'), '2026-11-23');
  assert.equal(groupKey('2026-01-01', 'month'), '2026-01-01');
});
const store = { today: '2026-11-27', products: Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: 'Item ' + i, price: 100, cost: 40, unit: 'pack', stock: 20, threshold: 2 })),
  sales: [{ id: 'a', day: '2026-10-02', total: 700, method: 'cash' }, { id: 'b', day: '2026-10-05', total: 200, method: 'credit' }, { id: 'c', day: '2026-11-27', total: 300, method: 'cash' }],
  items: [...Array.from({ length: 7 }, (_, i) => ({ sale_id: 'a', product_id: String(i), quantity: 1, price: 100, cost: 40 })), { sale_id: 'b', product_id: '0', quantity: 2, price: 100, cost: 40 }],
  expenses: [{ day: '2026-10-05', category: 'Rent', amount: 300 }], payments: [], movements: [] };
test('custom historical reports use the selected end date for every financial figure', () => {
  const report = analyze(store, { start: '2026-10-01', end: '2026-10-31' });
  assert.equal(report.sales, 900);
  assert.equal(report.expenses, 300);
  assert.equal(report.cashSales, 700);
  assert.equal(report.creditSales, 200);
  assert.equal(report.trend.length, 31);
  assert.equal(report.trend.at(-1).day, '2026-10-31');
});
test('history chart includes every relevant product and fills empty date buckets', () => {
  const chart = productSeries(store, { start: '2026-10-01', end: '2026-10-31' }, 'week');
  assert.equal(chart.series.length, 7);
  assert.equal(chart.buckets.length, 5);
  assert.equal(chart.series[0].values.reduce((sum, value) => sum + value, 0), 300);
  assert.equal(chart.series[6].values.reduce((sum, value) => sum + value, 0), 100);
  assert.equal(chart.series[0].values.at(-1), 0);
});
