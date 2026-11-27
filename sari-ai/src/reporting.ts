import type { Store } from './data';

export type DateRange = { start: string; end: string };
export type Grouping = 'day' | 'week' | 'month';
export type ReportPreset = 'today' | '3days' | 'week' | 'month' | '6months' | 'custom' | 'all' | '14days' | 'past7';
const DAY = 86_400_000;
export function shiftDate(day: string, count: number) {
  return new Date(Date.parse(day + 'T00:00:00Z') + count * DAY).toISOString().slice(0, 10);
}
export function rangeDays(range: DateRange) { return Math.round((Date.parse(range.end) - Date.parse(range.start)) / DAY) + 1; }
export function validDate(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(day + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}
export function validateRange(range: DateRange, today: string) {
  return validDate(range.start) && validDate(range.end) && range.start <= range.end && range.end <= today && rangeDays(range) <= 36_600;
}
function monthsAgo(day: string, count: number) {
  const date = new Date(day + 'T00:00:00Z');
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - count, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
}
export function periodRange(today: string, preset: ReportPreset, earliest = today): DateRange {
  if (preset === 'past7') return { start: shiftDate(today, -7), end: shiftDate(today, -1) };
  const lengths: Partial<Record<ReportPreset, number>> = { today: 1, '3days': 3, week: 7, '14days': 14 };
  const start = preset === 'all' ? earliest : preset === 'month' || preset === '6months'
    ? shiftDate(monthsAgo(today, preset === 'month' ? 1 : 6), 1)
    : shiftDate(today, 1 - (lengths[preset] ?? 7));
  return { start, end: today };
}
export function earliestRecord(store: Store) {
  return [...store.sales, ...store.expenses, ...store.payments, ...store.movements].reduce((day, row) => row.day < day ? row.day : day, store.today);
}
export function groupKey(day: string, group: Grouping) {
  if (group === 'month') return day.slice(0, 7) + '-01';
  if (group === 'week') return shiftDate(day, -((new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7));
  return day;
}
export function dateBuckets(range: DateRange, group: Grouping) {
  const buckets: string[] = [];
  for (let day = groupKey(range.start, group); day <= range.end;) {
    buckets.push(day);
    if (group === 'month') {
      const date = new Date(day + 'T00:00:00Z'); date.setUTCMonth(date.getUTCMonth() + 1); day = date.toISOString().slice(0, 10);
    } else day = shiftDate(day, group === 'week' ? 7 : 1);
  }
  return buckets;
}
export function bucketLabel(day: string, group: Grouping, language = 'en') {
  return new Date(day + 'T00:00:00Z').toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH',
    { month: 'short', ...(group !== 'month' ? { day: 'numeric' } : { year: 'numeric' }), timeZone: 'UTC' });
}
export function autoGrouping(range: DateRange): Grouping { return rangeDays(range) > 120 ? 'month' : rangeDays(range) > 31 ? 'week' : 'day'; }
export function productSeries(store: Store, range: DateRange, group: Grouping, top?: number) {
  const buckets = dateBuckets(range, group);
  const index = new Map(buckets.map((day, i) => [day, i]));
  const sales = new Map(store.sales.filter(sale => sale.day >= range.start && sale.day <= range.end).map(sale => [sale.id, sale.day]));
  const products = new Map(store.products.map(product => [product.id, product]));
  const rows = new Map<string, { id: string; name: string; values: number[] }>();
  for (const item of store.items) {
    const day = sales.get(item.sale_id), product = products.get(item.product_id);
    if (!day || !product) continue;
    const row = rows.get(product.id) ?? { id: product.id, name: product.name, values: buckets.map(() => 0) };
    row.values[index.get(groupKey(day, group))!] += item.price * item.quantity;
    rows.set(product.id, row);
  }
  const ranked = [...rows.values()].sort((a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0));
  return { buckets, series: top ? ranked.slice(0, top) : ranked };
}
export function totalSeries(trend: { day: string; sales: number; expenses: number }[], range: DateRange, group: Grouping) {
  const buckets = dateBuckets(range, group), values = buckets.map(() => 0);
  const index = new Map(buckets.map((day, i) => [day, i]));
  for (const row of trend) values[index.get(groupKey(row.day, group))!] += row.sales;
  return { buckets, series: [{ id: 'sales', name: 'Sales', values }] };
}
export function historyRangeLink(range: DateRange) { return '#sales/history/range/' + range.start + '/' + range.end; }
