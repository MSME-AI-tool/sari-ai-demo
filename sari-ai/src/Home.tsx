import { add, analyze, ledger, peso, shiftDay, shortDate } from './data';
import type { Entry, Store } from './data';
import { Icon, SummaryCards } from './ui';
import { StoreHealth } from './StoreTools';
import { useLanguage } from './language';
import { Collections, ExpenseBreakdown, ProductRanking, StockPriority } from './RecordViews';
import { ReportControls, useReportPeriod } from './ReportControls';
import { ProductTrend, SalesTrend } from './TrendCharts';
import { historyRangeLink } from './reporting';

export default function Home({ store, open, view = 'overview' }: { store: Store; open: (entry: Entry) => void; view?: string }) {
  const { t, language } = useLanguage();
  const control = useReportPeriod(store);
  const report = analyze(store, control.range);
  const outstanding = add(ledger({ ...store, sales: store.sales.filter(sale => sale.day <= control.range.end),
    payments: store.payments.filter(payment => payment.day <= control.range.end) }), row => row.balance);
  const priorities = [...report.forecasts].sort((a, b) =>
    Number(b.product.stock <= b.product.threshold || (b.days !== null && b.days < 3)) -
    Number(a.product.stock <= a.product.threshold || (a.days !== null && a.days < 3)) || (a.days ?? Infinity) - (b.days ?? Infinity));
  const forecastStart = shiftDay(store.today, -7);
  const historyIds = new Set(store.sales.filter(sale => sale.day >= forecastStart && sale.day < store.today).map(sale => sale.id));
  const stockEvidence = priorities.map(row => ({ ...row.product, daily: row.daily, days: row.days,
    sold: add(store.items.filter(item => item.product_id === row.product.id && historyIds.has(item.sale_id)), item => item.quantity),
  }));
  const names = new Map(store.products.map(product => [product.id, product.name]));
  const date = new Date(store.today + 'T12:00:00Z').toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const recent = store.sales.filter(sale => sale.day >= control.range.start && sale.day <= control.range.end).slice(0, 4);
  const views = [['overview', t('Overview', 'Buod')], ['products', t('Products', 'Mga Item')], ['money', t('Money', 'Pera')], ['stock', t('Stock & Health', 'Stock at Kalagayan')]];
  return <div className="overview">
    <header className="page-heading"><div><h1>{t('Store Overview', 'Buod ng Tindahan')}</h1><p>{date}</p></div>
      <button className="button primary" onClick={() => open({ kind: 'sale' })}><Icon name="plus" />{t('Record Sale', 'Itala ang Benta')}</button></header>
    <nav className="record-tabs home-tabs" aria-label={t('Home views', 'Mga tanawin ng Tindahan')}>{views.map(([key, label]) =>
      <a key={key} href={key === 'overview' ? '#home' : '#home/' + key} aria-current={view === key ? 'page' : undefined}>{label}</a>)}</nav>
    {view !== 'stock' && <><ReportControls control={control} />
      <SummaryCards items={[
        { label: t('Sales in This Period', 'Benta sa Saklaw na Ito'), value: peso(report.sales), tone: 'blue', detail: t('Previous period', 'Naunang saklaw') + ' · ' + peso(report.previousSales) },
        { label: t('Operating Expenses', 'Gastos sa Operasyon'), value: peso(report.expenses), tone: 'yellow' },
        { label: t('Cash Received', 'Natanggap na Pera'), value: peso(report.cash) },
      ]} />
    </>}
    {view === 'overview' && <>
      <SalesTrend store={store} range={control.range} />
      <section className="panel recent"><header className="panel-header"><h2>{t('Recent Sales', 'Mga Huling Benta')}</h2>
        <a className="text-link" href={historyRangeLink(control.range)}>{t('View Sales History', 'Tingnan ang Kasaysayan ng Benta')}</a></header>
        <div className="table-scroll"><table className="records-table"><thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Product', 'Item')}</th><th>{t('Qty', 'Bilang')}</th><th>{t('Amount', 'Halaga')}</th></tr></thead>
          <tbody>{recent.map(sale => { const items = store.items.filter(item => item.sale_id === sale.id);
            return <tr key={sale.id}><td data-label={t('Date', 'Petsa')}>{shortDate(sale.day, language)}</td>
              <td data-label={t('Product', 'Item')}>{items.map(item => names.get(item.product_id)).join(', ')}</td>
              <td data-label={t('Qty', 'Bilang')}>{add(items, item => item.quantity)}</td><td data-label={t('Amount', 'Halaga')}>{peso(sale.total)}</td></tr>;
          })}</tbody></table></div>{!recent.length && <p className="empty">{t('No sales in this period.', 'Walang benta sa saklaw na ito.')}</p>}
      </section>
    </>}
    {view === 'products' && <>
      <ProductTrend store={store} range={control.range} top={5} title={t('Product Sales Trend', 'Takbo ng Benta Bawat Item')} />
      <section className="panel"><ProductRanking products={report.byProduct.map(row => ({ id: row.product.id, name: row.product.name, unit: row.product.unit, quantity: row.quantity, sales: row.sales }))} /></section>
    </>}
    {view === 'money' && <div className="sales-charts">
      <section className="panel"><Collections cashSales={report.cashSales} creditSales={report.creditSales} repayments={report.repayments} outstanding={outstanding} end={control.range.end} />
        <a className="evidence-link" href="#ledger">{t('Review Credit and Repayments', 'Suriin ang Utang at Bayad')} →</a></section>
      <section className="panel"><ExpenseBreakdown categories={report.expenseCategories} /><a className="evidence-link" href="#expenses">{t('Review Expenses', 'Suriin ang Gastos')} →</a></section>
    </div>}
    {view === 'stock' && <>
      <section className="panel"><StockPriority stocks={stockEvidence} start={forecastStart} end={shiftDay(store.today, -1)} />
        <a className="evidence-link" href="#forecasting/planner">{t('Plan a Restock', 'Planuhin ang Dagdag na Stock')} →</a></section>
      <StoreHealth store={store} open={open} />
    </>}
  </div>;
}
