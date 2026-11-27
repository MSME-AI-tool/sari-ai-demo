export const pages = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'sales', label: 'Sales', icon: 'sales' },
  { id: 'stock', label: 'Stock', icon: 'stock' },
  { id: 'forecasting', label: 'Forecasting', icon: 'trend' },
  { id: 'ask', label: 'Ask Sari', icon: 'ai' },
  { id: 'more', label: 'More', icon: 'more' },
] as const;
export const records = [
  { id: 'expenses', label: 'Expenses', icon: 'expense' },
  { id: 'ledger', label: 'Ledger', icon: 'ledger' },
] as const;
export const allPages = [...pages, ...records,
  { id: 'stock-history', label: 'Stock History', icon: 'clock' },
  { id: 'sales-history', label: 'Sales History', icon: 'clock' },
  { id: 'restock-planner', label: 'Restock Planner', icon: 'clipboard' },
] as const;
export type Page = typeof allPages[number]['id'];
export type SalesPeriod = '1' | '3' | '7' | '14' | 'month' | '6months' | 'all' | 'complete7';
export type Route = { page: Page; productId?: string; movementId?: string; saleId?: string; period?: SalesPeriod; range?: DateRange; homeView?: string };

function decode(value = '') {
  try { return decodeURIComponent(value); } catch { return ''; }
}
export function resolveRoute(hash: string): Route {
  const [root, section, value, detail, last] = hash.replace(/^#/, '').split('/');
  if (root === 'home' && ['products', 'money', 'stock'].includes(section)) return { page: 'home', homeView: section };
  if (root === 'stock' && section === 'history')
    return { page: 'stock-history', productId: decode(value), movementId: decode(detail) };
  if (root === 'stock' && section === 'planner' || root === 'forecasting' && section)
    return { page: 'restock-planner', productId: decode(root === 'stock' || section === 'planner' ? value : section) };
  if (root === 'sales' && ['history', 'entry', 'period'].includes(section)) {
    const action = section === 'history' ? value : section;
    const argument = section === 'history' ? detail : value;
    if (action === 'entry') return { page: 'sales-history', saleId: decode(argument), period: 'all' };
    if (action === 'range') return { page: 'sales-history', range: { start: detail, end: last } };
    const period: SalesPeriod = action === 'complete' && argument === '7' ? 'complete7'
      : ['1', '3', '7', '14', 'month', '6months', 'all'].includes(argument) ? argument as SalesPeriod : '7';
    return { page: 'sales-history', period };
  }
  return { page: pages.some(page => page.id === root) || records.some(page => page.id === root) ? root as Page : 'home' };
}
import type { DateRange } from './reporting';
