import { useState } from 'react';
import { peso, runout, shortDate } from './data';
import type { RankedProduct, RecordView, StockEvidence } from './data';
import { expenseLabels, useLanguage } from './language';
import { Empty } from './ui';

type BarRow = { name: string; value: number; display: string };

export function ComparisonBars({ rows, label }: { rows: BarRow[]; label: string }) {
  const { t } = useLanguage();
  const maximum = Math.max(1, ...rows.map(row => row.value));
  return rows.length ? <ul className="comparison-bars" aria-label={label}>
    {rows.map(row => <li key={row.name}>
      <span>{row.name}</span><strong>{row.display}</strong>
      <div className="comparison-track" aria-hidden="true">
        <span style={{ width: `${row.value / maximum * 100}%` }} />
      </div>
    </li>)}
  </ul> : <Empty>{t('No recorded activity in this period.', 'Walang naitalang galaw sa panahong ito.')}</Empty>;
}

export function ProductRanking({ products, title }: { products: RankedProduct[]; title?: string }) {
  const { t } = useLanguage();
  const [measure, setMeasure] = useState<'sales' | 'quantity'>('sales');
  const ranked = [...products].sort((a, b) => b[measure] - a[measure] || a.name.localeCompare(b.name)).slice(0, 5);
  return <div className="record-chart">
    <div className="chart-heading">
      <h3>{title ?? t('Top Products', 'Mga Nangungunang Item')}</h3>
      <div className="chart-switch" role="group" aria-label={t('Rank products by', 'Ayusin ang mga item ayon sa')}>
        <button type="button" aria-pressed={measure === 'sales'} onClick={() => setMeasure('sales')}>{t('Sales ₱', 'Benta ₱')}</button>
        <button type="button" aria-pressed={measure === 'quantity'} onClick={() => setMeasure('quantity')}>{t('Units', 'Bilang')}</button>
      </div>
    </div>
    <ComparisonBars label={t('Top five products', 'Limang nangungunang item')} rows={ranked.map(row => ({
      name: row.name, value: row[measure], display: measure === 'sales' ? peso(row.sales) : `${row.quantity} ${row.unit}`,
    }))} />
  </div>;
}

export function ExpenseBreakdown({ categories }: { categories: { category: string; amount: number }[] }) {
  const { t } = useLanguage();
  const rows = categories.filter(row => row.amount > 0);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  let cumulative = 0;
  return <div className="record-chart">
    <h3>{t('Where the Money Went', 'Saan Napunta ang Pera')}</h3>
    {total > 0 ? <div className="expense-distribution"><svg className="expense-pie" viewBox="0 0 220 220" role="img" aria-label={t('Operating expenses by category', 'Gastos sa operasyon ayon sa kategorya')}>
      {rows.map((row, i) => {
        const from = cumulative / total * Math.PI * 2 - Math.PI / 2;
        cumulative += row.amount;
        const to = cumulative / total * Math.PI * 2 - Math.PI / 2;
        const label = t(row.category, expenseLabels[row.category] ?? row.category) + ' · ' + peso(row.amount) + ' · ' + (row.amount / total * 100).toFixed(1) + '%';
        return rows.length === 1 ? <circle key={row.category} cx="110" cy="110" r="100" fill={`var(--chart-${i + 1})`}><title>{label}</title></circle>
          : <path key={row.category} d={`M110,110 L${110 + 100 * Math.cos(from)},${110 + 100 * Math.sin(from)} A100,100 0 ${row.amount / total > .5 ? 1 : 0},1 ${110 + 100 * Math.cos(to)},${110 + 100 * Math.sin(to)} Z`}
            fill={`var(--chart-${i % 8 + 1})`} stroke="var(--surface)" strokeWidth="2"><title>{label}</title></path>;
      })}
    </svg><ul className="expense-legend">{rows.map((row, i) => <li key={row.category}><i style={{ background: `var(--chart-${i % 8 + 1})` }} />
      <span>{t(row.category, expenseLabels[row.category] ?? row.category)}</span><strong>{peso(row.amount)}</strong>
      <span>{(row.amount / total * 100).toFixed(1)}%</span></li>)}</ul></div> : <Empty>{t('No recorded expenses in this period.', 'Walang naitalang gastos sa saklaw na ito.')}</Empty>}
    <p className="chart-caption">{t('Total Operating Expenses', 'Kabuuang Gastos sa Operasyon')} · {peso(total)}</p>
  </div>;
}

export function Collections({ cashSales, creditSales, repayments, outstanding, end }: {
  cashSales: number; creditSales: number; repayments: number; outstanding: number; end: string;
}) {
  const { t, language } = useLanguage();
  const total = cashSales + creditSales;
  return <div className="record-chart">
    <h3>{t('Payments and credit', 'Mga bayad at utang')}</h3>
    <p className="chart-caption">{t('How sales in this period were recorded', 'Paano naitala ang mga benta sa panahong ito')}</p>
    {total > 0 && <div className="payment-split" aria-hidden="true">
      <span style={{ width: `${cashSales / total * 100}%` }} />
      <span style={{ width: `${creditSales / total * 100}%` }} />
    </div>}
    <dl className="payment-legend">
      <div><dt><i className="paid-key" />{t('Paid at sale', 'Bayad agad')}</dt><dd>{peso(cashSales)}</dd></div>
      <div><dt><i className="credit-key" />{t('Sold on credit', 'Benta sa utang')}</dt><dd>{peso(creditSales)}</dd></div>
    </dl>
    <dl className="collection-totals">
      <div><dt>{t('Cash received', 'Natanggap na pera')}</dt><dd>{peso(cashSales + repayments)}</dd></div>
      <div><dt>{t('Includes credit repayments', 'Kasamang bayad sa utang')}</dt><dd>{peso(repayments)}</dd></div>
      <div><dt>{t('Still owed', 'Natitirang utang')} <span>{t('as of', 'noong')} {shortDate(end, language)}</span></dt><dd>{peso(outstanding)}</dd></div>
    </dl>
  </div>;
}

export function StockPriority({ stocks, start, end }: { stocks: StockEvidence[]; start: string; end: string }) {
  const { t, language } = useLanguage();
  const priorities = stocks.filter(row => row.stock <= row.threshold || (row.days !== null && row.days < 3));
  const displayed = (priorities.length ? priorities : stocks).slice(0, 3);
  return <div className="record-chart">
    <h3>{t('Check before ordering', 'Suriin bago umorder')}</h3>
    <p className="chart-caption">{t('Past 7 days', 'Nakaraang 7 araw')} · {shortDate(start, language)}–{shortDate(end, language)}</p>
    {displayed.length ? <ul className="priority-list">{displayed.map(row => <li key={row.id}>
      <div className="priority-heading"><a href={'#stock/history/' + encodeURIComponent(row.id)}>{row.name}</a>
        <strong>{row.stock} <span>{row.unit}</span></strong></div>
      <div className="priority-context"><span>{row.sold} {t('sold', 'nabenta')} · {t('Past 7 days', 'Nakaraang 7 araw')}</span>
        <span className={row.stock <= row.threshold ? 'priority-low' : ''}>{runout(row.days, language)}</span></div>
      {row.days !== null && <div className="stock-cover-track" aria-hidden="true">
        <span style={{ width: `${Math.min(7, Math.max(0, row.days)) / 7 * 100}%` }} />
      </div>}
    </li>)}</ul> : <Empty>{t('Add products to review stock.', 'Magdagdag ng item para masuri ang stock.')}</Empty>}
    <p className="chart-caption">{t('Cover bars show up to 7 days. Check the physical count and supplier lead time.',
      'Hanggang 7 araw ang ipinapakita ng bar. Suriin ang aktuwal na bilang at oras ng delivery.')}</p>
  </div>;
}

export function AnswerVisual({ view }: { view: RecordView }) {
  const { t, language } = useLanguage();
  const cash = view.cashSales + view.repayments;
  const headings = {
    overview: t('Your store at a glance', 'Buod ng tindahan'),
    expenses: t('Your recorded expenses', 'Mga naitalang gastos'),
    cash: t('Where your collections came from', 'Saan nanggaling ang natanggap na pera'),
    credit: t('Your credit records', 'Mga tala ng utang'),
    profit: t('What remains after recorded costs', 'Natira matapos ang naitalang puhunan at gastos'),
    stock: t('Your current stock', 'Kasalukuyang stock'),
    restock: t('Review stock before ordering', 'Suriin ang stock bago umorder'),
  };
  const metrics = view.kind === 'expenses' ? [
    [t('Operating expenses', 'Gastos sa operasyon'), view.expenses],
  ] : view.kind === 'profit' ? [
    [t('Estimated gross profit', 'Tinatayang kabuuang tubo'), view.gross],
    [t('Operating expenses', 'Gastos sa operasyon'), view.expenses],
    [t('After recorded expenses', 'Matapos ang naitalang gastos'), view.gross - view.expenses],
  ] : view.kind === 'credit' ? [
    [t('Still owed', 'Natitirang utang'), view.outstanding],
    [t('New credit sales', 'Bagong benta sa utang'), view.creditSales],
    [t('Repayments received', 'Natanggap na bayad sa utang'), view.repayments],
  ] : view.kind === 'restock' || view.kind === 'stock' ? [] : view.kind === 'cash' ? [
    [t('Sales', 'Benta'), view.sales], [t('Cash received', 'Natanggap na pera'), cash],
  ] : [
    [t('Sales', 'Benta'), view.sales], [t('Cash received', 'Natanggap na pera'), cash],
    [t('Estimated gross profit', 'Tinatayang kabuuang tubo'), view.gross],
  ];
  return <section className="answer-visual" aria-label={t('Verified store figures', 'Mga bilang mula sa tala')}>
    <div className="answer-heading"><h3>{headings[view.kind]}</h3>
      <p>{shortDate(view.start, language)}–{shortDate(view.end, language)}</p></div>
    {metrics.length > 0 && <dl className="answer-metrics">{metrics.map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd>{peso(Number(value))}</dd></div>)}</dl>}
    {view.kind === 'overview' && <ProductRanking products={view.products} />}
    {view.kind === 'expenses' && <ExpenseBreakdown categories={view.expenseCategories} />}
    {(view.kind === 'cash' || view.kind === 'credit') && <Collections {...view} />}
    {(view.kind === 'restock' || view.kind === 'stock') &&
      <StockPriority stocks={view.stocks} start={view.forecastStart} end={view.forecastEnd} />}
    {(view.kind === 'profit' || view.kind === 'overview') &&
      <p className="chart-caption">{t('Gross profit is before operating expenses.', 'Bago ibawas ang gastos sa operasyon ang gross profit.')}
        {view.missingCosts && ' ' + t('Some sold items have no recorded cost. Review costs before relying on the estimate.',
          'May nabentang item na walang naitalang puhunan. Suriin muna ito bago gamitin ang tantiya.')}</p>}
    {view.kind === 'restock' && <p className="budget-note">
      {t('Recorded cash flow', 'Naitalang cash flow')} <strong>{peso(cash - view.expenses)}</strong>
      <span>{t('Check opening cash and other obligations before setting your order budget.',
        'Suriin ang opening cash at ibang obligasyon bago magtakda ng budget sa order.')}</span>
    </p>}
  </section>;
}
