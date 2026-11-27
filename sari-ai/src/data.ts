import type { DateRange } from './reporting';

export type Product = {
  id: string; name: string; category: string; unit: string; price: number;
  cost: number; stock: number; threshold: number;
  photo?: string | null;
};
export type Sale = { id: string; day: string; method: 'cash' | 'credit'; customer: string; total: number; revision?: number };
export type SaleItem = { sale_id: string; product_id: string; quantity: number; price: number; cost: number };
export type Movement = { id: string; day: string; product_id: string; change: number; reason: string; note: string; stock_after: number };
export type Expense = { id: string; day: string; category: string; description: string; amount: number };
export type Payment = { id: string; day: string; customer: string; amount: number };
export type Store = {
  today: string; products: Product[]; sales: Sale[]; items: SaleItem[]; movements: Movement[];
  expenses: Expense[]; payments: Payment[]; ai_configured?: boolean;
};
export type EntryKind = 'sale' | 'product' | 'stock' | 'expense' | 'payment' | 'sale-correction' | 'product-details';
export type Line = { product_id: string; quantity: string; note: string; supplier_cost?: string };
export type Entry = {
  kind: EntryKind;
  inputMode?: 'manual' | 'sari';
  original?: string;
  draftSource?: AskReply['source'];
  day?: string;
  lines?: Line[];
  reason?: 'restock' | 'count' | 'waste';
  customer?: string;
  method?: 'cash' | 'credit';
  description?: string;
  category?: string;
  amount?: string;
  product?: Product;
  sale?: Sale;
};
export type Receipt = {
  saved: boolean; id?: string; total?: number; name?: string; balance?: number; customer?: string;
  method?: Sale['method']; stock?: { product_id: string; name: string; unit: string; change: number; on_hand: number }[];
};
export type Agent = 'recording' | 'insights' | 'forecast' | 'health';
export type AskReply = {
  agent: Agent;
  text: string;
  source: 'external' | 'records' | 'guide';
  reason?: 'unconfigured' | 'unavailable' | 'invalid' | 'busy';
  draft?: Entry;
  clarification?: boolean;
  destination?: 'home' | 'sales' | 'stock' | 'stock/history' | 'stock/planner' | 'expenses' | 'ledger';
  facts?: { label: string; value: string }[];
  matches?: string[];
  view?: RecordView;
};

export type RankedProduct = { id: string; name: string; unit: string; quantity: number; sales: number };
export type StockEvidence = {
  id: string; name: string; unit: string; stock: number; threshold: number;
  sold: number; daily: number | null; days: number | null;
};
export type RecordView = {
  kind: 'overview' | 'expenses' | 'cash' | 'credit' | 'profit' | 'stock' | 'restock';
  start: string; end: string; forecastStart: string; forecastEnd: string;
  sales: number; cashSales: number; creditSales: number; repayments: number;
  expenses: number; gross: number; missingCosts: boolean; outstanding: number;
  products: RankedProduct[]; stocks: StockEvidence[];
  expenseCategories: { category: string; amount: number }[];
  trend: { day: string; sales: number; expenses: number }[];
};

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const dates = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekdays = new Intl.DateTimeFormat('en-PH', { weekday: 'short', timeZone: 'UTC' });
const filipinoDates = new Intl.DateTimeFormat('fil-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const filipinoWeekdays = new Intl.DateTimeFormat('fil-PH', { weekday: 'short', timeZone: 'UTC' });
export const peso = (centavos: number) => money.format(centavos / 100);
export const shortDate = (day: string, language = 'en') => (language === 'fil' ? filipinoDates : dates).format(new Date(day + 'T00:00:00Z'));
export const weekday = (day: string, language = 'en') => (language === 'fil' ? filipinoWeekdays : weekdays).format(new Date(day + 'T00:00:00Z'));
export function shiftDay(day: string, offset: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export const add = <T,>(items: T[], get: (item: T) => number) =>
  items.reduce((total, item) => total + get(item), 0);

export function ledger(store: Store) {
  const customers = new Map<string, number>();
  for (const sale of store.sales) {
    if (sale.method === 'credit') customers.set(sale.customer, (customers.get(sale.customer) ?? 0) + sale.total);
  }
  for (const payment of store.payments) {
    customers.set(payment.customer, (customers.get(payment.customer) ?? 0) - payment.amount);
  }
  return Array.from(customers, ([name, balance]) => ({ name, balance })).sort((a, b) => b.balance - a.balance);
}

export function analyze(store: Store, period: number | DateRange) {
  const end = typeof period === 'number' ? store.today : period.end;
  const length = typeof period === 'number' ? period : Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86_400_000) + 1;
  const start = typeof period === 'number' ? shiftDay(end, 1 - length) : period.start;
  const previousStart = shiftDay(start, -length);
  const sales = store.sales.filter((sale) => sale.day >= start && sale.day <= end);
  const salesIds = new Set(sales.map((sale) => sale.id));
  const items = store.items.filter((item) => salesIds.has(item.sale_id));
  const expenses = store.expenses.filter((expense) => expense.day >= start && expense.day <= end);
  const payments = store.payments.filter((payment) => payment.day >= start && payment.day <= end);
  const currentSales = add(sales, (sale) => sale.total);
  const priorSales = store.sales.filter((sale) => sale.day >= previousStart && sale.day < start);
  const previousSales = add(priorSales, (sale) => sale.total);
  const previousExpenses = add(
    store.expenses.filter((expense) => expense.day >= previousStart && expense.day < start),
    (expense) => expense.amount,
  );
  const currentExpenses = add(expenses, (expense) => expense.amount);
  const datesInPeriod = Array.from({ length }, (_, index) => shiftDay(start, index));
  const trend = datesInPeriod.map((day) => ({
    day,
    sales: add(sales.filter((sale) => sale.day === day), (sale) => sale.total),
    expenses: add(expenses.filter((expense) => expense.day === day), (expense) => expense.amount),
  }));
  const byProduct = store.products.map((product) => {
    const matching = items.filter((item) => item.product_id === product.id);
    return {
      product,
      quantity: add(matching, (item) => item.quantity),
      sales: add(matching, (item) => item.price * item.quantity),
    };
  }).filter((item) => item.quantity > 0).sort((a, b) => b.quantity - a.quantity || b.sales - a.sales);
  const forecasts = forecast(store);
  const missingCosts = store.products.filter((product) => product.cost === 0);
  const adjustment = store.movements.find((m) => m.day >= start && m.reason === 'count' && Math.abs(m.change) >= 10);
  return {
    sales: currentSales, previousSales, expenses: currentExpenses, previousExpenses,
    gross: currentSales - add(items, (item) => item.cost * item.quantity),
    cashSales: add(sales.filter((sale) => sale.method === 'cash'), (sale) => sale.total),
    creditSales: add(sales.filter((sale) => sale.method === 'credit'), (sale) => sale.total),
    repayments: add(payments, (payment) => payment.amount),
    cash: add(sales.filter((sale) => sale.method === 'cash'), (sale) => sale.total)
      + add(payments, (payment) => payment.amount),
    byProduct, trend, forecasts, missingCosts, adjustment,
    low: forecasts.filter(({ product }) => product.stock <= product.threshold),
    count: sales.length,
    expenseCategories: Array.from(new Set(expenses.map(({ category }) => category)), (category) => ({
      category,
      amount: add(expenses.filter((expense) => expense.category === category), (expense) => expense.amount),
    })).sort((a, b) => b.amount - a.amount),
  };
}

export function forecast(store: Store) {
  const start = shiftDay(store.today, -7);
  const recentIds = new Map(store.sales.filter((s) => s.day >= start && s.day < store.today)
    .map((s) => [s.id, s.day]));
  return store.products.map((product) => {
    const itemSales = store.items.filter((item) => item.product_id === product.id && recentIds.has(item.sale_id));
    const observedDays = new Set(itemSales.map((item) => recentIds.get(item.sale_id))).size;
    const daily = observedDays >= 3 ? add(itemSales, (item) => item.quantity) / 7 : null;
    const days = product.stock === 0 ? 0 : daily ? product.stock / daily : null;
    return { product, daily, days };
  }).sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
}

export function runout(days: number | null, language = 'en') {
  if (language === 'fil') {
    if (days === null) return 'Kulang ang tala ng benta';
    if (days === 0) return 'Ubos na';
    if (days < 1) return 'Wala pang isang araw';
    return `Mga ${Math.round(days)} araw`;
  }
  if (days === null) return 'More sales history needed';
  if (days === 0) return 'Out of stock';
  if (days < 1) return 'Less than 1 day of stock';
  return `About ${Math.round(days)} ${Math.round(days) === 1 ? 'day' : 'days'} of stock`;
}

export async function api<T>(route: string, entry?: object): Promise<T> {
  const response = await fetch('/api/v1/' + route, entry ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  } : { cache: 'no-store' });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    const details = typeof problem.detail === 'string' ? problem.detail : problem.detail?.[0]?.msg;
    throw new Error(details ?? 'The store is unavailable. Try again in a moment.');
  }
  return response.json();
}

export const stockExample = 'Coffee sachets, 20\nInstant noodles, 12, From notebook';

export function readStockNotes(text: string, products: Product[]) {
  const rows = text.trim().split(/\r?\n/).filter((line) => line.trim());
  if (!rows.length) throw new Error('Enter at least one stock line.');
  if (rows.length > 50) throw new Error('Enter up to 50 products at a time.');
  return rows.map((row, index) => {
    const [name, quantity, ...notes] = row.split(',').map((part) => part.trim());
    const matching = products.filter((product) => product.name.toLowerCase() === name.toLowerCase());
    if (matching.length !== 1) throw new Error(`Line ${index + 1}: choose an exact product name from Stock.`);
    if (!quantity || !/^\d+$/.test(quantity) || Number(quantity) > 1_000_000) {
      throw new Error(`Line ${index + 1}: enter a whole quantity between 0 and 1,000,000.`);
    }
    return { product_id: matching[0].id, quantity: String(Number(quantity)), note: notes.join(', ') };
  });
}
