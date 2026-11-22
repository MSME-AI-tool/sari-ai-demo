import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { add, api, forecast, ledger, peso, readStockNotes, runout, shiftDay, shortDate, stockExample } from './data';
import type { AskReply, Entry, Product, Store } from './data';
import { Empty, Icon, Panel } from './ui';
import { expenseLabels, LanguageSelect, localError, useLanguage } from './language';
import { ProductPhoto, StockInsights, StockPlanner, StoreInsights } from './StoreTools';

import Notebook from './Notebook';

type PageProps = { store: Store; open: (entry: Entry) => void };
const reasons: Record<string, string> = { opening: 'Opening count', restock: 'Stock-in', count: 'Physical count', waste: 'Wastage', sale: 'Sale', correction: 'Sale correction' };
const filipinoReasons: Record<string, string> = { opening: 'Panimulang bilang', restock: 'Stock-in', count: 'Aktuwal na bilang', waste: 'Sira o tapon', sale: 'Benta', correction: 'Pagwawasto ng benta' };

export function Stock({ store, open }: PageProps) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState('');
  const [selectedMove, setSelectedMove] = useState('');
  const [planner, setPlanner] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState<'restock' | 'count' | 'waste'>('count');
  const [error, setError] = useState('');
  const byId = new Map(store.products.map(product => [product.id, product]));
  const estimates = new Map(forecast(store).map(row => [row.product.id, row.days]));
  const categories = [...new Set(store.products.map(product => product.category))].sort();
  useEffect(() => {
    function followStockLink() {
      const [, section, id, moveId] = window.location.hash.split('/');
      if (section === 'history') {
        setActive(id ?? '');
        setSelectedMove(moveId ?? '');
        requestAnimationFrame(() => document.getElementById(moveId ? 'movement-' + moveId : 'stock-history')?.scrollIntoView({ block: 'start' }));
      } else if (section === 'low') {
        setFilter('low');
      } else if (section === 'planner' || section === 'record') {
        requestAnimationFrame(() => document.getElementById('stock-' + section)?.scrollIntoView({ block: 'start' }));
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
  const movements = store.movements.filter(move => !active || move.product_id === active);
  const low = store.products.filter(product => product.stock <= product.threshold).length;
  const out = store.products.filter(product => product.stock === 0).length;

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try { open({ kind: 'stock', reason, lines: readStockNotes(notes, store.products) }); }
    catch (problem) { setError(localError(t, problem)); }
  }
  function move(product: Product, operation: 'restock' | 'count') {
    open({ kind: 'stock', reason: operation, lines: [{ product_id: product.id, quantity: '', note: '' }] });
  }

  return <>
    <header className="page-heading stock-heading"><div><h1>Stock</h1>
      <p>{t('Find an item, check what’s left, and update the shelf count.', 'Hanapin ang item, tingnan ang natitira, at i-update ang bilang.')}</p></div>
      <div className="action-group"><button className="button secondary" onClick={() => open({ kind: 'product' })}>
        <Icon name="plus" size={17} /> {t('Add product', 'Magdagdag ng item')}</button>
        <button className="button primary" onClick={() => open({ kind: 'stock' })}>{t('Log stock', 'Itala ang stock')}</button></div>
    </header>
    <nav className="stock-shortcuts" aria-label={t('Stock tools', 'Mga gamit sa stock')}>
      <a className="button secondary" href="#stock/record">{t('Record with Suki', 'Magtala kasama si Suki')}</a>
      <a className="button secondary" href="#stock/planner">{t('Restock planner', 'Plano sa dagdag na stock')}</a>
      <a className="button secondary" href="#stock/history">{t('Stock history', 'Stock history')}</a>
    </nav>
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
          <details className="catalog-more"><summary aria-label={t('Item actions', 'Mga aksiyon sa item')}>⋯</summary>
            <div><a href={'#stock/history/' + encodeURIComponent(product.id)}>{t('Stock history', 'Stock history')}</a>
              <button type="button" onClick={() => {
                setPlanner(product.id);
                requestAnimationFrame(() => document.getElementById('stock-planner')?.scrollIntoView({ block: 'start' }));
              }}>{t('Plan restock', 'Plano sa dagdag na stock')}</button>
              <button type="button" onClick={() => open({ kind: 'product-details', product })}>{t('Edit photo or cost', 'Baguhin ang litrato o puhunan')}</button></div>
          </details>
        </div></div>
      </article>)}</div>
      {!products.length && <Empty>{t('No products match your filters.', 'Walang item na tugma sa mga salaan.')}</Empty>}
      <a className="catalog-credits" href="/photo-credits.html">{t('Demo photo credits', 'Mga pinagmulan ng demo na litrato')}</a>
    </section>
    <div className="stock-tools">
      <div id="stock-record"><Panel title={t('Record with Suki', 'Magtala kasama si Suki')} action={<img className="suki-icon" src="/suki.svg" alt="" />}>
        <Notebook open={open} store={store} />
        <details className="batch-import"><summary>{t('Paste multiple notebook rows', 'Mag-paste ng maraming linya')}</summary>
          <form className="notebook" onSubmit={review}>
            <label>{t('Stock entry type', 'Uri ng tala sa stock')}<select value={reason} onChange={event => setReason(event.target.value as typeof reason)}>
              <option value="count">{t('Physical count', 'Aktuwal na bilang')}</option><option value="restock">Stock-in</option>
              <option value="waste">{t('Wastage', 'Sira o tapon')}</option></select></label>
            <label>{t('Product, quantity, optional note', 'Item, bilang, opsyonal na tala')}<textarea rows={4} value={notes}
              onChange={event => setNotes(event.target.value)} placeholder={stockExample} required maxLength={30000} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary">{t('Review stock entries', 'Suriin ang mga tala')} <Icon name="arrow" size={17} /></button>
          </form></details>
      </Panel></div>
      <div id="stock-planner"><StockPlanner key={planner} store={store} productId={planner} /></div>
    </div>
    <StockInsights store={store} />
    <div id="stock-history"><Panel title={t('Stock history', 'Stock history')}
      detail={active ? byId.get(active)?.name : t('Manual entries, adjustments, and sales', 'Mga tala, pagbabago, at benta')}
      action={<select aria-label={t('Filter stock history', 'Salain ang stock history')} value={active}
        onChange={event => { setActive(event.target.value); setSelectedMove(''); }}>
        <option value="">{t('All items', 'Lahat ng item')}</option>
        {store.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select>}>
      <div className="table-scroll"><table><thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Product', 'Item')}</th>
        <th>{t('Entry', 'Tala')}</th><th>{t('Change', 'Pagbabago')}</th><th>{t('Stock after', 'Natira')}</th><th>{t('Note', 'Detalye')}</th></tr></thead>
        <tbody>{movements.slice(0, 100).map(row => <tr key={row.id} id={'movement-' + row.id} className={selectedMove === row.id ? 'record-highlight' : ''}>
          <td>{shortDate(row.day, language)}</td><td><strong>{byId.get(row.product_id)?.name}</strong></td>
          <td>{t(reasons[row.reason] ?? row.reason, filipinoReasons[row.reason] ?? row.reason)}</td>
          <td>{row.change > 0 ? '+' : ''}{row.change}</td><td>{row.stock_after}</td><td>{row.note || '—'}</td>
        </tr>)}</tbody></table>{!movements.length && <Empty>{t('No stock movements yet.', 'Wala pang pagbabago sa stock.')}</Empty>}</div>
      {movements.length > 100 && <p className="panel-footnote">{t('Showing the latest 100 entries. Select a product to narrow the list.',
        'Huling 100 tala ang ipinapakita. Pumili ng item para paliitin ang listahan.')}</p>}
    </Panel></div>
  </>;
}

export function Sales({ store, open }: PageProps) {
  const { t, language } = useLanguage();
  const [period, setPeriod] = useState('1');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    function followSale() {
      const [, section, value] = window.location.hash.split('/');
      if (section === 'period' && ['1', '7', '14'].includes(value)) setPeriod(value);
      if (section === 'entry' && value) {
        setPeriod('all'); setSelected(value);
        requestAnimationFrame(() => document.getElementById('sale-details')?.scrollIntoView({ block: 'start' }));
      }
    }
    followSale();
    window.addEventListener('hashchange', followSale);
    return () => window.removeEventListener('hashchange', followSale);
  }, []);
  const sales = store.sales.filter(sale => period === 'all' || sale.day >= shiftDay(store.today, 1 - Number(period)));
  const lookup = new Map(store.products.map(product => [product.id, product.name]));
  const sale = sales.find(record => record.id === selected);
  const lines = store.items.filter(item => item.sale_id === selected);
  return <>
    <header className="page-heading"><div><h1>{t('Sales', 'Benta')}</h1>
      <p>{t('Record a checkout and review what sold.', 'Itala ang benta at suriin ang mga nabenta.')}</p></div>
      <button className="button primary" onClick={() => open({ kind: 'sale' })}><Icon name="plus" size={18} /> {t('Record sale', 'Itala ang benta')}</button></header>
    <div className="stock-tools">
      <Panel title={t('Record a sale with Suki', 'Itala ang benta kasama si Suki')}><Notebook open={open} store={store} area="sale" /></Panel>
      <StoreInsights store={store} />
    </div>
    {sale && <div id="sale-details"><Panel title={t('Sale details', 'Detalye ng benta')} detail={shortDate(sale.day, language) + ' · ' + (sale.method === 'cash' ? t('Cash', 'Bayad agad') : sale.customer)}
      action={<button className="button secondary" onClick={() => open({ kind: 'sale-correction', sale,
        lines: lines.map(item => ({ product_id: item.product_id, quantity: String(item.quantity), note: '' })) })}>
        {t('Correct sale', 'Iwasto ang benta')}</button>}>
      <div className="rank-list">{lines.map(item => <div key={item.product_id}><strong>{lookup.get(item.product_id)}</strong>
        <span>{item.quantity} × {peso(item.price)}</span><span>{peso(item.quantity * item.price)}</span></div>)}</div>
      <p className="panel-footnote">{t('Sale total', 'Kabuuang benta')} {peso(sale.total)}
        {!!sale.revision && ' · ' + t('Corrected', 'Naitama')}</p>
    </Panel></div>}
    <Panel title={t('Sales history', 'Mga tala ng benta')} detail={sales.length + ' · ' + peso(add(sales, item => item.total))}
      action={<select aria-label={t('Sales period', 'Saklaw ng benta')} value={period}
        onChange={event => { setPeriod(event.target.value); setSelected(null); }}>
        <option value="1">{t('Today', 'Ngayon')}</option><option value="7">{t('Last 7 days', 'Huling 7 araw')}</option>
        <option value="14">{t('Last 14 days', 'Huling 14 araw')}</option><option value="all">{t('All dates', 'Lahat ng petsa')}</option></select>}>
      <div className="table-scroll"><table><thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Products', 'Mga item')}</th>
        <th>{t('Payment', 'Bayad')}</th><th>{t('Total', 'Kabuuan')}</th><th><span className="sr-only">{t('Details', 'Detalye')}</span></th></tr></thead>
        <tbody>{sales.map(record => <tr key={record.id}><td>{shortDate(record.day, language)}</td>
          <td><strong>{store.items.filter(item => item.sale_id === record.id).map(item =>
            lookup.get(item.product_id) + ' × ' + item.quantity).join(', ')}</strong></td>
          <td>{record.method === 'cash' ? t('Cash', 'Bayad agad') : t('Credit', 'Utang')}</td><td>{peso(record.total)}</td>
          <td><a className="text-link" href={'#sales/entry/' + record.id}>{t('Details', 'Detalye')} <Icon name="chevron" size={15} /></a></td>
        </tr>)}</tbody>
      </table>{!sales.length && <Empty>{t('No sales in this period.', 'Walang benta sa panahong ito.')}</Empty>}</div>
    </Panel>
  </>;
}

export function Expenses({ store, open }: PageProps) {
  const { t, language } = useLanguage();
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');
  const categories = [...new Set(store.expenses.map(expense => expense.category))].sort();
  const expenses = store.expenses.filter(expense => (!category || expense.category === category) && (!date || expense.day === date));
  return <>
    <header className="page-heading"><div><h1>{t('Expenses', 'Gastos')}</h1>
      <p>{t('Record and review operating costs.', 'Itala at suriin ang gastos sa operasyon.')}</p></div>
      <button className="button primary" onClick={() => open({ kind: 'expense' })}><Icon name="plus" size={18} /> {t('Log expense', 'Itala ang gastos')}</button></header>
    <div className="stock-tools"><Panel title={t('Record an expense with Suki', 'Itala ang gastos kasama si Suki')}>
      <Notebook open={open} store={store} area="expense" /></Panel><StoreInsights store={store} expenses /></div>
    <Panel title={t('Operating expenses', 'Gastos sa operasyon')} detail={peso(add(expenses, expense => expense.amount)) + ' · ' + expenses.length}
      action={<div className="action-group"><select aria-label={t('Expense category', 'Kategorya ng gastos')} value={category}
        onChange={event => setCategory(event.target.value)}><option value="">{t('All categories', 'Lahat ng kategorya')}</option>
        {categories.map(option => <option key={option} value={option}>{t(option, expenseLabels[option] ?? option)}</option>)}</select>
        <input type="date" aria-label={t('Expense date', 'Petsa ng gastos')} value={date} max={store.today} onChange={event => setDate(event.target.value)} /></div>}>
      <div className="table-scroll"><table><thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Description', 'Detalye')}</th>
        <th>{t('Category', 'Kategorya')}</th><th>{t('Amount', 'Halaga')}</th></tr></thead>
        <tbody>{expenses.map(expense => <tr key={expense.id}><td>{shortDate(expense.day, language)}</td><td><strong>{expense.description}</strong></td>
          <td>{t(expense.category, expenseLabels[expense.category] ?? expense.category)}</td><td>{peso(expense.amount)}</td></tr>)}</tbody></table>
        {!expenses.length && <Empty>{t('No expenses match these filters.', 'Walang gastos na tugma sa mga salaan.')}</Empty>}</div>
    </Panel>
  </>;
}

export function Ledger({ store, open }: PageProps) {
  const { t, language } = useLanguage();
  const customers = ledger(store);
  const history = [...store.sales.filter(sale => sale.method === 'credit').map(sale =>
    ({ ...sale, type: t('Credit sale', 'Benta sa utang'), amount: sale.total })),
  ...store.payments.map(payment => ({ ...payment, type: t('Repayment', 'Bayad sa utang'), amount: -payment.amount }))]
    .sort((a, b) => b.day.localeCompare(a.day));
  return <>
    <header className="page-heading"><div><h1>{t('Ledger', 'Utang')}</h1><p>{t('Review customer credit and repayments.', 'Suriin ang utang at bayad ng mga mamimili.')}</p></div>
      <button className="button primary" disabled={!customers.some(({ balance }) => balance > 0)}
        onClick={() => open({ kind: 'payment' })}><Icon name="plus" size={18} /> {t('Record repayment', 'Itala ang bayad')}</button></header>
    <div className="stock-tools"><Panel title={t('Customer balances', 'Balanse ng mga mamimili')}
      detail={t('Outstanding', 'Natitirang utang') + ' · ' + peso(add(customers, customer => customer.balance))}>
      {customers.length ? <div className="rank-list">{customers.map(({ name, balance }) => <div key={name}>
        <strong>{name}</strong><span>{peso(balance)}</span>{balance > 0
          ? <button className="text-link" onClick={() => open({ kind: 'payment', customer: name })}>{t('Record payment', 'Itala ang bayad')}</button>
          : <span>{t('Paid', 'Bayad na')}</span>}
      </div>)}</div> : <Empty>{t('No customer balances yet.', 'Wala pang utang.')}</Empty>}
    </Panel><Panel title={t('Record a repayment with Suki', 'Itala ang bayad kasama si Suki')}>
      <Notebook store={store} open={open} area="payment" /></Panel></div>
    <Panel title={t('Ledger history', 'Mga tala ng utang at bayad')}><div className="table-scroll"><table>
      <thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Customer', 'Mamimili')}</th><th>{t('Entry', 'Tala')}</th><th>{t('Change', 'Pagbabago')}</th></tr></thead>
      <tbody>{history.map(entry => <tr key={entry.id}><td>{shortDate(entry.day, language)}</td><td><strong>{entry.customer}</strong></td>
        <td>{entry.type}</td><td>{peso(entry.amount)}</td></tr>)}</tbody></table>
      {!history.length && <Empty>{t('No ledger entries yet.', 'Wala pang tala.')}</Empty>}</div></Panel>
  </>;
}

export function Ask({ open, store }: PageProps) {
  const { language, t } = useLanguage();
  const [message, setMessage] = useState('');
  const [period, setPeriod] = useState(7);
  const [thread, setThread] = useState<{ question: string; answer: AskReply; recordContext: string }[]>([]);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const conversation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [thread, pending]);
  const examples = [
    t('What is my stock right now?', 'Ano ang stock ko ngayon?'),
    t('Why was cash lower than sales?', 'Bakit mas mababa ang natanggap na pera kaysa sa benta?'),
    t('What should I reorder?', 'Ano ang kailangan kong irestock?'),
    t('How do I record a repayment?', 'Paano magtala ng bayad sa utang?'),
  ];
  const destinations = {
    home: t('Open Home', 'Buksan ang Tindahan'), sales: t('Open Sales', 'Buksan ang Benta'),
    stock: t('Open Stock', 'Buksan ang Stock'), 'stock/history': t('View stock history', 'Tingnan ang stock history'),
    'stock/planner': t('Open restock planner', 'Buksan ang plano sa dagdag na stock'),
    expenses: t('Open Expenses', 'Buksan ang Gastos'), ledger: t('Open Ledger', 'Buksan ang Utang'),
  };

  async function reply(question: string, newTopic = false) {
    if (!question.trim() || pending) return;
    const previous = thread.at(-1);
    const followUp = /^(?:make (?:it|that)|change (?:it|that)|instead\b|palitan\b|gawing?\b|iyon\b|\d+\b)/i.test(question);
    const context = !newTopic && previous && (followUp || previous.answer.clarification) ? previous.recordContext : '';
    setPending(question); setError(''); setMessage('');
    try {
      const answer = await api<AskReply>('ask', { question, period, language, context });
      const recordContext = answer.agent === 'recording' ? [context, question, answer.text].filter(Boolean).join('\n').slice(0, 3900) : '';
      setThread(items => [...items, { question, answer, recordContext }]);
    } catch (problem) { setError(localError(t, problem)); setMessage(question); }
    finally { setPending(''); }
  }
  return <>
    <header className="page-heading"><div><h1>{t('Ask Suki', 'Tanungin si Suki')}</h1>
      <p>{t('Ask about store figures or get help with a task.', 'Magtanong tungkol sa mga tala o humingi ng tulong sa gawain.')}</p></div></header>
    <Panel title={t('Your conversation', 'Pag-uusap')} action={<img className="suki-icon" src="/suki.svg" alt="" />}>
      {store.ai_configured === false && <p className="notice" role="status">{t(
        'Live AI is disconnected. Suki can still check store records, guide you through the app, and prepare common drafts.',
        'Hindi nakakonekta ang Live AI. Maaari pa ring sumuri si Suki ng mga tala, gumabay sa app, at gumawa ng mga karaniwang draft.',
      )}</p>}
      <div className="ask-controls"><label>{t('Reporting period', 'Saklaw ng ulat')}
        <select value={period} disabled={!!pending} onChange={event => setPeriod(Number(event.target.value))}>
          <option value={1}>{t('Today', 'Ngayon')}</option><option value={7}>{t('Last 7 days', 'Huling 7 araw')}</option>
          <option value={14}>{t('Last 14 days', 'Huling 14 araw')}</option></select></label></div>
      <div className="suggestions">{examples.map(question => <button type="button" key={question}
        className="button secondary" disabled={!!pending} onClick={() => void reply(question, true)}>{question}</button>)}</div>
      <div className="thread" ref={conversation} aria-live="polite" aria-label={t('Conversation messages', 'Mga mensahe')} tabIndex={0}>
        {thread.map(({ question, answer }, index) => <div key={index}><div className="question">{question}</div>
          <div className="answer"><img className="suki-icon" src="/suki.svg" alt="" /><div>
            <p className="answer-source"><strong>Suki</strong> · {answer.source === 'external' ? t('Live AI', 'Live AI') :
              answer.source === 'guide' ? t('App guide', 'Gabay sa app') : t('Store records', 'Mga tala ng tindahan')}</p>
            <p className="answer-text">{answer.text}</p>
            {store.ai_configured !== false && answer.reason && <p className="answer-status">{t(
              'Live AI didn’t respond. This reply used the built-in assistant.',
              'Hindi sumagot ang Live AI. Galing ang sagot na ito sa built-in na assistant.',
            )}</p>}
            {answer.draft && <button className="text-link" onClick={() => open({ ...answer.draft!, original: question, draftSource: answer.source })}>
              {t('Review draft', 'Suriin ang draft')} <Icon name="arrow" size={17} /></button>}
            {answer.destination && <a className="evidence-link" href={'#' + answer.destination}>{destinations[answer.destination]} →</a>}
            {!!answer.facts?.length && <details className="answer-evidence"><summary>{t('View store figures', 'Tingnan ang mga bilang')}</summary>
              <dl>{answer.facts.map(({ label, value }, i) => <div key={i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}
          </div></div></div>)}
        {pending && <div><div className="question">{pending}</div><p role="status">{t('Preparing a response…', 'Inihahanda ang sagot…')}</p></div>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="ask-form" onSubmit={event => { event.preventDefault(); void reply(message.trim()); }}>
        <input value={message} onChange={event => setMessage(event.target.value)} aria-label={t('Your question', 'Tanong mo')}
          placeholder={t('Ask about your store', 'Magtanong tungkol sa tindahan')} maxLength={500} required />
        <button className="button primary" disabled={!!pending || !message.trim()}>{t('Ask', 'Magtanong')} <Icon name="arrow" size={18} /></button>
      </form>
      <p className="panel-footnote">{t('Use sample data. Questions and relevant store figures go to the AI provider when connected.',
        'Gumamit ng halimbawang datos. Ipinapadala ang tanong at kaugnay na bilang sa AI provider kapag nakakonekta.')}</p>
    </Panel>
  </>;
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
      <a href="#stock/history"><strong>Stock history</strong><Icon name="chevron" size={18} /></a>
      <a href="#stock/planner"><strong>{t('Restock planner', 'Plano sa dagdag na stock')}</strong><Icon name="chevron" size={18} /></a>
    </div></Panel>
  </>;
}
