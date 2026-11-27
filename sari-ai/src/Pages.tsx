import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { add, analyze, api, forecast, ledger, peso, runout, shiftDay, shortDate } from './data';
import type { AskReply, Entry, Product, Store } from './data';
import { Empty, Icon, Panel, SummaryCards } from './ui';
import { expenseLabels, LanguageSelect, localError, useLanguage } from './language';
import { ProductPhoto, StockInsights, StockPlanner, StoreInsights } from './StoreTools';

import { AnswerVisual, ComparisonBars, ProductRanking } from './RecordViews';
import { askStream } from './askStream';
import type { SalesPeriod } from './navigation';
import { ReportControls, useReportPeriod } from './ReportControls';
import { ProductTrend, SalesTrend } from './TrendCharts';
import { historyRangeLink, rangeDays } from './reporting';
import type { DateRange, ReportPreset } from './reporting';

type PageProps = { store: Store; open: (entry: Entry) => void };
const reasons: Record<string, string> = { opening: 'Opening count', restock: 'Stock-in', count: 'Physical count', waste: 'Wastage', sale: 'Sale', correction: 'Sale correction' };
const filipinoReasons: Record<string, string> = { opening: 'Panimulang bilang', restock: 'Stock-in', count: 'Aktuwal na bilang', waste: 'Sira o tapon', sale: 'Benta', correction: 'Pagwawasto ng benta' };

function RecordTabs({ section, history = false }: { section: 'stock' | 'sales'; history?: boolean }) {
  const { t } = useLanguage();
  const stock = section === 'stock';
  return <nav className="record-tabs" aria-label={stock ? t('Stock views', 'Mga tanawin ng stock') : t('Sales views', 'Mga tanawin ng benta')}>
    <a href={'#' + section} aria-current={!history ? 'page' : undefined}>{stock ? t('Stock Overview', 'Buod ng Stock') : t('Sales Overview', 'Buod ng Benta')}</a>
    <a href={'#' + section + '/history'} aria-current={history ? 'page' : undefined}>{stock ? t('Stock History', 'Kasaysayan ng Stock') : t('Sales History', 'Kasaysayan ng Benta')}</a>
  </nav>;
}

function HistoryPagination({ page, count, size, change }: { page: number; count: number; size: number; change: (page: number) => void }) {
  const { t } = useLanguage();
  if (count <= size) return null;
  return <nav className="history-pagination" aria-label={t('History pages', 'Mga pahina ng kasaysayan')}>
    <button type="button" className="button secondary" disabled={page === 0} onClick={() => change(page - 1)}>{t('Previous', 'Nauna')}</button>
    <span>{page * size + 1}–{Math.min(count, (page + 1) * size)} / {count}</span>
    <button type="button" className="button secondary" disabled={(page + 1) * size >= count} onClick={() => change(page + 1)}>{t('Next', 'Susunod')}</button>
  </nav>;
}

export function Stock({ store, open }: PageProps) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [category, setCategory] = useState('');
  const estimates = new Map(forecast(store).map(row => [row.product.id, row.days]));
  const categories = [...new Set(store.products.map(product => product.category))].sort();
  useEffect(() => {
    function followStockLink() {
      const [, section] = window.location.hash.split('/');
      if (section === 'low') {
        setFilter('low');
      } else if (section === 'record') {
        open({ kind: 'stock', inputMode: 'sari' });
      }
    }
    followStockLink();
    window.addEventListener('hashchange', followStockLink);
    return () => window.removeEventListener('hashchange', followStockLink);
  }, []);
  const search = query.trim().toLowerCase();
  const products = store.products.filter(product => (category === '' || product.category === category) &&
    (filter === 'all' || (filter === 'out' ? product.stock === 0 : product.stock <= product.threshold)) &&
    (product.name + ' ' + product.category).toLowerCase().includes(search));
  const low = store.products.filter(product => product.stock <= product.threshold).length;
  const out = store.products.filter(product => product.stock === 0).length;

  function move(product: Product, operation: 'restock' | 'count') {
    open({ kind: 'stock', reason: operation, lines: [{ product_id: product.id, quantity: '', note: '' }] });
  }

  return <>
    <header className="page-heading stock-heading"><div><h1>Stock</h1>
      <p>{t('Find an item, check what’s left, and update the shelf count.', 'Hanapin ang item, tingnan ang natitira, at i-update ang bilang.')}</p></div>
      <div className="action-group"><button className="button secondary" onClick={() => open({ kind: 'product' })}>
        <Icon name="plus" size={17} /> {t('Add Product', 'Magdagdag ng Item')}</button>
        <button className="button primary" onClick={() => open({ kind: 'stock' })}>{t('Log Stock', 'Itala ang Stock')}</button></div>
    </header>
    <RecordTabs section="stock" />
    <section className="stock-catalog" aria-label={t('Product catalog', 'Listahan ng mga item')}>
      <div className="catalog-controls">
        <label className="search-field"><Icon name="search" size={19} /><input value={query}
          aria-label={t('Search products', 'Maghanap ng item')} placeholder={t('Search products or categories', 'Maghanap ng item o kategorya')}
          onChange={event => setQuery(event.target.value)} /></label>
        <select aria-label={t('Product category', 'Kategorya ng item')} value={category}
          onChange={event => setCategory(event.target.value)}><option value="">{t('All categories', 'Lahat ng kategorya')}</option>
          {categories.map(value => <option key={value}>{value}</option>)}</select>
      </div>
      <div className="stock-filters" role="group" aria-label={t('Availability filters', 'Salaan ayon sa stock')}>
        {([['all', t('All items', 'Lahat ng item'), store.products.length], ['low', t('Low stock', 'Mababang stock'), low],
          ['out', t('Out of stock', 'Ubos na'), out]] as const).map(([key, label, count]) =>
          <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <span>{count}</span></button>)}
      </div>
      <div className="catalog-grid">{products.map(product => <article className="catalog-card" key={product.id}>
        <ProductPhoto product={product} />
        <div className="catalog-body"><div className="catalog-product"><div><h2>{product.name}</h2>
          <p>{product.category} · {product.unit}</p></div>
          <span className={product.stock <= product.threshold ? 'stock-tag' : 'count-tag'}>
            <strong>{product.stock}</strong> {t('left', 'natitira')}</span>
        </div>
        <p className="catalog-cover">{runout(estimates.get(product.id) ?? null, language)}</p>
        <div className="catalog-actions">
          <button className="button primary" onClick={() => move(product, 'restock')}>+ Stock-in</button>
          <button className="button secondary" onClick={() => move(product, 'count')}>{t('Count', 'Bilang')}</button>
          <details className="catalog-more"><summary aria-label={t('More item actions', 'Iba pang aksiyon sa item')}><Icon name="more" /></summary>
            <div><a href={'#stock/history/' + encodeURIComponent(product.id)}>{t('Stock History', 'Kasaysayan ng Stock')}</a>
              <a href={'#forecasting/planner/' + encodeURIComponent(product.id)}>{t('Plan Restock', 'Planuhin ang Dagdag')}</a>
              <button type="button" onClick={() => open({ kind: 'product-details', product })}>{t('Edit photo or cost', 'Baguhin ang litrato o puhunan')}</button></div>
          </details>
        </div></div>
      </article>)}</div>
      {!products.length && <Empty>{t('No products match your filters.', 'Walang item na tugma sa mga salaan.')}</Empty>}
      <a className="catalog-credits" href="/photo-credits.html">{t('Photo credits', 'Mga pinagmulan ng litrato')}</a>
    </section>
  </>;
}

export function StockHistory({ store, productId = '', movementId = '' }: { store: Store; productId?: string; movementId?: string }) {
  const { t, language } = useLanguage();
  const control = useReportPeriod(store, undefined, 'all');
  const [active, setActive] = useState(productId);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(() => {
    const rows = store.movements.filter(move => !productId || move.product_id === productId);
    return Math.max(0, Math.floor(rows.findIndex(move => move.id === movementId) / 50));
  });
  const byId = new Map(store.products.map(product => [product.id, product]));
  const movements = store.movements.filter(move => move.day >= control.range.start && move.day <= control.range.end && (!active || move.product_id === active) &&
    `${byId.get(move.product_id)?.name} ${move.note} ${move.day} ${t(reasons[move.reason] ?? move.reason, filipinoReasons[move.reason] ?? move.reason)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(movements.length / 50) - 1));
  return <>
    <header className="page-heading"><div><h1>{t('Stock History', 'Kasaysayan ng Stock')}</h1>
      <p>{t('Review deliveries, sales, physical counts, and corrections.', 'Suriin ang mga delivery, benta, aktuwal na bilang, at pagwawasto.')}</p></div></header>
    <RecordTabs section="stock" history />
    <ReportControls control={control} />
    <Panel title={t('Stock Movements', 'Mga Galaw ng Stock')}
      detail={active ? byId.get(active)?.name : t('Manual entries, adjustments, and sales', 'Mga tala, pagbabago, at benta')}
      action={<select aria-label={t('Filter stock history', 'Salain ang stock history')} value={active}
        onChange={event => { setActive(event.target.value); setPage(0); }}>
        <option value="">{t('All items', 'Lahat ng item')}</option>
        {store.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select>}>
      <label className="search-field history-search"><Icon name="search" size={18} /><input aria-label={t('Search stock history', 'Maghanap sa kasaysayan ng stock')}
        placeholder={t('Search item, date, or note', 'Hanapin ang item, petsa, o tala')} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <div className="table-scroll"><table className="records-table"><thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Product', 'Item')}</th>
        <th>{t('Entry', 'Tala')}</th><th>{t('Change', 'Pagbabago')}</th><th>{t('Stock after', 'Natira')}</th><th>{t('Note', 'Detalye')}</th></tr></thead>
        <tbody>{movements.slice(currentPage * 50, (currentPage + 1) * 50).map(row => <tr key={row.id} id={'movement-' + row.id} className={movementId === row.id ? 'record-highlight' : ''}>
          <td data-label={t('Date', 'Petsa')}>{shortDate(row.day, language)}</td><td data-label={t('Product', 'Item')}><strong>{byId.get(row.product_id)?.name}</strong></td>
          <td data-label={t('Entry', 'Tala')}>{t(reasons[row.reason] ?? row.reason, filipinoReasons[row.reason] ?? row.reason)}</td>
          <td data-label={t('Change', 'Pagbabago')}>{row.change > 0 ? '+' : ''}{row.change}</td><td data-label={t('Stock after', 'Natira')}>{row.stock_after}</td><td data-label={t('Note', 'Detalye')}>{row.note || '—'}</td>
        </tr>)}</tbody></table>{!movements.length && <Empty>{t('No stock movements yet.', 'Wala pang pagbabago sa stock.')}</Empty>}</div>
      <HistoryPagination page={currentPage} count={movements.length} size={50} change={setPage} />
    </Panel>
    <StockInsights store={{ ...store, movements }} range={control.range} />
  </>;
}

export function Sales({ store, open }: PageProps) {
  const { t } = useLanguage();
  const control = useReportPeriod(store);
  const report = analyze(store, control.range);
  return <>
    <header className="page-heading"><div><h1>{t('Sales', 'Benta')}</h1>
      <p>{t('Record a checkout and review what sold.', 'Itala ang benta at suriin ang mga nabenta.')}</p></div>
      <button className="button primary" onClick={() => open({ kind: 'sale' })}><Icon name="plus" size={18} /> {t('Record Sale', 'Itala ang Benta')}</button></header>
    <RecordTabs section="sales" />
    <ReportControls control={control} />
    <SummaryCards items={[
      { label: control.choice === 'today' ? t('Today’s Sales', 'Benta Ngayong Araw') : t('Sales in This Period', 'Benta sa Saklaw na Ito'), value: peso(report.sales), tone: 'blue' },
      { label: t('Cash Sales', 'Mga Bentang Bayad Agad'), value: peso(report.cashSales), tone: 'yellow' },
      { label: t('Credit Sales', 'Mga Benta sa Utang'), value: peso(report.creditSales) },
    ]} />
    <div className="sales-charts"><SalesTrend store={store} range={control.range} /><section className="panel"><ProductRanking title={t('Top Products', 'Mga Nangungunang Item')} products={report.byProduct.map(row => ({
      id: row.product.id, name: row.product.name, unit: row.product.unit, quantity: row.quantity, sales: row.sales,
    }))} /></section></div>
    <a className="evidence-link" href={historyRangeLink(control.range)}>{t('View Sales History', 'Tingnan ang Kasaysayan ng Benta')} →</a>
  </>;
}

export function SalesHistory({ store, open, saleId = '', initialPeriod = '7', initialRange }: PageProps & { saleId?: string; initialPeriod?: SalesPeriod; initialRange?: DateRange }) {
  const { t, language } = useLanguage();
  const presets: Record<SalesPeriod, ReportPreset> = { '1': 'today', '3': '3days', '7': 'week', '14': '14days', month: 'month', '6months': '6months', all: 'all', complete7: 'past7' };
  const control = useReportPeriod(store, initialRange, presets[initialPeriod]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const lookup = new Map(store.products.map(product => [product.id, product.name]));
  useEffect(() => { setPage(0); }, [control.range.start, control.range.end]);
  const sales = store.sales.filter(sale => sale.day >= control.range.start && sale.day <= control.range.end &&
    `${sale.day} ${sale.customer} ${sale.method} ${store.items.filter(item => item.sale_id === sale.id).map(item => lookup.get(item.product_id)).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  const sale = store.sales.find(record => record.id === saleId);
  const lines = store.items.filter(item => item.sale_id === saleId);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(sales.length / 50) - 1));
  return <>
    <header className="page-heading"><div><h1>{t('Sales History', 'Kasaysayan ng Benta')}</h1>
      <p>{t('Find a transaction, review its items, or correct a sale.', 'Hanapin ang transaksiyon, suriin ang mga item, o iwasto ang benta.')}</p></div>
      <button className="button primary" onClick={() => open({ kind: 'sale' })}><Icon name="plus" size={18} /> {t('Record Sale', 'Itala ang Benta')}</button></header>
    <RecordTabs section="sales" history />
    <ReportControls control={control} />
    <ProductTrend store={{ ...store, sales }} range={control.range} title={t('Sales by Item', 'Benta Bawat Item')} />
    {saleId && !sale && <p role="status" className="notice warning">{t('This sale could not be found. Choose a transaction from the history below.', 'Hindi mahanap ang bentang ito. Pumili mula sa mga tala sa ibaba.')}</p>}
    {sale && <div id="sale-details"><Panel title={t('Sale Details', 'Detalye ng Benta')} detail={shortDate(sale.day, language) + ' · ' + (sale.method === 'cash' ? t('Cash', 'Bayad agad') : sale.customer)}
      action={<button className="button secondary" onClick={() => open({ kind: 'sale-correction', sale,
        lines: lines.map(item => ({ product_id: item.product_id, quantity: String(item.quantity), note: '' })) })}>
        {t('Correct Sale', 'Iwasto ang Benta')}</button>}>
      <div className="rank-list">{lines.map(item => <div key={item.product_id}><strong>{lookup.get(item.product_id)}</strong>
        <span>{item.quantity} × {peso(item.price)}</span><span>{peso(item.quantity * item.price)}</span></div>)}</div>
      <p className="panel-footnote">{t('Sale total', 'Kabuuang benta')} {peso(sale.total)}
        {!!sale.revision && ' · ' + t('Corrected', 'Naitama')}</p>
    </Panel></div>}
    <Panel title={t('Transactions', 'Mga Transaksiyon')} detail={sales.length + ' · ' + peso(add(sales, item => item.total))}>
      <label className="search-field history-search"><Icon name="search" size={18} /><input aria-label={t('Search sales history', 'Maghanap sa kasaysayan ng benta')}
        placeholder={t('Search item, customer, or date', 'Hanapin ang item, mamimili, o petsa')} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <div className="table-scroll"><table className="records-table"><thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Products', 'Mga item')}</th>
        <th>{t('Payment', 'Bayad')}</th><th>{t('Total', 'Kabuuan')}</th><th><span className="sr-only">{t('Details', 'Detalye')}</span></th></tr></thead>
        <tbody>{sales.slice(currentPage * 50, (currentPage + 1) * 50).map(record => <tr key={record.id}><td data-label={t('Date', 'Petsa')}>{shortDate(record.day, language)}</td>
          <td data-label={t('Products', 'Mga item')}><strong>{store.items.filter(item => item.sale_id === record.id).map(item =>
            lookup.get(item.product_id) + ' × ' + item.quantity).join(', ')}</strong></td>
          <td data-label={t('Payment', 'Bayad')}>{record.method === 'cash' ? t('Cash', 'Bayad agad') : t('Credit', 'Utang')}</td><td data-label={t('Total', 'Kabuuan')}>{peso(record.total)}</td>
          <td><a className="text-link" href={'#sales/history/entry/' + encodeURIComponent(record.id)}>{t('Details', 'Detalye')} <Icon name="chevron" size={15} /></a></td>
        </tr>)}</tbody>
      </table>{!sales.length && <Empty>{t('No sales in this period.', 'Walang benta sa panahong ito.')}</Empty>}</div>
      <HistoryPagination page={currentPage} count={sales.length} size={50} change={setPage} />
    </Panel>
  </>;
}

function ForecastTabs({ planner = false }: { planner?: boolean }) {
  const { t } = useLanguage();
  return <nav className="record-tabs" aria-label={t('Forecasting views', 'Mga tanawin ng pagtataya')}>
    <a href="#forecasting" aria-current={!planner ? 'page' : undefined}>{t('Forecasting', 'Pagtataya')}</a>
    <a href="#forecasting/planner" aria-current={planner ? 'page' : undefined}>{t('Restock Planner', 'Plano ng Pagdagdag ng Stock')}</a>
  </nav>;
}

export function RestockPlanning({ store, productId }: { store: Store; productId?: string }) {
  const { t } = useLanguage();
  const selected = store.products.some(product => product.id === productId) ? productId : undefined;
  return <><header className="page-heading"><div><h1>{t('Restock Planner', 'Plano ng Pagdagdag ng Stock')}</h1>
    <p>{t('Compare order quantities, price changes, and cash scenarios.', 'Ihambing ang dami ng order, presyo, at mga sitwasyon sa pera.')}</p></div></header>
    <ForecastTabs planner /><StockPlanner store={store} productId={selected} />
  </>;
}

export function Forecasting({ store }: { store: Store; productId?: string }) {
  const { t, language } = useLanguage();
  const estimates = forecast(store);
  const ready = estimates.filter(row => row.daily !== null);
  const start = shiftDay(store.today, -7);
  const end = shiftDay(store.today, -1);
  return <>
    <header className="page-heading"><div><h1>{t('Forecasting', 'Pagtataya')}</h1>
      <p>{t('See what may run out and plan your next order.', 'Tingnan ang maaaring maubos at planuhin ang susunod na order.')}</p></div></header>
    <ForecastTabs />
    <SummaryCards items={[
      { label: t('Products With Estimates', 'Mga Item na May Tantiya'), value: String(ready.length), tone: 'blue' },
      { label: t('Need More History', 'Kulang sa Kasaysayan'), value: String(estimates.length - ready.length) },
      { label: t('Under 3 Days of Stock', 'Wala Pang 3 Araw na Stock'), value: String(estimates.filter(row => row.days !== null && row.days < 3).length), tone: 'yellow' },
    ]} />
    <section className="forecast-method" aria-label={t('Forecast method', 'Paraan ng pagtataya')}>
      <h2>{t('How the Estimate Works', 'Paano Kinukuha ang Tantiya')}</h2>
      <p>{t('Past 7 days: average daily demand requires sales on at least three different days. Days without a recorded sale count as zero. The exact dates used are shown below.',
        'Nakaraang 7 araw: kailangan ng benta sa tatlong magkaibang araw o higit pa para makuha ang karaniwang demand. Zero ang araw na walang naitalang benta. Nasa ibaba ang mga petsang ginamit.')}</p>
      <p>{t('History used', 'Batayang kasaysayan')} · {shortDate(start, language)}–{shortDate(end, language)}
        {' · '}<a className="text-link" href="#sales/history/complete/7">{t('Review Sales History', 'Suriin ang Kasaysayan ng Benta')}</a></p>
      <p className="field-help">{t('Demand = units sold ÷ 7. Stock cover = stock on hand ÷ daily demand. These estimates assume recent demand continues. Missing sales, stockouts, and unusual demand can affect the result.',
        'Demand = nabentang yunit ÷ 7. Tagal ng stock = natitirang stock ÷ demand bawat araw. Ipinapalagay na magpapatuloy ang demand. Maaaring makaapekto ang kulang na tala, pagkaubos, at pagbabago ng demand.')}</p>
    </section>
    <Panel title={t('Stock Forecast', 'Tantiya sa Stock')} detail={t('Next 7 days at the recent sales rate', 'Susunod na 7 araw batay sa kamakailang benta')}>
      <div className="table-scroll"><table className="records-table"><thead><tr>
        <th>{t('Product', 'Item')}</th><th>{t('On Hand', 'Natitira')}</th><th>{t('Daily Demand', 'Demand Bawat Araw')}</th>
        <th>{t('7-Day Demand', 'Demand sa 7 Araw')}</th><th>{t('Stock Cover', 'Tagal ng Stock')}</th><th>{t('Plan', 'Plano')}</th>
      </tr></thead><tbody>{estimates.map(row => <tr key={row.product.id}>
        <td data-label={t('Product', 'Item')}><strong>{row.product.name}</strong></td>
        <td data-label={t('On Hand', 'Natitira')}>{row.product.stock} {row.product.unit}</td>
        <td data-label={t('Daily Demand', 'Demand Bawat Araw')}>{row.daily === null ? '—' : row.daily.toFixed(2) + ' ' + row.product.unit}</td>
        <td data-label={t('7-Day Demand', 'Demand sa 7 Araw')}>{row.daily === null ? '—' : Math.ceil(row.daily * 7) + ' ' + row.product.unit}</td>
        <td data-label={t('Stock Cover', 'Tagal ng Stock')}>{runout(row.days, language)}</td>
        <td><a className="text-link" href={'#forecasting/planner/' + encodeURIComponent(row.product.id)}>{t('Plan Restock', 'Planuhin ang Dagdag')}</a>
          {' · '}<a className="text-link" href={'#stock/history/' + encodeURIComponent(row.product.id)}>{t('Stock History', 'Kasaysayan ng Stock')}</a></td>
      </tr>)}</tbody></table>{!estimates.length && <Empty>{t('Add products and record sales to start forecasting.', 'Magdagdag ng item at magtala ng benta para makapagtaya.')}</Empty>}</div>
    </Panel>
    <Panel title={t('Estimated Demand', 'Tinatayang Demand')} detail={t('Highest unit demand in the next 7 days', 'Pinakamaraming tinatayang yunit sa susunod na 7 araw')}>
      <ComparisonBars label={t('Estimated seven-day demand by product', 'Tinatayang demand sa pitong araw bawat item')}
        rows={[...ready].sort((a, b) => b.daily! - a.daily!).slice(0, 5).map(row => ({
          name: row.product.name, value: Math.ceil(row.daily! * 7), display: Math.ceil(row.daily! * 7) + ' ' + row.product.unit,
        }))} />
      {!ready.length && <p>{t('More sales history needed. Record sales on at least three days in the Past 7 days.',
        'Kulang ang kasaysayan. Magtala ng benta sa tatlong araw o higit pa sa nakaraang 7 araw.')}</p>}
    </Panel>
  </>;
}

export function Expenses({ store, open }: PageProps) {
  const { t, language } = useLanguage();
  const control = useReportPeriod(store);
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');
  const categories = [...new Set(store.expenses.map(expense => expense.category))].sort();
  const expenses = store.expenses.filter(expense => expense.day >= control.range.start && expense.day <= control.range.end && (!category || expense.category === category) && (!date || expense.day === date));
  const expenseTotal = add(expenses, row => row.amount);
  const largestCategory = [...new Set(expenses.map(row => row.category))]
    .map(name => ({ name, total: add(expenses.filter(row => row.category === name), row => row.amount) }))
    .sort((a, b) => b.total - a.total)[0];
  return <>
    <header className="page-heading"><div><h1>{t('Expenses', 'Gastos')}</h1>
      <p>{t('Record and review operating costs.', 'Itala at suriin ang gastos sa operasyon.')}</p></div>
      <button className="button primary" onClick={() => open({ kind: 'expense' })}><Icon name="plus" size={18} /> {t('Log expense', 'Itala ang gastos')}</button></header>
    <ReportControls control={control} />
    <SummaryCards items={[
      { label: t('Expenses shown', 'Mga ipinapakitang gastos'), value: peso(expenseTotal), tone: 'yellow' },
      { label: largestCategory ? t(largestCategory.name, expenseLabels[largestCategory.name] ?? largestCategory.name) : t('Largest category', 'Pinakamalaking kategorya'), value: peso(largestCategory?.total ?? 0) },
      { label: t('Other costs', 'Iba pang gastos'), value: peso(expenseTotal - (largestCategory?.total ?? 0)) },
    ]} />
    <StoreInsights store={{ ...store, expenses: store.expenses.filter(expense => (!category || expense.category === category) && (!date || expense.day === date)) }} expenses range={control.range} />
    <Panel title={t('Operating expenses', 'Gastos sa operasyon')} detail={peso(add(expenses, expense => expense.amount)) + ' · ' + expenses.length}
      action={<div className="action-group"><select aria-label={t('Expense category', 'Kategorya ng gastos')} value={category}
        onChange={event => setCategory(event.target.value)}><option value="">{t('All categories', 'Lahat ng kategorya')}</option>
        {categories.map(option => <option key={option} value={option}>{t(option, expenseLabels[option] ?? option)}</option>)}</select>
        <input type="date" aria-label={t('Expense date', 'Petsa ng gastos')} value={date} max={store.today} onChange={event => setDate(event.target.value)} /></div>}>
      <div className="table-scroll"><table className="records-table"><thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Description', 'Detalye')}</th>
        <th>{t('Category', 'Kategorya')}</th><th>{t('Amount', 'Halaga')}</th></tr></thead>
        <tbody>{expenses.map(expense => <tr key={expense.id}><td data-label={t('Date', 'Petsa')}>{shortDate(expense.day, language)}</td><td data-label={t('Description', 'Detalye')}><strong>{expense.description}</strong></td>
          <td data-label={t('Category', 'Kategorya')}>{t(expense.category, expenseLabels[expense.category] ?? expense.category)}</td><td data-label={t('Amount', 'Halaga')}>{peso(expense.amount)}</td></tr>)}</tbody></table>
        {!expenses.length && <Empty>{t('No expenses match these filters.', 'Walang gastos na tugma sa mga salaan.')}</Empty>}</div>
    </Panel>
  </>;
}

export function Ledger({ store, open }: PageProps) {
  const { t, language } = useLanguage();
  const control = useReportPeriod(store);
  const customers = ledger(store);
  const history = [...store.sales.filter(sale => sale.method === 'credit').map(sale =>
    ({ ...sale, type: t('Credit sale', 'Benta sa utang'), amount: sale.total })),
  ...store.payments.map(payment => ({ ...payment, type: t('Repayment', 'Bayad sa utang'), amount: -payment.amount }))]
    .filter(row => row.day >= control.range.start && row.day <= control.range.end).sort((a, b) => b.day.localeCompare(a.day));
  return <>
    <header className="page-heading"><div><h1>{t('Ledger', 'Utang')}</h1><p>{t('Review customer credit and repayments.', 'Suriin ang utang at bayad ng mga mamimili.')}</p></div>
      <button className="button primary" disabled={!customers.some(({ balance }) => balance > 0)}
        onClick={() => open({ kind: 'payment' })}><Icon name="plus" size={18} /> {t('Record repayment', 'Itala ang bayad')}</button></header>
    <ReportControls control={control} />
    <SummaryCards items={[
      { label: t('Still Owed Today', 'Natitirang Utang Ngayon'), value: peso(add(customers, row => row.balance)), tone: 'blue' },
      { label: t('Credit Sales in Period', 'Benta sa Utang sa Saklaw'), value: peso(add(history.filter(row => row.amount > 0), row => row.amount)), tone: 'yellow' },
      { label: t('Repayments in Period', 'Mga Bayad sa Saklaw'), value: peso(-add(history.filter(row => row.amount < 0), row => row.amount)) },
    ]} />
    <Panel title={t('Customer balances', 'Balanse ng mga mamimili')}
      detail={t('Outstanding', 'Natitirang utang') + ' · ' + peso(add(customers, customer => customer.balance))}>
      {customers.length ? <div className="rank-list">{customers.map(({ name, balance }) => <div key={name}>
        <strong>{name}</strong><span>{peso(balance)}</span>{balance > 0
          ? <button className="text-link" onClick={() => open({ kind: 'payment', customer: name })}>{t('Record payment', 'Itala ang bayad')}</button>
          : <span>{t('Paid', 'Bayad na')}</span>}
      </div>)}</div> : <Empty>{t('No customer balances yet.', 'Wala pang utang.')}</Empty>}
    </Panel>
    <Panel title={t('Ledger history', 'Mga tala ng utang at bayad')}><div className="table-scroll"><table className="records-table">
      <thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Customer', 'Mamimili')}</th><th>{t('Entry', 'Tala')}</th><th>{t('Change', 'Pagbabago')}</th></tr></thead>
      <tbody>{history.map(entry => <tr key={entry.id}><td data-label={t('Date', 'Petsa')}>{shortDate(entry.day, language)}</td><td data-label={t('Customer', 'Mamimili')}><strong>{entry.customer}</strong></td>
        <td data-label={t('Entry', 'Tala')}>{entry.type}</td><td data-label={t('Change', 'Pagbabago')}>{peso(entry.amount)}</td></tr>)}</tbody></table>
      {!history.length && <Empty>{t('No ledger entries yet.', 'Wala pang tala.')}</Empty>}</div></Panel>
  </>;
}

export function Ask({ open, store }: PageProps) {
  const { language, t } = useLanguage();
  const [message, setMessage] = useState('');
  const control = useReportPeriod(store);
  const [thread, setThread] = useState<{ question: string; answer: AskReply; recordContext: string }[]>([]);
  const [pending, setPending] = useState('');
  const [streamed, setStreamed] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const [error, setError] = useState('');
  const conversation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [thread, pending, streamed]);
  const examples = [
    t('What is my stock right now?', 'Ano ang stock ko ngayon?'),
    t('Why was cash lower than sales?', 'Bakit mas mababa ang natanggap na pera kaysa sa benta?'),
    t('What should I restock next?', 'Ano ang dapat kong i-restock?'),
    t('How do I record a repayment?', 'Paano magtala ng bayad sa utang?'),
  ];
  const destinations = {
    home: t('Open Home', 'Buksan ang Tindahan'), sales: t('Open Sales', 'Buksan ang Benta'),
    stock: t('Open Stock', 'Buksan ang Stock'), 'stock/history': t('View Stock History', 'Tingnan ang Kasaysayan ng Stock'),
    'stock/planner': t('Open Restock Planner', 'Buksan ang Plano ng Pagdagdag ng Stock'),
    expenses: t('Open Expenses', 'Buksan ang Gastos'), ledger: t('Open Ledger', 'Buksan ang Utang'),
  };

  async function reply(question: string, newTopic = false) {
    if (!question.trim() || pending) return;
    const previous = thread.at(-1);
    const followUp = /^(?:make (?:it|that)|change (?:it|that)|instead\b|palitan\b|gawing?\b|iyon\b|\d+\b)/i.test(question);
    const context = !newTopic && previous && (followUp || previous.answer.clarification) ? previous.recordContext : '';
    const controller = new AbortController();
    request.current = controller;
    setPending(question); setStreamed(''); setError(''); setMessage('');
    try {
      const history = thread.slice(-6).flatMap(turn => [
        { role: 'user', content: turn.question.slice(0, 2000) },
        { role: 'assistant', content: turn.answer.text.slice(0, 2000) },
      ]);
      const answer = await askStream({ question, period: rangeDays(control.range), start_date: control.range.start, end_date: control.range.end, language, context, history },
        chunk => setStreamed(value => value + chunk), controller.signal);
      const recordContext = answer.agent === 'recording' ? [context, question, answer.text].filter(Boolean).join('\n').slice(0, 3900) : '';
      setThread(items => [...items, { question, answer, recordContext }]);
    } catch (problem) {
      if (!controller.signal.aborted) setError(localError(t, problem));
      setMessage(question);
    } finally { request.current = null; setPending(''); setStreamed(''); }
  }
  return <div className="ask-page">
    <header className="page-heading"><div><h1 id="ask-page-title">{t('Ask Sari', 'Tanungin si Sari')}</h1>
      <p>{t('Ask about store figures or get help with a task.', 'Magtanong tungkol sa mga tala o humingi ng tulong sa gawain.')}</p></div></header>
    <Panel className="ask-panel" title={t('Your conversation', 'Pag-uusap')} action={<img className="sari-icon" src="/sari.svg" alt="" />}>
      {store.ai_configured === false && <p className="notice" role="status">{t(
        'No live AI provider is configured. Sari can still check store records, guide you through the app, and prepare common drafts.',
        'Wala pang naka-configure na live AI. Maaari pa ring sumuri si Sari ng mga tala, gumabay sa app, at gumawa ng mga karaniwang draft.',
      )}</p>}
      <div className="ask-controls"><ReportControls control={control} disabled={!!pending} /></div>
      <div className="suggestions">{examples.map(question => <button type="button" key={question}
        className="button secondary" disabled={!!pending} onClick={() => void reply(question, true)}>{question}</button>)}</div>
      <div className="thread" ref={conversation} aria-live="polite" aria-label={t('Conversation messages', 'Mga mensahe')} tabIndex={0}>
        {!thread.length && !pending && <div className="chat-welcome">
          <img src="/sari.svg" alt="" /><h3>{t('How can I help?', 'Paano ako makatutulong?')}</h3>
          <p>{t('Choose a question above, or type your own below.', 'Pumili ng tanong sa itaas, o mag-type sa ibaba.')}</p>
        </div>}
        {thread.map(({ question, answer }, index) => <div key={index}><div className="question">{question}</div>
          <div className="answer"><img className="sari-icon" src="/sari.svg" alt="" /><div>
            <p className="answer-source"><strong>Sari</strong> · {answer.source === 'external' ? t('Live AI', 'Live AI') :
              answer.source === 'conversation' ? t('Built-in reply', 'Built-in na sagot') :
              answer.source === 'guide' ? t('App guide', 'Gabay sa app') : t('Store records', 'Mga tala ng tindahan')}</p>
            <p className="answer-text">{answer.text}</p>
            {answer.view && <AnswerVisual view={answer.view} />}
            {!!answer.suggestions?.length && <div className="answer-suggestions" role="group" aria-label={t('Suggested next questions', 'Mga susunod na tanong')}>
              {answer.suggestions.map(suggestion => <button key={suggestion} type="button" className="button secondary" disabled={!!pending}
                onClick={() => void reply(suggestion, true)}>{suggestion}</button>)}
            </div>}
            {store.ai_configured !== false && answer.reason && <p className="answer-status">{answer.reason === 'busy' ? t(
              'Live AI is busy. This reply used the built-in assistant.', 'Abala ang Live AI. Galing ang sagot na ito sa built-in na assistant.',
            ) : answer.reason === 'unconfigured' ? t(
              'Live AI is not configured. This reply used the built-in assistant.', 'Wala pang naka-configure na Live AI. Built-in na assistant ang sumagot.',
            ) : t('Live AI didn’t respond. This reply used the built-in assistant.',
              'Hindi sumagot ang Live AI. Galing ang sagot na ito sa built-in na assistant.')}</p>}
            {answer.draft && <button className="text-link" onClick={() => open({ ...answer.draft!, original: question, draftSource: answer.source })}>
              {t('Review draft', 'Suriin ang draft')} <Icon name="arrow" size={17} /></button>}
            {answer.destination && <a className="evidence-link" href={'#' + answer.destination}>{destinations[answer.destination]} →</a>}
            {!!answer.facts?.length && <details className="answer-evidence"><summary>{t('View all supporting figures', 'Tingnan ang lahat ng pinagbatayang bilang')}</summary>
              <dl>{answer.facts.map(({ label, value }, i) => <div key={i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}
            {answer.agent === 'forecast' && answer.source === 'records' && <p className="answer-record-links">
              <a href="#sales">{t('Review sales', 'Suriin ang benta')}</a> ·{' '}
              <a href="#stock/history">{t('Check stock movements', 'Suriin ang galaw ng stock')}</a> ·{' '}
              <a href="#ledger">{t('Review unpaid credit', 'Suriin ang mga utang')}</a>
            </p>}
          </div></div></div>)}
        {pending && <div><div className="question">{pending}</div>
          {streamed ? <div className="answer" aria-busy="true"><img className="sari-icon" src="/sari.svg" alt="" /><div>
            <p className="answer-source"><strong>Sari</strong> · {t('Responding…', 'Sumasagot…')}</p>
            <p className="answer-text">{streamed}</p></div></div>
            : <p role="status">{t('Preparing a response…', 'Inihahanda ang sagot…')}</p>}
          <button className="text-link" type="button" onClick={() => request.current?.abort()}>
            {t('Stop response', 'Itigil ang sagot')}</button>
        </div>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="ask-form" onSubmit={event => { event.preventDefault(); void reply(message.trim()); }}>
        <input value={message} onChange={event => setMessage(event.target.value)} aria-label={t('Your question', 'Tanong mo')}
          placeholder={t('Ask about your store', 'Magtanong tungkol sa tindahan')} maxLength={500} required />
        <button className="button primary" disabled={!!pending || !message.trim()}>{t('Ask', 'Magtanong')} <Icon name="arrow" size={18} /></button>
      </form>
      <p className="panel-footnote">{t('Sari uses live AI for conversation when available. Each reply shows its source. Review and confirm drafts before saving.',
        'Gumagamit si Sari ng live AI sa usapan kapag available. May label ang pinagmulan ng bawat sagot. Suriin at kumpirmahin ang draft bago i-save.')}</p>
    </Panel>
  </div>;
}

export function More() {
  const { t } = useLanguage();
  return <>
    <header className="page-heading"><div><h1>{t('More', 'Iba pa')}</h1><p>{t('Store settings and records.', 'Mga setting at tala ng tindahan.')}</p></div></header>
    <Panel title={t('Language', 'Wika')} action={<LanguageSelect />}>
      <p>{t('Product names and catalog details stay as entered.', 'Mananatili ang mga pangalan at detalye ng item ayon sa pagkakalagay.')}</p></Panel>
    <Panel title={t('Store records', 'Mga tala ng tindahan')}><div className="more-links">
      <a href="#expenses"><strong>{t('Expenses', 'Gastos')}</strong><Icon name="chevron" size={18} /></a>
      <a href="#ledger"><strong>{t('Ledger', 'Utang')}</strong><Icon name="chevron" size={18} /></a>
      <a href="#stock/history"><strong>{t('Stock History', 'Kasaysayan ng Stock')}</strong><Icon name="chevron" size={18} /></a>
      <a href="#sales/history"><strong>{t('Sales History', 'Kasaysayan ng Benta')}</strong><Icon name="chevron" size={18} /></a>
      <a href="#forecasting"><strong>{t('Forecasting', 'Pagtataya')}</strong><Icon name="chevron" size={18} /></a>
      <a href="#ask"><strong>{t('Ask Sari', 'Tanungin si Sari')}</strong><Icon name="chevron" size={18} /></a>
    </div></Panel>
  </>;
}
