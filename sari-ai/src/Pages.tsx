import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { add, api, forecast, ledger, peso, readStockNotes, runout, shortDate, stockExample } from './data';
import type { Agent, AskReply, Entry, Store } from './data';
import { Empty, Icon, Panel } from './ui';

import Notebook from './Notebook';

type PageProps = { store: Store; open: (entry: Entry) => void };
const reasons: Record<string, string> = { opening: 'Opening count', restock: 'Stock-in', count: 'Physical count', waste: 'Wastage', sale: 'Sale' };
const agentNames: Record<Agent, string> = {
  recording: 'Recording Agent',
  insights: 'Insights Agent',
  forecast: 'Forecast Agent',
  health: 'Health Monitor',
};
const suggestions: { question: string; agent: Agent }[] = [
  { question: 'Dagdag 24 na kape.', agent: 'recording' },
  { question: 'Which product sold most?', agent: 'insights' },
  { question: 'What needs restocking?', agent: 'forecast' },
  { question: 'Check my records', agent: 'health' },
];
const fallbackLabels = {
  unconfigured: 'AI gateway setup needed',
  unavailable: 'AI gateway unavailable',
  invalid: 'AI returned an unreadable draft',
  busy: 'AI gateway busy',
};

export function Stock({ store, open }: PageProps) {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState<'restock' | 'count' | 'waste'>('count');
  const [error, setError] = useState('');
  const byId = new Map(store.products.map((product) => [product.id, product]));
  const estimates = new Map(forecast(store).map((estimate) => [estimate.product.id, estimate.days]));
  useEffect(() => {
    function showHistory() {
      const [, section, productId] = window.location.hash.split('/');
      if (section !== 'history') return;
      const product = store.products.find(p => encodeURIComponent(p.id) === productId);
      setQuery(product?.name ?? '');
      document.getElementById('stock-history')?.scrollIntoView({ block: 'start' });
    }
    showHistory();
    window.addEventListener('hashchange', showHistory);
    return () => window.removeEventListener('hashchange', showHistory);
  }, [store.products]);
  const search = query.trim().toLowerCase();
  const products = store.products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(search));
  const movements = store.movements.filter((movement) =>
    [byId.get(movement.product_id)?.name, byId.get(movement.product_id)?.category, movement.note, reasons[movement.reason]]
      .filter(Boolean).join(' ').toLowerCase().includes(search));

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      open({ kind: 'stock', reason, lines: readStockNotes(notes, store.products) });
    } catch (problem) {
      setError((problem as Error).message);
    }
  }

  return <>
    <div className="page-heading"><div><h1>Stock</h1><p>Track shelf counts and turn notebook entries into stock records.</p></div>
      <div className="action-group">
        <button className="button secondary" onClick={() => open({ kind: 'product' })}>Add product</button>
        <button className="button primary" onClick={() => open({ kind: 'stock' })}><Icon name="plus" size={18} /> Log stock</button>
      </div>
    </div>
    <div className="stock-grid">
      <Panel title="Inventory" detail={`${store.products.length} products in Your Store`}>
        <label className="search-field"><Icon name="search" size={18} /><input aria-label="Search stock records" placeholder="Search products or categories" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="table-scroll"><table><thead><tr><th>Product</th><th>In stock</th><th>Stock cover</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{products.map((product) => <tr key={product.id}>
            <td><strong>{product.name}</strong><small>{product.category} · {product.unit}</small></td>
            <td><span className={product.stock <= product.threshold ? 'stock-tag' : 'count-tag'}>{product.stock}</span></td>
            <td>{runout(estimates.get(product.id) ?? null)}</td>
            <td><button className="icon-button" title={`Log stock for ${product.name}`} aria-label={`Log stock for ${product.name}`}
              onClick={() => open({ kind: 'stock', lines: [{ product_id: product.id, quantity: '', note: '' }] })}><Icon name="edit" size={17} /></button></td>
          </tr>)}</tbody>
        </table>{!products.length && <Empty>No products match your search.</Empty>}</div>
        <p className="panel-footnote">Stock cover uses units sold over the last 7 complete days and needs sales on at least 3 of those days.</p>
      </Panel>
      <Panel title="From your notebook"
        action={<span className="panel-icon mint"><Icon name="clipboard" size={18} /></span>}>
        <Notebook open={open} />
        <details className="batch-import"><summary>Enter multiple notebook rows</summary><form className="notebook" onSubmit={review}>
          <label>Stock entry type<select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
            <option value="count">Physical count</option><option value="restock">Stock-in</option><option value="waste">Wastage</option>
          </select></label>
          <label>Product, quantity, optional note<textarea rows={6} value={notes} onChange={(event) => setNotes(event.target.value)}
            placeholder={stockExample} required maxLength={30000} /></label>
          <button type="button" className="text-link" onClick={() => { setNotes(stockExample); setError(''); }}>Try sample rows</button>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full">Review stock entries <Icon name="arrow" size={17} /></button>
        </form></details>
      </Panel>
    </div>
    <div id="stock-history"><Panel title="Stock history" detail="Manual entries, adjustments, and sales">
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Product</th><th>Entry</th><th>Change</th><th>Stock after entry</th><th>Note</th></tr></thead>
        <tbody>{movements.slice(0, 100).map((movement) => <tr key={movement.id}>
          <td>{shortDate(movement.day)}</td><td><strong>{byId.get(movement.product_id)?.name}</strong></td>
          <td>{reasons[movement.reason] ?? movement.reason}</td><td>{movement.change > 0 ? '+' : ''}{movement.change}</td>
          <td>{movement.stock_after}</td><td>{movement.note || '—'}</td>
        </tr>)}</tbody></table>{!movements.length && <Empty>No stock movements match your search.</Empty>}</div>
      {movements.length > 100 && <p className="panel-footnote">Showing the latest 100 matching entries. Search for a product to narrow the list.</p>}
    </Panel></div>
  </>;
}

export function Sales({ store, open }: PageProps) {
  const [period, setPeriod] = useState('today');
  const [selected, setSelected] = useState<string | null>(null);
  const sales = store.sales.filter((sale) => period === 'all' || sale.day === store.today);
  const lookup = new Map(store.products.map((product) => [product.id, product.name]));
  const sale = sales.find((record) => record.id === selected);
  const lines = store.items.filter((item) => item.sale_id === selected);
  return <>
    <div className="page-heading"><div><h1>Sales</h1><p>Record a checkout and review what sold.</p></div>
      <button className="button primary" onClick={() => open({ kind: 'sale' })}><Icon name="plus" size={18} /> Record sale</button></div>
    <Panel title="Sales history" detail={`${sales.length} transactions · ${peso(add(sales, (item) => item.total))} in sales`}
      action={<select aria-label="Sales period" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="today">Today</option><option value="all">All dates</option></select>}>
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Products</th><th>Payment</th><th>Total</th><th><span className="sr-only">Details</span></th></tr></thead>
        <tbody>{sales.map((record) => <tr key={record.id}>
          <td>{shortDate(record.day)}</td><td><strong>{store.items.filter((item) => item.sale_id === record.id).map((item) =>
            `${lookup.get(item.product_id)} × ${item.quantity}`).join(', ')}</strong></td>
          <td>{record.method === 'cash' ? 'Cash' : 'Credit'}</td><td>{peso(record.total)}</td>
          <td><button className="text-link" type="button" onClick={() => setSelected(record.id)}>Details <Icon name="chevron" size={15} /></button></td>
        </tr>)}</tbody>
      </table>{!sales.length && <Empty>No sales in this period.</Empty>}</div>
    </Panel>
    {sale && <Panel title="Sale details" detail={`${shortDate(sale.day)} · ${sale.method === 'cash' ? 'Cash' : sale.customer}`}
      action={<button className="icon-button" aria-label="Close sale details" onClick={() => setSelected(null)}><Icon name="close" /></button>}>
      <div className="rank-list">{lines.map((item) => <div key={item.product_id}><strong>{lookup.get(item.product_id)}</strong>
        <span>{item.quantity} × {peso(item.price)}</span><span>{peso(item.quantity * item.price)}</span></div>)}</div>
      <p className="panel-footnote">Sale total {peso(sale.total)}</p>
    </Panel>}
  </>;
}

export function Expenses({ store, open }: PageProps) {
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');
  const categories = [...new Set(store.expenses.map((expense) => expense.category))].sort();
  const expenses = store.expenses.filter((expense) => (!category || expense.category === category) && (!date || expense.day === date));
  return <>
    <div className="page-heading"><div><h1>Expenses</h1><p>Record and review the cost of running Your Store.</p></div>
      <button className="button primary" onClick={() => open({ kind: 'expense' })}><Icon name="plus" size={18} /> Log expense</button></div>
    <Panel title="Operating expenses" detail={`${peso(add(expenses, (expense) => expense.amount))} across ${expenses.length} entries`}
      action={<div className="action-group"><select aria-label="Expense category" value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="">All categories</option>{categories.map((option) => <option key={option}>{option}</option>)}</select>
        <input type="date" aria-label="Expense date" value={date} max={store.today} onChange={(event) => setDate(event.target.value)} /></div>}>
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
        <tbody>{expenses.map((expense) => <tr key={expense.id}><td>{shortDate(expense.day)}</td><td><strong>{expense.description}</strong></td>
          <td>{expense.category}</td><td>{peso(expense.amount)}</td></tr>)}</tbody></table>
        {!expenses.length && <Empty>No expenses match these filters.</Empty>}</div>
    </Panel>
  </>;
}

export function Ledger({ store, open }: PageProps) {
  const customers = ledger(store);
  const history = [...store.sales.filter((sale) => sale.method === 'credit').map((sale) =>
    ({ ...sale, type: 'Credit sale', amount: sale.total })),
  ...store.payments.map((payment) => ({ ...payment, type: 'Repayment', amount: -payment.amount }))]
    .sort((a, b) => b.day.localeCompare(a.day));
  return <>
    <div className="page-heading"><div><h1>Ledger</h1><p>Review customer credit and repayments.</p></div>
      <button className="button primary" disabled={!customers.some(({ balance }) => balance > 0)}
        onClick={() => open({ kind: 'payment' })}><Icon name="plus" size={18} /> Record repayment</button></div>
    <Panel title="Customer balances" detail={`Outstanding balance · ${peso(add(customers, (customer) => customer.balance))}`}>
      {customers.length ? <div className="rank-list">{customers.map(({ name, balance }) => <div key={name}>
        <strong>{name}</strong><span>{peso(balance)}</span>{balance > 0
          ? <button className="text-link" onClick={() => open({ kind: 'payment', customer: name })}>Record payment</button>
          : <span>Paid</span>}
      </div>)}</div> : <Empty>No customer balances yet.</Empty>}
    </Panel>
    <Panel title="Ledger history"><div className="table-scroll"><table><thead><tr><th>Date</th><th>Customer</th><th>Entry</th><th>Change</th></tr></thead>
      <tbody>{history.map((entry) => <tr key={entry.id}><td>{shortDate(entry.day)}</td><td><strong>{entry.customer}</strong></td>
        <td>{entry.type}</td><td>{peso(entry.amount)}</td></tr>)}</tbody></table>
      {!history.length && <Empty>No Ledger entries yet.</Empty>}</div></Panel>
  </>;
}

export function Ask({ open, length }: Pick<PageProps, 'open'> & { length: number }) {
  const [message, setMessage] = useState('');
  const [agent, setAgent] = useState<Agent | 'auto'>('auto');
  const [period, setPeriod] = useState(length);
  const [thread, setThread] = useState<{ question: string; answer: AskReply }[]>([]);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');

  async function reply(question: string, selected = agent) {
    if (!question.trim() || pending) return;
    setPending(question);
    setError('');
    setMessage('');
    try {
      const answer = await api<AskReply>('ask', { question, agent: selected, period });
      setThread((items) => [...items, { question, answer }]);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Ask AI is unavailable. Try again.');
      setMessage(question);
    } finally {
      setPending('');
    }
  }
  return <>
    <div className="page-heading"><div><h1>Ask AI</h1><p>Explore the records behind your store’s numbers.</p></div></div>
    <Panel title="Ask Suki"
      action={<img className="suki-icon" src="/suki.svg" alt="" />}>
      <div className="ask-controls">
        <label>Agent<select value={agent} disabled={!!pending} onChange={(event) => setAgent(event.target.value as typeof agent)}>
          <option value="auto">Auto select</option>
          {Object.entries(agentNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></label>
        <label>Reporting period<select value={period} disabled={!!pending} onChange={(event) => setPeriod(Number(event.target.value))}>
          <option value={1}>Today</option><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option>
        </select></label>
      </div>
      <div className="suggestions">{suggestions.map(({ question, agent: exampleAgent }) => <button type="button" key={question}
        className="button secondary" disabled={!!pending} onClick={() => { void reply(question, exampleAgent); }}>{question}</button>)}</div>
      <div className="thread" aria-live="polite">
        {thread.map(({ question, answer }, index) => <div key={index}>
          <div className="question">{question}</div>
          <div className="answer"><img className="suki-icon" src="/suki.svg" alt="" />
            <div>
              <p className="answer-source"><strong>Suki · {agentNames[answer.agent]}</strong> · {answer.source === 'external' ? 'FreeLLMAPI' : 'Local fallback'}</p>
              {answer.reason && <p className="answer-status">{fallbackLabels[answer.reason]}</p>}
              <p className="answer-text">{answer.text}</p>
              {answer.draft && <button className="text-link" onClick={() => open({ ...answer.draft!, original: question, draftSource: answer.source })}>Review draft <Icon name="arrow" size={17} /></button>}
              {answer.agent !== 'recording' && <a className="evidence-link" href={answer.agent === 'insights' ? '#sales' : '#stock/history'}>{answer.agent === 'insights' ? 'See sales records' : 'View stock history'} →</a>}
              {!!answer.facts?.length && <details className="answer-evidence">
                <summary>View store figures</summary>
                <dl>{answer.facts.map(({ label, value }, factIndex) => <div key={factIndex}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              </details>}
            </div>
          </div>
        </div>)}
        {pending && <div><div className="question">{pending}</div><p className="answer-status" role="status">Preparing a response…</p></div>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="ask-form" onSubmit={(event) => { event.preventDefault(); void reply(message.trim()); }}>
        <input value={message} onChange={(event) => setMessage(event.target.value)} aria-label="Your question"
          placeholder="Ask a question or type “Restock 20 Coffee sachets”" maxLength={500} required />
        <button className="button primary" disabled={!!pending || !message.trim()}><span>Ask</span><Icon name="arrow" size={19} /></button>
      </form>
      <p className="panel-footnote">Use sample data. Questions and relevant store figures go to the configured AI provider when connected.</p>
    </Panel>
  </>;
}

export function More() {
  return <>
    <div className="page-heading"><div><h1>More</h1><p>Additional records for Your Store.</p></div></div>
    <Panel title="Your Store" detail="Demo store" action={<img className="suki-icon" src="/suki.svg" alt="Suki" />}>
      <div className="more-links">
        <a href="#expenses"><span className="panel-icon lilac"><Icon name="expense" /></span><div><strong>Expenses</strong><small>Log and review operating costs</small></div><Icon name="chevron" size={18} /></a>
        <a href="#ledger"><span className="panel-icon blue"><Icon name="ledger" /></span><div><strong>Ledger</strong><small>Balances and repayments</small></div><Icon name="chevron" size={18} /></a>
        <a href="#stock/history"><span className="panel-icon"><Icon name="stock" /></span><strong>Stock history</strong><Icon name="chevron" size={18} /></a>
      </div>
      <details className="batch-import"><summary>Help</summary><p>Open Stock to enter a notebook record. Ask Suki about your sales or stock cover, or choose Health Monitor to check your records.</p></details>
    </Panel>
  </>;
}
