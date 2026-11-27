import type { CSSProperties, ReactNode } from 'react';
import { peso, shortDate, weekday } from './data';
import { useLanguage } from './language';

const icons = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  sales: 'M5 3h14v18l-3-2-4 2-4-2-3 2zm4 5h6m-6 4h6',
  stock: 'm3 7 9-4 9 4v10l-9 4-9-4zm0 0 9 4 9-4m-9 4v10m-4.5-16L17 9',
  ai: 'M12 2 9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5zM19 2v4m-2-2h4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  microphone: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8',
  camera: 'M3 7h4l2-3h6l2 3h4v14H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ledger: 'M5 4h14v16H5zM8 4v16m3-11h5m-5 4h5',
  expense: 'M4 6h16v12H4zM4 10h16m-12 4h3',
  plus: 'M12 5v14m-7-7h14',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  trend: 'm3 17 6-6 4 4 7-8m-5 0h5v5',
  coins: 'M3 7c0-2 3-3 7-3s7 1 7 3-3 3-7 3-7-1-7-3zm0 0v5c0 2 3 3 7 3m-7-3v5c0 2 3 3 7 3m7-13v2m-4 5c0-1.5 2-2.5 4.5-2.5S22 12.5 22 14s-2 2.5-4.5 2.5S13 15.5 13 14zm0 0v4c0 1.5 2 2.5 4.5 2.5S22 19.5 22 18v-4',
  alert: 'M12 4 2 21h20zm0 6v4m0 3v.2',
  calendar: 'M4 5h16v15H4zm4-2v4m8-4v4M4 10h16',
  shop: 'M4 10v10h16V10M3 10l2-6h14l2 6zm6 10v-6h6v6',
  search: 'M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2 5 5',
  clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-14v5l3 2',
  edit: 'm14 5 5 5M4 20l5-1L20 8l-4-4L5 15z',
  check: 'm5 12 4 4 10-10',
  close: 'm6 6 12 12M18 6 6 18',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  clipboard: 'M9 5H5v16h14V5h-4M9 3h6v4H9zm0 9h6m-6 4h6',
  chevron: 'm9 6 6 6-6 6',
  back: 'M19 12H5m6 6-6-6 6-6',
  info: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-10v5m0-8v.2',
  coffee: 'M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zm13 1h2a2 2 0 0 1 0 4h-2M7 5V3m4 2V2m4 3V3',
  water: 'M9 3h6v4l3 4v10H6V11l3-4zm0 4h6M6 13h12',
  pantry: 'M4 12h16l-3 7H7zm4-3c0-2 2-2 2-4m2 4c0-2 2-2 2-4m2 4c0-2 2-2 2-4',
} as const;
export type IconName = keyof typeof icons;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]} /></svg>;
}

export function Panel({ title, detail, action, children, className = '' }: {
  title: string; detail?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={'panel ' + className}>
    <div className="panel-header"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>
    {children}
  </section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function SummaryCards({ items }: { items: {
  label: string; value: string; detail?: string; tone?: 'blue' | 'yellow';
}[] }) {
  return <div className="summary-cards">{items.map(item => <section key={item.label}
    className={'summary-card' + (item.tone ? ' summary-' + item.tone : '')}>
    <h2>{item.label}</h2><strong>{item.value}</strong>{item.detail && <p>{item.detail}</p>}
  </section>)}</div>;
}

export function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="delta neutral">No prior-period baseline</span>;
  const percentage = ((current - previous) / previous) * 100;
  const sign = percentage >= 0 ? '+' : '−';
  return <span className={percentage > 0 ? 'delta positive' : 'delta neutral'}>
    {sign}{Math.abs(percentage).toFixed(1)}% <span>vs. prior period</span>
  </span>;
}

export function SalesChart({ trend, showExpenses = true }: { trend: { day: string; sales: number; expenses: number }[]; showExpenses?: boolean }) {
  const { t, language } = useLanguage();
  const max = Math.max(40000, ...trend.flatMap((day) => [day.sales, showExpenses ? day.expenses : 0]));
  const axisStep = Math.ceil(max / 40000) * 10000;
  const limit = axisStep * 4;
  return <div className={'chart' + (showExpenses ? '' : ' sales-only')}>
    <div className="chart-key"><span><i /> {t('Sales', 'Benta')}</span>{showExpenses && <span><i /> {t('Operating Expenses', 'Gastos sa Operasyon')}</span>}</div>
    <div className="chart-body">
      <div className="chart-axis" aria-hidden="true">{[4, 3, 2, 1, 0].map((step) =>
        <span key={step}>₱{(axisStep * step / 100).toLocaleString('en-PH')}</span>)}</div>
      <div className="chart-plot">
        <div className="chart-grid" aria-hidden="true">{[0, 1, 2, 3, 4].map((step) => <i key={step} />)}</div>
        <div className="bar-groups" style={{ '--days': trend.length } as CSSProperties}>
          {trend.map((day) => <div className="bar-group" key={day.day} tabIndex={0}
            aria-label={`${shortDate(day.day, language)}: ${t('Sales', 'Benta')} ${peso(day.sales)}${showExpenses ? ', ' + t('Operating Expenses', 'Gastos sa Operasyon') + ' ' + peso(day.expenses) : ''}`}>
            <div className="bars">
              <i style={{ height: `${day.sales / limit * 100}%` }} />
              {showExpenses && <i style={{ height: `${day.expenses / limit * 100}%` }} />}
            </div>
            <span className="bar-label">{trend.length <= 7 ? weekday(day.day, language) : shortDate(day.day, language)}</span>
            <span className="chart-tip">{shortDate(day.day, language)}<br />{t('Sales', 'Benta')} {peso(day.sales)}{showExpenses && <><br />{t('Expenses', 'Gastos')} {peso(day.expenses)}</>}</span>
          </div>)}
        </div>
      </div>
    </div>
  </div>;
}
