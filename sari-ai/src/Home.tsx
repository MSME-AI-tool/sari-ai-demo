import { useState } from 'react';
import { add, analyze, ledger, peso, shiftDay, shortDate, weekday } from './data';
import type { Entry, Store } from './data';
import { Icon } from './ui';
import Notebook from './Notebook';
import { StoreHealth } from './StoreTools';
import { useLanguage } from './language';
import { Collections, ExpenseBreakdown, ProductRanking, StockPriority } from './RecordViews';

function DailySales({ trend }: { trend: ReturnType<typeof analyze>['trend'] }) {
  const { t, language } = useLanguage();
  const peak = Math.max(10000, Math.ceil(Math.max(...trend.map(p => p.sales)) / 10000) * 10000);
  const coordinates = trend.map((p, i) => [8 + i * 584 / Math.max(1, trend.length - 1), 126 - 118 * p.sales / peak]);
  const last = coordinates[coordinates.length - 1];
  return <figure className="daily-sales"><figcaption>{t('Daily sales', 'Benta bawat araw')}</figcaption>
    <div className="line-plot"><div className="tick-labels"><span>{peso(peak)}</span><span>{peso(peak / 2)}</span><span>₱0</span></div>
    <svg viewBox="0 0 600 134" preserveAspectRatio="none" role="img" aria-label={trend.map(p => weekday(p.day, language) + ' ' + peso(p.sales)).join(', ')}>
      {[8,67,126].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--line)" />)}
      <polyline points={coordinates.map(point => point.join(',')).join(' ')} fill="none" stroke="var(--teal)" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
      <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--teal)"/>
    </svg></div><div className="day-labels">{trend.map((p, i) => ({ ...p, index: i }))
      .filter(p => trend.length <= 7 || p.index % 4 === 0 && p.index < trend.length - 2 || p.index === trend.length - 1)
      .map(p => <span key={p.day} style={{ left: `${p.index / Math.max(1, trend.length - 1) * 100}%` }}>
        {trend.length <= 7 ? weekday(p.day, language) : shortDate(p.day, language)}</span>)}</div></figure>;
}

export default function Home({ store, open }: { store: Store; open: (entry: Entry) => void }) {
  const { t, language } = useLanguage();
  const [period, setPeriod] = useState(7);
  const day = analyze(store, 1);
  const report = analyze(store, period);
  const delta = day.sales - day.previousSales;
  const outstanding = add(ledger(store), row => row.balance);
  const priorities = [...report.forecasts].sort((a, b) =>
    Number(b.product.stock <= b.product.threshold || (b.days !== null && b.days < 3)) -
    Number(a.product.stock <= a.product.threshold || (a.days !== null && a.days < 3)) ||
    (a.days ?? Infinity) - (b.days ?? Infinity));
  const forecastStart = shiftDay(store.today, -7);
  const historyIds = new Set(store.sales.filter(s => s.day >= forecastStart && s.day < store.today).map(s => s.id));
  const stockEvidence = priorities.map(row => ({
    ...row.product, daily: row.daily, days: row.days,
    sold: add(store.items.filter(i => i.product_id === row.product.id && historyIds.has(i.sale_id)), i => i.quantity),
  }));
  const names = new Map(store.products.map(p => [p.id, p.name]));
  const date = new Date(store.today + 'T12:00:00Z').toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const recordSale = () => open({ kind: 'sale' });
  return <div className="overview">
    <header className="page-heading"><div><h1><span className="home-title-desktop">{t('Store overview', 'Buod ng tindahan')}</span>
      <span className="mobile-only">{t('Your Store', 'Ang Tindahan Mo')}</span></h1><p>{date}</p></div>
      <button className="button primary desktop-only" onClick={recordSale}><Icon name="plus" />{t('Record sale', 'Itala ang benta')}</button></header>
    <div className="overview-period">
      <div><h2>{t('Your store in numbers', 'Ang tindahan sa mga bilang')}</h2>
        <p>{shortDate(shiftDay(store.today, 1 - period), language)}–{shortDate(store.today, language)}</p></div>
      <label>{t('Chart period', 'Saklaw ng mga graph')}<select value={period} onChange={event => setPeriod(Number(event.target.value))}>
        <option value={1}>{t('Today', 'Ngayon')}</option><option value={7}>{t('Last 7 days', 'Huling 7 araw')}</option>
        <option value={14}>{t('Last 14 days', 'Huling 14 araw')}</option>
      </select></label>
    </div>
    <section className="summary-spread"><div className="day-total"><h2>{t('Today’s sales', 'Benta ngayong araw')}</h2><strong>{peso(day.sales)}</strong>
      <p>{delta === 0 ? t('Same as yesterday', 'Katulad ng kahapon') : peso(Math.abs(delta)) +
        (delta > 0 ? t(' above yesterday', ' na mas mataas kaysa kahapon') : t(' below yesterday', ' na mas mababa kaysa kahapon'))}</p></div>
      <div className="spending">{t('Expenses today', 'Gastos ngayong araw')} <strong>{peso(day.expenses)}</strong></div>
      <button className="button primary mobile-only home-sale" onClick={recordSale}>
        <Icon name="plus" size={18} />{t('Record sale', 'Itala ang benta')}
      </button>
      <DailySales trend={report.trend} />
    </section>
    <div className="dashboard-grid">
      <section className="dashboard-section"><ProductRanking products={report.byProduct.map(row => ({
        id: row.product.id, name: row.product.name, unit: row.product.unit, quantity: row.quantity, sales: row.sales,
      }))} /><a className="evidence-link" href={'#sales/period/' + period}>{t('Review sales', 'Suriin ang benta')} →</a></section>
      <section className="dashboard-section"><Collections cashSales={report.cashSales} creditSales={report.creditSales}
        repayments={report.repayments} outstanding={outstanding} end={store.today} />
        <a className="evidence-link" href="#ledger">{t('Review credit and repayments', 'Suriin ang utang at bayad')} →</a></section>
      <section className="dashboard-section"><ExpenseBreakdown categories={report.expenseCategories} />
        <a className="evidence-link" href="#expenses">{t('Review expenses', 'Suriin ang gastos')} →</a></section>
      <section className="dashboard-section"><StockPriority stocks={stockEvidence} start={forecastStart} end={shiftDay(store.today, -1)} />
        <a className="evidence-link" href="#stock/planner">{t('Plan a restock', 'Planuhin ang dagdag na stock')} →</a></section>
    </div>
    <div className="book-spread"><section className="recent"><header><h2>{t('Recent sales', 'Mga huling benta')}</h2><a href="#sales">{t('View all', 'Tingnan lahat')}</a></header>
      <table><thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Product', 'Item')}</th><th>{t('Qty', 'Bilang')}</th><th>{t('Amount', 'Halaga')}</th></tr></thead>
        <tbody>{store.sales.slice(0, 4).map(s => {
          const items = store.items.filter(i => i.sale_id === s.id);
          return <tr key={s.id}><td>{shortDate(s.day, language)}</td><td>{items.map(i => names.get(i.product_id)).join(', ')}</td><td>{add(items,i => i.quantity)}</td><td>{peso(s.total)}</td></tr>;
        })}</tbody></table>{!store.sales.length && <p>{t('No sales recorded yet.', 'Wala pang naitalang benta.')}</p>}</section>
      <section className="stock-watch"><h2>{t('Record with Sari', 'Magtala kasama si Sari')}</h2>
      <Notebook open={open} store={store} /></section></div>
    <nav className="home-record-links" aria-label={t('Store records', 'Mga tala ng tindahan')}>
      <a className="button secondary" href="#expenses"><Icon name="expense" size={17} />{t('Expenses', 'Gastos')}</a>
      <a className="button secondary" href="#ledger"><Icon name="ledger" size={17} />{t('Ledger', 'Utang')}</a>
    </nav>
    <StoreHealth store={store} open={open} />
  </div>;
}
