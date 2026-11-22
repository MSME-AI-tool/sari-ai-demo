import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ledger, peso } from './data';
import type { Entry, Line, Store } from './data';
import { Icon } from './ui';

const titles = { sale: 'Record a sale', product: 'Add a product', stock: 'Log stock', expense: 'Log an expense', payment: 'Record a repayment' };
const routes = { sale: 'sales', product: 'products', stock: 'stock', expense: 'expenses', payment: 'payments' };
const emptyLine = (): Line => ({ product_id: '', quantity: '', note: '' });

export default function EntryDialog({ entry, store, close, saved }: {
  entry: Entry; store: Store; close: () => void; saved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [lines, setLines] = useState(entry.lines ?? [emptyLine()]);
  const [reason, setReason] = useState(entry.reason ?? 'restock');
  const [method, setMethod] = useState(entry.method ?? 'cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const customers = ledger(store);
  const total = lines.reduce((sum, line) => sum + (store.products.find((p) => p.id === line.product_id)?.price ?? 0)
    * (Number(line.quantity) || 0), 0);
  const updatingStock = entry.kind === 'stock';
  const isSale = entry.kind === 'sale';

  useEffect(() => { dialog.current?.showModal(); }, []);

  function update(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const money = (name: string) => Math.round(Number(value(name)) * 100);
    const day = value('day');
    let body: object;
    if (entry.kind === 'product') {
      body = { day, name: value('name'), category: value('category'), unit: value('unit'), stock: Number(value('stock')),
        threshold: Number(value('threshold')), price: money('price'), cost: money('cost'), note: value('note') };
    } else if (entry.kind === 'expense') {
      body = { day, category: value('category'), description: value('description'), amount: money('amount') };
    } else if (entry.kind === 'payment') {
      body = { day, customer: value('customer'), amount: money('amount') };
    } else {
      const entries = lines.map((line) => ({ ...line, quantity: Number(line.quantity) }));
      body = updatingStock ? { day, reason, entries } : { day, method, customer: value('customer'), entries };
    }

    try {
      await api(routes[entry.kind], body);
      saved();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="entry-dialog" onCancel={(event) => {
    event.preventDefault();
    if (!busy) close();
  }}>
    <form onSubmit={submit}>
      <header className="dialog-header"><h2>{titles[entry.kind]}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={close} disabled={busy}><Icon name="close" /></button>
      </header>
      <div className="dialog-fields">
        {entry.original && <div className="draft-header"><small>Original entry</small><blockquote>{entry.original}</blockquote>
          <div className="suki-byline"><img src="/suki.svg" alt=""/><strong>Suki’s draft</strong>
            {entry.draftSource === 'records' && <small>Local fallback</small>}</div></div>}
        <div className="field-grid">
          <label>Date<input name="day" type="date" defaultValue={entry.day ?? store.today} max={store.today} required /></label>
          {updatingStock && <label>Stock entry type<select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
            <option value="restock">Stock-in</option><option value="count">Physical count</option><option value="waste">Wastage</option>
          </select></label>}
          {isSale && <label>Payment<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
            <option value="cash">Cash</option><option value="credit">Credit</option>
          </select></label>}
        </div>

        {entry.kind === 'product' && <>
          <label>Product name<input name="name" placeholder="e.g. Sugar" maxLength={100} required /></label>
          <div className="field-grid">
            <label>Category<input name="category" placeholder="e.g. Pantry" maxLength={100} required /></label>
            <label>Unit<input name="unit" placeholder="e.g. pack" maxLength={100} required /></label>
            <label>Selling price (₱)<input name="price" type="number" step="0.01" min="0" max="100000" required /></label>
            <label>Unit cost (₱)<input name="cost" type="number" step="0.01" min="0" max="100000" /></label>
            <label>Opening count<input name="stock" type="number" min="0" max="1000000" defaultValue="0" required /></label>
            <label>Low-stock threshold<input name="threshold" type="number" min="0" max="1000000" defaultValue="5" required /></label>
          </div>
          <label>Opening count note <span>(optional)</span><input name="note" maxLength={500} placeholder="e.g. Copied from inventory notebook" /></label>
        </>}

        {(isSale || updatingStock) && <>
          {updatingStock && <p className="field-help">{
            reason === 'count' ? 'Enter the total number you physically counted.' :
              reason === 'waste' ? 'Enter the number of units to remove.' : 'Enter the number of units added to the shelf.'
          }</p>}
          <div className="entry-lines">{lines.map((line, index) => <div className="line-fields" key={index}>
            <label>Product<select required value={line.product_id} onChange={(event) => update(index, { product_id: event.target.value })}>
              <option value="">Choose a product</option>
              {store.products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.stock} in stock</option>)}
            </select></label>
            <label>{reason === 'count' && updatingStock ? 'Count' : 'Quantity'}
              <input type="number" value={line.quantity} min={reason === 'count' && updatingStock ? 0 : 1} max="1000000" required
                onChange={(event) => update(index, { quantity: event.target.value })} />
            </label>
            <button type="button" className="icon-button remove-line" aria-label={`Remove line ${index + 1}`}
              disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))}><Icon name="close" size={18} /></button>
            {updatingStock && line.product_id && line.quantity !== '' && <p className="line-note field-help">On hand · {(() => {
              const stock = store.products.find(p => p.id === line.product_id)?.stock ?? 0;
              const quantity = Number(line.quantity);
              const next = reason === 'count' ? quantity : stock + (reason === 'waste' ? -quantity : quantity);
              return stock + ' → ' + next;
            })()}</p>}
            {updatingStock && <label className="line-note">Note <span>(optional)</span>
              <input value={line.note} maxLength={500} placeholder="e.g. Count from notebook"
                onChange={(event) => update(index, { note: event.target.value })} />
            </label>}
          </div>)}</div>
          <button type="button" className="button subtle" disabled={lines.length >= 50} onClick={() => setLines([...lines, emptyLine()])}>
            <Icon name="plus" size={16} /> Add another item
          </button>
        </>}

        {isSale && method === 'credit' && <label>Customer name
          <input name="customer" defaultValue={entry.customer} list="customers" maxLength={100} required />
          <datalist id="customers">{customers.map(({ name }) => <option key={name} value={name} />)}</datalist>
        </label>}

        {entry.kind === 'expense' && <>
          <label>Description<input name="description" defaultValue={entry.description} maxLength={100} placeholder="e.g. Market trip fare" required /></label>
          <div className="field-grid"><label>Category<select name="category" defaultValue={entry.category}>
            {['Transport', 'Supplies', 'Utilities', 'Rent', 'Wages', 'Other'].map((category) => <option key={category}>{category}</option>)}
          </select></label><label>Amount (₱)<input name="amount" type="number" defaultValue={entry.amount} min="0.01" max="100000" step="0.01" required /></label></div>
        </>}

        {entry.kind === 'payment' && <div className="field-grid">
          <label>Customer<select name="customer" defaultValue={entry.customer ?? ''} required><option value="">Choose a customer</option>
            {customers.filter(({ balance }) => balance > 0).map(({ name, balance }) =>
              <option key={name} value={name}>{name} · {peso(balance)}</option>)}
          </select></label>
          <label>Amount (₱)<input name="amount" type="number" min="0.01" max="100000" step="0.01" required /></label>
        </div>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="dialog-footer">
        {isSale && <strong className="sale-total">{peso(total)}</strong>}
        <button type="button" className="button secondary" onClick={close} disabled={busy}>Cancel</button>
        <button className="button primary" disabled={busy}>{busy ? 'Saving…' : updatingStock && reason === 'restock' ? 'Confirm stock-in' : 'Save entry'}</button>
      </footer>
    </form>
  </dialog>;
}
