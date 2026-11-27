import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ledger, peso, readStockNotes, stockExample } from './data';
import type { Entry, Line, Receipt, Store } from './data';
import { expenseLabels, localError, useLanguage } from './language';
import { Icon } from './ui';
import Notebook from './Notebook';

const routes = {
  sale: 'sales', product: 'products', stock: 'stock', expense: 'expenses', payment: 'payments',
  'sale-correction': 'sales/correction', 'product-details': 'products/details',
};
const emptyLine = (): Line => ({ product_id: '', quantity: '', note: '' });

async function photoThumbnail(file: File) {
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 360 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Choose a valid product photo.');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.76);
  } finally { image.close(); }
}

type EntryDialogProps = {
  entry: Entry; store: Store; connected: boolean; close: () => void; saved: (receipt: Receipt, entry: Entry) => void;
};

export default function EntryDialog(props: EntryDialogProps) {
  const { entry, store, connected, close } = props;
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'manual' | 'sari'>(entry.inputMode ?? 'manual');
  const [assistedOpened, setAssistedOpened] = useState(entry.inputMode === 'sari');
  const [draft, setDraft] = useState<Entry | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [assistedBusy, setAssistedBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const canAssist = ['sale', 'stock', 'expense', 'payment'].includes(entry.kind);
  const busy = manualBusy || assistedBusy || reviewBusy;
  const current = mode === 'sari' && draft ? draft : entry;
  const title = {
    sale: t('Record a sale', 'Itala ang benta'), product: t('Add a product', 'Magdagdag ng item'),
    stock: t('Log stock', 'Itala ang stock'), expense: t('Log an expense', 'Itala ang gastos'),
    payment: t('Record a repayment', 'Itala ang bayad'), 'sale-correction': t('Correct sale', 'Iwasto ang benta'),
    'product-details': t('Edit photo or cost', 'Baguhin ang litrato o puhunan'),
  }[current.kind];
  useEffect(() => { dialog.current?.showModal(); }, []);
  function reviewDraft(next: Entry) {
    setDraft(next);
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('.assisted-review input, .assisted-review select')?.focus());
  }
  function selectMode(next: 'manual' | 'sari') {
    if (busy) return;
    setMode(next);
    if (next === 'sari') setAssistedOpened(true);
  }
  return <dialog ref={dialog} className="entry-dialog" aria-labelledby="entry-title"
    onCancel={event => { event.preventDefault(); if (!manualBusy && !reviewBusy) close(); }}>
    <div className="entry-dialog-layout">
      <header className="dialog-header"><h2 id="entry-title">{title}</h2><button type="button" className="icon-button"
        aria-label={t('Close', 'Isara')} onClick={close} disabled={manualBusy || reviewBusy}><Icon name="close" /></button></header>
      {canAssist && <div className="entry-method" role="group" aria-label={t('Entry method', 'Paraan ng pagtatala')}>
        <button type="button" aria-pressed={mode === 'manual'} disabled={busy} onClick={() => selectMode('manual')}>{t('Manual', 'Manu-mano')}</button>
        <button type="button" aria-pressed={mode === 'sari'} disabled={busy} onClick={() => selectMode('sari')}>{t('With Sari', 'Kasama si Sari')}</button>
      </div>}
      <div className="entry-content" hidden={mode !== 'manual'}>
        <ManualEntryForm {...props} onBusyChange={setManualBusy} />
      </div>
      {canAssist && assistedOpened && <div className="entry-content" hidden={mode !== 'sari'}>
        <div className="assisted-entry dialog-fields" hidden={!!draft}>
          <p>{t('Describe the entry, speak, or read a photo. Sari will prepare a draft for you to check.',
            'Ilarawan ang tala, magsalita, o magbasa ng litrato. Gagawa si Sari ng draft na susuriin mo.')}</p>
          <Notebook open={reviewDraft} store={store} area={entry.kind as 'sale' | 'stock' | 'expense' | 'payment'} onBusyChange={setAssistedBusy} />
          {entry.kind === 'stock' && <BatchStockEntry store={store} open={reviewDraft} disabled={assistedBusy} />}
          {!connected && <p className="notice warning" role="status">{t('Reconnect to review and save entries.', 'Kumonekta muli para masuri at ma-save ang mga tala.')}</p>}
        </div>
        {draft && <div className="assisted-review"><div className="entry-review-back">
          <button type="button" className="text-link" disabled={reviewBusy} onClick={() => setDraft(null)}>{t('Back to Sari', 'Bumalik kay Sari')}</button>
        </div><ManualEntryForm {...props} entry={draft} onBusyChange={setReviewBusy} /></div>}
      </div>}
    </div>
  </dialog>;
}

function BatchStockEntry({ store, open, disabled }: { store: Store; open: (entry: Entry) => void; disabled: boolean }) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState<'restock' | 'count' | 'waste'>('count');
  const [error, setError] = useState('');
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    try { open({ kind: 'stock', reason, lines: readStockNotes(notes, store.products) }); }
    catch (problem) { setError(localError(t, problem)); }
  }
  return <details className="batch-import"><summary>{t('Paste multiple notebook rows', 'Mag-paste ng maraming linya')}</summary>
    <form className="notebook" onSubmit={review}><fieldset disabled={disabled}>
      <label>{t('Stock entry type', 'Uri ng tala sa stock')}<select value={reason} onChange={event => setReason(event.target.value as typeof reason)}>
        <option value="count">{t('Physical count', 'Aktuwal na bilang')}</option><option value="restock">Stock-in</option>
        <option value="waste">{t('Wastage', 'Sira o tapon')}</option></select></label>
      <label>{t('Product, quantity, optional note', 'Item, bilang, opsyonal na tala')}<textarea rows={4} value={notes}
        onChange={event => setNotes(event.target.value)} placeholder={stockExample} required maxLength={30000} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary">{t('Review stock entries', 'Suriin ang mga tala')} <Icon name="arrow" size={17} /></button>
    </fieldset></form></details>;
}

function ManualEntryForm({ entry, store, connected, close, saved, onBusyChange }: EntryDialogProps & { onBusyChange: (busy: boolean) => void }) {
  const { t } = useLanguage();
  const customerListId = useId();
  const [lines, setLines] = useState(entry.lines ?? [emptyLine()]);
  const [reason, setReason] = useState(entry.reason ?? 'restock');
  const [method, setMethod] = useState(entry.sale?.method ?? entry.method ?? 'cash');
  const [busy, setBusy] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [photo, setPhoto] = useState('');
  const [error, setError] = useState('');
  const customers = ledger(store);
  const isCorrection = entry.kind === 'sale-correction';
  const updatingStock = entry.kind === 'stock';
  const isSale = entry.kind === 'sale' || isCorrection;
  const catalog = new Map(store.products.map(product => [product.id, product]));
  const original = new Map(store.items.filter(item => item.sale_id === entry.sale?.id).map(item => [item.product_id, item]));
  const total = lines.reduce((sum, line) => sum + (original.get(line.product_id)?.price ?? catalog.get(line.product_id)?.price ?? 0)
    * (Number(line.quantity) || 0), 0);
  useEffect(() => { onBusyChange(busy || readingPhoto); }, [busy, readingPhoto, onBusyChange]);
  function update(index: number, patch: Partial<Line>) {
    setLines(current => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  async function selectPhoto(file: File) {
    if (file.size > 12_000_000) {
      setError(t('Choose a photo under 12 MB.', 'Pumili ng litratong mas maliit sa 12 MB.'));
      return;
    }
    setReadingPhoto(true); setError('');
    try { setPhoto(await photoThumbnail(file)); }
    catch { setError(t('Choose a JPEG, PNG, or WebP photo.', 'Pumili ng litratong JPEG, PNG, o WebP.')); }
    finally { setReadingPhoto(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || readingPhoto || !connected) return;
    setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const money = (name: string) => Math.round(Number(value(name)) * 100);
    const day = value('day');
    let body: object;
    if (entry.kind === 'product') {
      body = { day, name: value('name'), category: value('category'), unit: value('unit'), stock: Number(value('stock')),
        threshold: Number(value('threshold')), price: money('price'), cost: money('cost'), note: value('note'), photo };
    } else if (entry.kind === 'product-details') {
      body = { product_id: entry.product?.id, cost: money('cost'), photo };
    } else if (entry.kind === 'expense') {
      body = { day, category: value('category'), description: value('description'), amount: money('amount') };
    } else if (entry.kind === 'payment') {
      body = { day, customer: value('customer'), amount: money('amount') };
    } else {
      const entries = lines.map(line => {
        const supplier = updatingStock && reason === 'restock' && line.supplier_cost
          ? t('Supplier unit price', 'Presyo bawat yunit sa resibo') + ' ' + peso(Math.round(Number(line.supplier_cost) * 100)) : '';
        return { product_id: line.product_id, quantity: Number(line.quantity),
          note: [line.note.slice(0, supplier ? 420 : 500), supplier].filter(Boolean).join(' · ') };
      });
      body = isCorrection ? { sale_id: entry.sale?.id, revision: entry.sale?.revision ?? 0, note: value('correction'), entries } :
        updatingStock ? { day, reason, entries } : { day, method, customer: value('customer'), entries };
    }
    try { saved(await api<Receipt>(routes[entry.kind], body), entry); }
    catch (problem) { setError(localError(t, problem)); setBusy(false); }
  }

  return <form className="manual-entry-form" onSubmit={submit}>
      <div className="dialog-fields">
        {entry.original && <div className="draft-header"><small>{t('Original entry', 'Orihinal na tala')}</small>
          <blockquote>{entry.original}</blockquote><div className="sari-byline"><img src="/sari.svg" alt="" />
            <strong>{t('Sari’s draft', 'Draft ni Sari')}</strong></div></div>}
        {isCorrection && <p>{t('Correct the items or quantities. The original payment method, date, and customer apply.',
          'Iwasto ang item o bilang. Gagamitin ang orihinal na paraan ng bayad, petsa, at mamimili.')}</p>}
        {entry.kind !== 'product-details' && !isCorrection && <div className="field-grid">
          <label>{t('Date', 'Petsa')}<input name="day" type="date" defaultValue={entry.day ?? store.today} max={store.today} required /></label>
          {updatingStock && <label>{t('Stock entry type', 'Uri ng tala sa stock')}<select value={reason}
            onChange={event => setReason(event.target.value as typeof reason)}>
            <option value="restock">Stock-in</option><option value="count">{t('Physical count', 'Aktuwal na bilang')}</option>
            <option value="waste">{t('Wastage', 'Sira o tapon')}</option></select></label>}
          {isSale && <label>{t('Payment', 'Bayad')}<select value={method} onChange={event => setMethod(event.target.value as typeof method)}>
            <option value="cash">{t('Cash', 'Bayad agad')}</option><option value="credit">{t('Credit', 'Utang')}</option></select></label>}
        </div>}
        {entry.kind === 'product' && <>
          <label>{t('Product name', 'Pangalan ng item')}<input name="name" maxLength={100} required /></label>
          <div className="field-grid"><label>{t('Category', 'Kategorya')}<input name="category" maxLength={100} required /></label>
            <label>{t('Unit', 'Yunit')}<input name="unit" maxLength={100} required /></label>
            <label>{t('Selling price (₱)', 'Presyo (₱)')}<input name="price" type="number" step="0.01" min="0" max="100000" required /></label>
            <label>{t('Opening count', 'Panimulang bilang')}<input name="stock" type="number" min="0" max="1000000" defaultValue="0" required /></label>
            <label>{t('Low-stock threshold', 'Minimum na stock')}<input name="threshold" type="number" min="0" max="1000000" defaultValue="5" required /></label></div>
          <label>{t('Opening count note (optional)', 'Tala sa panimulang bilang (opsyonal)')}<input name="note" maxLength={500} /></label>
        </>}
        {(entry.kind === 'product' || entry.kind === 'product-details') && <>
          {entry.product && <strong>{entry.product.name}</strong>}
          <label>{t('Unit cost (₱)', 'Puhunan bawat yunit (₱)')}<input name="cost" type="number" step="0.01" min="0" max="100000"
            defaultValue={entry.product ? entry.product.cost / 100 : ''} required={entry.kind === 'product-details'} /></label>
          <label>{t('Product photo (optional)', 'Litrato ng item (opsyonal)')}<input type="file" accept="image/*" capture="environment"
            disabled={readingPhoto || busy} onChange={event => {
              const file = event.target.files?.[0];
              if (file) void selectPhoto(file);
            }} /></label>
          {(photo || entry.product?.photo) && <img className="entry-photo" src={photo || entry.product?.photo || ''} alt="" />}
        </>}
        {(isSale || updatingStock) && <>
          {updatingStock && <p className="field-help">{reason === 'count'
            ? t('Enter the total you counted on the shelf.', 'Ilagay ang kabuuang nabilang sa istante.')
            : reason === 'waste' ? t('Enter the quantity to remove.', 'Ilagay ang bilang na babawasan.')
              : t('Enter the quantity received in the unit shown.', 'Ilagay ang dami ng dumating sa yunit na ipinapakita.')}</p>}
          <div className="entry-lines">{lines.map((line, index) => {
            const product = catalog.get(line.product_id);
            const quantity = Number(line.quantity);
            const old = original.get(line.product_id)?.quantity ?? 0;
            const after = product ? (updatingStock && reason === 'count' ? quantity :
              product.stock + (updatingStock && reason === 'restock' ? quantity : old - quantity)) : 0;
            return <div className="line-fields" key={index}>
              <label>{t('Product', 'Item')}<select required value={line.product_id}
                onChange={event => update(index, { product_id: event.target.value })}>
                <option value="">{t('Choose a product', 'Pumili ng item')}</option>
                {store.products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.stock} {p.unit}</option>)}</select></label>
              <label>{t('Quantity', 'Bilang')}{product ? ' · ' + product.unit : ''}
                <input type="number" inputMode="numeric" value={line.quantity} min={reason === 'count' && updatingStock ? 0 : 1}
                  max="1000000" required onChange={event => update(index, { quantity: event.target.value })} /></label>
              <button type="button" className="icon-button remove-line" aria-label={t('Remove line', 'Alisin ang linya') + ' ' + (index + 1)}
                disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))}><Icon name="close" size={18} /></button>
              {product && line.quantity !== '' && <p className="line-note field-help">{t('Stock on hand', 'Natitirang stock')} · {product.stock} → {after} {product.unit}</p>}
              {updatingStock && reason === 'restock' && line.supplier_cost !== undefined &&
                <label className="line-note">{t('Supplier unit price (₱)', 'Presyo bawat yunit sa resibo (₱)')}
                  <input type="number" value={line.supplier_cost} min="0" max="100000" step="0.01"
                    onChange={event => update(index, { supplier_cost: event.target.value })} /></label>}
              {updatingStock && <label className="line-note">{t('Note (optional)', 'Detalye (opsyonal)')}<input value={line.note}
                maxLength={500} onChange={event => update(index, { note: event.target.value })} /></label>}
            </div>;
          })}</div>
          <button type="button" className="button subtle" disabled={lines.length >= 50} onClick={() => setLines([...lines, emptyLine()])}>
            <Icon name="plus" size={16} /> {t('Add another item', 'Magdagdag ng isa pang item')}</button>
          {isCorrection && <label>{t('Reason for correction', 'Dahilan ng pagwawasto')}<input name="correction" maxLength={200} required /></label>}
        </>}
        {entry.kind === 'sale' && method === 'credit' && <label>{t('Customer name', 'Pangalan ng mamimili')}
          <input name="customer" defaultValue={entry.customer} list={customerListId} maxLength={100} required />
          <datalist id={customerListId}>{customers.map(({ name }) => <option key={name} value={name} />)}</datalist></label>}
        {entry.kind === 'expense' && <>
          <label>{t('Description', 'Detalye')}<input name="description" defaultValue={entry.description} maxLength={100} required /></label>
          <div className="field-grid"><label>{t('Category', 'Kategorya')}<select name="category" defaultValue={entry.category}>
            {Object.entries(expenseLabels).map(([en, fil]) => <option key={en} value={en}>{t(en, fil)}</option>)}</select></label>
            <label>{t('Amount (₱)', 'Halaga (₱)')}<input name="amount" type="number" defaultValue={entry.amount}
              min="0.01" max="100000" step="0.01" required /></label></div>
        </>}
        {entry.kind === 'payment' && <div className="field-grid">
          <label>{t('Customer', 'Mamimili')}<select name="customer" defaultValue={entry.customer ?? ''} required>
            <option value="">{t('Choose a customer', 'Pumili ng mamimili')}</option>{customers.filter(({ balance }) => balance > 0)
              .map(({ name, balance }) => <option key={name} value={name}>{name} · {peso(balance)}</option>)}</select></label>
          <label>{t('Amount (₱)', 'Halaga (₱)')}<input name="amount" type="number" defaultValue={entry.amount}
            min="0.01" max="100000" step="0.01" required /></label></div>}
        {!connected && <p className="notice warning" role="status">{t('Reconnect to save this entry.', 'Kumonekta muli para mai-save ang tala.')}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="dialog-footer">
        {isSale && <strong className="sale-total">{method === 'credit' ? t('Credit', 'Utang') : t('Cash', 'Bayad agad')} · {peso(total)}</strong>}
        <button type="button" className="button secondary" onClick={close} disabled={busy}>{t('Cancel', 'Bumalik')}</button>
        <button className="button primary" disabled={busy || readingPhoto || !connected}>{busy ? t('Saving…', 'Sine-save…')
          : t('Confirm and save', 'Kumpirmahin at i-save')}</button>
      </footer>
    </form>;
}
