import { useState } from 'react';
import { add, analyze, forecast, peso, shiftDay } from './data';
import type { Entry, Product, Store } from './data';
import { expenseLabels, useLanguage } from './language';
import { Empty, Panel } from './ui';

const demoPhotos: Record<string, string> = {
  'product-1': 'coffee',
  'product-2': 'noodles',
  'product-3': 'water',
  'product-4': 'sardines',
  'product-5': 'detergent',
  'product-6': 'biscuits',
  'product-7': 'shampoo',
  'product-8': 'oil',
};

export function ProductPhoto({ product }: { product: Product }) {
  const demoPhoto = demoPhotos[product.id];
  const src = product.photo || (demoPhoto && `/catalog/${demoPhoto}.webp`);
  return src ? <img className="product-photo" src={src} alt="" loading="lazy" decoding="async" /> :
    <span aria-hidden="true" className="product-photo photo-initial">
      {product.name.slice(0, 2).toUpperCase()}
    </span>;
}

function Bars({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return <ul className="tool-bars">
    {rows.map(row => <li key={row.label}><span>{row.label}</span><strong>{row.display}</strong>
      <div aria-hidden="true"><i style={{ width: `${row.value / max * 100}%` }} /></div></li>)}
  </ul>;
}

export function StoreInsights({ store, expenses = false }: { store: Store; expenses?: boolean }) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState(7);
  const report = analyze(store, period);
  const total = expenses ? report.expenses : report.sales;
  const prior = expenses ? report.previousExpenses : report.previousSales;
  const data = expenses ? report.expenseCategories.map(row => ({
    label: t(row.category, expenseLabels[row.category] ?? row.category), value: row.amount, display: peso(row.amount),
  })) :
    report.byProduct.slice(0, 5).map(row => ({ label: row.product.name, value: row.quantity, display: String(row.quantity) }));
  const name = t(expenses ? 'Where the money went' : 'What sold', expenses ? 'Saan napunta ang pera' : 'Mga nabentang item');
  return <Panel title={name} action={<select aria-label={t('Insights period', 'Saklaw ng ulat')} value={period}
    onChange={event => setPeriod(Number(event.target.value))}><option value={1}>{t('Today', 'Ngayon')}</option>
    <option value={7}>{t('Last 7 days', 'Huling 7 araw')}</option><option value={14}>{t('Last 14 days', 'Huling 14 araw')}</option></select>}>
    <p>{expenses ? t(`Operating expenses were ${peso(total)}, compared with ${peso(prior)} in the prior period.`,
      `${peso(total)} ang gastos sa operasyon, kumpara sa ${peso(prior)} noong nakaraang panahon.`) :
      t(`Sales were ${peso(total)}. Cash received was ${peso(report.cash)}, including repayments.`,
        `${peso(total)} ang benta. ${peso(report.cash)} ang natanggap na pera, kasama ang mga bayad sa utang.`)}</p>
    {!expenses && <p className="panel-footnote">{t(`Estimated gross profit before expenses was ${peso(report.gross)}.`,
      `${peso(report.gross)} ang tinatayang tubo bago ibawas ang gastos.`)} {report.missingCosts.length > 0 &&
        t('Check missing unit costs before relying on profit figures.', 'Suriin muna ang kulang na puhunan bago gamitin ang tantiya sa tubo.')}</p>}
    {data.length ? <Bars rows={data} /> : <Empty>{t('No entries in this period.', 'Walang tala sa panahong ito.')}</Empty>}
    <a className="evidence-link" href={expenses ? '#expenses' : `#sales/period/${period}`}>
      {t('View the recorded entries', 'Tingnan ang mga tala')} →</a>
  </Panel>;
}

export function StockInsights({ store }: { store: Store }) {
  const { t } = useLanguage();
  const windowStart = shiftDay(store.today, -6);
  const movements = store.movements.filter(row => row.day >= windowStart && row.day <= store.today);
  const categories = [
    ['restock', 'Stock-in', 'Stock-in'], ['sale', 'Sales', 'Benta'], ['count', 'Counts', 'Mga bilang'],
    ['waste', 'Wastage', 'Sira o tapon'], ['correction', 'Corrections', 'Mga pagwawasto'],
  ];
  const rows = categories.map(([kind, en, fil]) => {
    const count = movements.filter(move => move.reason === kind).length;
    return { label: t(en, fil), value: count, display: String(count) };
  });
  const low = store.products.filter(product => product.stock <= product.threshold);
  return <Panel title={t('Stock activity', 'Mga galaw ng stock')} detail={t('Entries in the last 7 days', 'Mga tala sa huling 7 araw')}>
    <p>{t(`${low.length} of ${store.products.length} products are at or below their stock threshold.`,
      `${low.length} sa ${store.products.length} item ang umabot o bumaba sa minimum na stock.`)}</p>
    {movements.length > 0 ? <Bars rows={rows} /> : <Empty>{t('No stock activity in this period.', 'Walang galaw ng stock sa panahong ito.')}</Empty>}
    {low.length > 0 && <a className="evidence-link" href="#stock/low">{t('Review low stock', 'Suriin ang mababang stock')} →</a>}
  </Panel>;
}

export function StockPlanner({ store, productId }: { store: Store; productId?: string }) {
  const { t } = useLanguage();
  const estimates = forecast(store);
  const [selection, setSelection] = useState(productId ?? '');
  const [lead, setLead] = useState('2');
  const [cover, setCover] = useState('5');
  const [pack, setPack] = useState('1');
  const [price, setPrice] = useState('');
  const [newDemand, setNewDemand] = useState('');
  const [cashShare, setCashShare] = useState('100');
  const [outflows, setOutflows] = useState('0');
  const estimate = estimates.find(row => row.product.id === selection) ?? (selection ? undefined : estimates[0]);
  const isNew = selection === 'new';
  const horizon = Number(cover);
  const rate = isNew ? (newDemand === '' ? null : Number(newDemand)) : estimate?.daily ?? null;
  const priceCents = price === '' ? estimate?.product.price ?? null : Math.round(Number(price) * 100);
  const projectedUnits = horizon > 0 && rate !== null && rate >= 0 ? Math.round(rate * horizon) : null;
  const available = estimate?.product.stock ?? 0;
  const sellable = projectedUnits === null ? null : isNew ? projectedUnits : Math.min(available, projectedUnits);
  const sales = sellable === null || priceCents === null || priceCents < 0 ? null : sellable * priceCents;
  const cash = sales === null ? null : Math.round(sales * Math.min(100, Math.max(0, Number(cashShare))) / 100);
  const cashFlow = cash === null || Number(outflows) < 0 ? null : cash - Math.round(Number(outflows) * 100);
  const baseline = sellable === null || !estimate ? null : estimate.product.price * sellable;
  const packSize = Number(pack);
  const leadDays = Number(lead);
  const reorder = rate !== null && !isNew && packSize >= 1 && leadDays >= 0 && horizon > 0
    ? Math.ceil(Math.max(0, Math.ceil(rate * (leadDays + horizon)) - available) / Math.ceil(packSize)) * Math.ceil(packSize) : null;
  const runoutIn = estimate?.days ?? null;
  return <Panel title={t('Restock planner', 'Plano ng pagdagdag ng stock')}>
    <p>{t('Compare demand, sales, and cash from a product before you order.',
      'Ihambing ang tantiya sa demand, benta, at perang matatanggap bago umorder.')}</p>
    <div className="planner-fields">
      <label>{t('Product', 'Item')}<select value={isNew ? 'new' : estimate?.product.id ?? ''} onChange={event => {
        setSelection(event.target.value); setPrice(''); setNewDemand('');
      }}>
        {estimates.map(row => <option key={row.product.id} value={row.product.id}>{row.product.name}</option>)}
        <option value="new">{t('New product scenario', 'Tantiya para sa bagong item')}</option></select></label>
      <label>{t('Days to plan', 'Bilang ng araw')}<input type="number" min="1" max="90" value={cover}
        onChange={event => setCover(event.target.value)} /></label>
      {isNew ? <label>{t('Assumed units sold per day', 'Tinatayang mabebenta bawat araw')}<input type="number" min="0"
        value={newDemand} onChange={event => setNewDemand(event.target.value)} /></label> : <>
        <label>{t('Supplier lead days', 'Araw bago dumating')}<input type="number" min="0" max="365" value={lead}
          onChange={event => setLead(event.target.value)} /></label>
        <label>{t('Units per order pack', 'Piraso bawat pakete ng order')}<input type="number" min="1" value={pack}
          onChange={event => setPack(event.target.value)} /></label></>}
      <label>{t('What-if price (₱)', 'Subukang presyo (₱)')}<input type="number" min="0" step="0.01" value={price}
        placeholder={String((estimate?.product.price ?? 0) / 100)} onChange={event => setPrice(event.target.value)} /></label>
      <label>{t('Share paid in cash (%)', 'Bahaging babayaran agad (%)')}<input type="number" min="0" max="100" value={cashShare}
        onChange={event => setCashShare(event.target.value)} /></label>
      <label>{t('Expected cash expenses (₱)', 'Inaasahang ilalabas na pera (₱)')}<input type="number" min="0" step="0.01"
        value={outflows} onChange={event => setOutflows(event.target.value)} /></label>
    </div>
    <dl className="tool-metrics">
      <div><dt>{t('Demand', 'Tantiyang demand')}</dt><dd>{projectedUnits ?? '—'}</dd></div>
      <div><dt>{t('Sales at this price', 'Benta sa presyong ito')}</dt><dd>{sales === null ? '—' : peso(sales)}</dd></div>
      <div><dt>{t('Cash from new sales', 'Pera mula sa bagong benta')}</dt><dd>{cash === null ? '—' : peso(cash)}</dd></div>
      <div><dt>{t('Net cash in this scenario', 'Natitirang pera sa sitwasyong ito')}</dt>
        <dd>{cashFlow === null ? '—' : peso(cashFlow)}</dd></div>
      {!isNew && <div><dt>{t('Order quantity', 'Daming oorderin')}</dt><dd>{reorder ?? '—'}</dd></div>}
    </dl>
    {price !== '' && baseline !== null && sales !== null && <p>{t(`At the current price, the same sales volume would bring in ${peso(baseline)}.`,
      `Sa kasalukuyang presyo, ${peso(baseline)} ang benta sa parehong dami.`)}</p>}
    {reorder !== null && reorder > 0 && runoutIn !== null && <p>{runoutIn <= leadDays
      ? t('Order now. Stock could run out before a delivery arrives.', 'Umorder na. Maaaring maubos bago dumating ang delivery.')
      : t(`Order by ${shiftDay(store.today, Math.floor(runoutIn - leadDays))} if sales continue at this rate.`,
        `Umorder bago o sa ${shiftDay(store.today, Math.floor(runoutIn - leadDays))} kung magpapatuloy ang ganitong benta.`)}</p>}
    <p className="panel-footnote">{isNew ? t('This scenario assumes you have enough stock to meet the demand you entered.',
      'Ipinapalagay sa sitwasyong ito na sapat ang stock para sa inilagay na demand.') :
      t('Uses the last seven complete days and needs sales on three days. Sales are limited by stock on hand. Price changes hold demand constant.',
        'Batay sa huling pitong buong araw at kailangan ng benta sa tatlong araw. Limitado ang benta sa stock. Pareho ang demand kahit baguhin ang presyo.')}
      {' '}{t('Net cash subtracts only the expenses you enter. Repayments from earlier sales are excluded.',
        'Ibinabawas lang ang mga gastos na inilagay mo. Hindi kasama ang bayad sa mga dating utang.')}</p>
  </Panel>;
}

export function StoreHealth({ store, open }: { store: Store; open: (entry: Entry) => void }) {
  const { t } = useLanguage();
  const low = store.products.filter(product => product.stock <= product.threshold);
  const missing = store.products.filter(product => product.cost === 0);
  const corrections = store.movements.filter(move => move.reason === 'count' && Math.abs(move.change) >= 10 &&
    move.day >= shiftDay(store.today, -6));
  const financial = analyze(store, 7);
  const action = store.movements.find(move => move.reason === 'count' || move.reason === 'correction');
  const checkedProduct = store.products.find(product => product.id === action?.product_id);
  return <Panel title={t('Store health', 'Kalagayan ng tindahan')} detail={t('Needs review', 'Kailangang suriin')}>
    <dl className="tool-metrics"><div><dt>{t('Low stock', 'Mababang stock')}</dt><dd>{low.length}</dd></div>
      <div><dt>{t('Missing costs', 'Kulang na puhunan')}</dt><dd>{missing.length}</dd></div>
      <div><dt>{t('Large count changes', 'Malaking pagbabago sa bilang')}</dt><dd>{corrections.length}</dd></div></dl>
    {financial.cash < financial.expenses && <p>{t(`Cash received was ${peso(financial.cash)}, below recorded expenses of ${peso(financial.expenses)} over seven days.`,
      `${peso(financial.cash)} ang natanggap na pera, mas mababa sa gastos na ${peso(financial.expenses)} sa pitong araw.`)} <a href="#expenses">{t('Review expenses', 'Suriin ang gastos')}</a></p>}
    {missing.length > 0 && <ul className="health-actions">{missing.map(product => <li key={product.id}><strong>{product.name}</strong>
      <button className="text-link" onClick={() => open({ kind: 'product-details', product })}>{t('Enter unit cost', 'Ilagay ang puhunan')}</button></li>)}</ul>}
    {corrections.length > 0 && <ul className="health-actions">{corrections.slice(0, 4).map(move => <li key={move.id}>
      <strong>{store.products.find(product => product.id === move.product_id)?.name} · {move.change > 0 ? '+' : ''}{move.change}</strong>
      <a href={`#stock/history/${encodeURIComponent(move.product_id)}/${encodeURIComponent(move.id)}`}>{t('Review count', 'Suriin ang bilang')}</a></li>)}</ul>}
    {checkedProduct && <p className="panel-footnote">{t(`After the latest recorded review of ${checkedProduct.name}, there are ${checkedProduct.stock} on hand`,
      `Pagkatapos ng huling pagsusuri sa ${checkedProduct.name}, ${checkedProduct.stock} ang natitira`)}
      {checkedProduct.stock <= checkedProduct.threshold
        ? t('. It is still at or below its threshold.', '. Nasa minimum pa rin o mas mababa.')
        : t('. It is above its stock threshold.', '. Lampas na ito sa minimum na stock.')}</p>}
    {low.length > 0 && <a className="evidence-link" href="#stock/low">{t('Review low-stock items', 'Suriin ang mababang stock')} →</a>}
    {!low.length && !missing.length && !corrections.length && <p>{t('No inventory flags in these checks.', 'Walang nakitang problema sa mga pagsusuring ito.')}</p>}
  </Panel>;
}
