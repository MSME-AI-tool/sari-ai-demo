import { StrictMode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './Home';
import EntryDialog from './EntryDialog';
import SariMascot from './SariMascot';
import { Ask, Expenses, Forecasting, RestockPlanning, Ledger, More, Sales, SalesHistory, Stock, StockHistory } from './Pages';
import { allPages, pages, records, resolveRoute } from './navigation';
import type { Page } from './navigation';
import { api } from './data';
import { peso } from './data';
import type { Entry, Receipt, Store } from './data';
import { Icon } from './ui';
import type { IconName } from './ui';
import { LanguageProvider, LanguageSelect, localError, useLanguage } from './language';
import './styles.css';

const filipinoPages: Record<Page, string> = {
  home: 'Tindahan', sales: 'Benta', stock: 'Stock', ask: 'Tanungin si Sari', more: 'Iba pa', expenses: 'Gastos', ledger: 'Utang',
  forecasting: 'Pagtataya', 'stock-history': 'Kasaysayan ng Stock', 'sales-history': 'Kasaysayan ng Benta',
  'restock-planner': 'Plano ng Pagdagdag ng Stock',
};

const readLocation = () => window.location.hash;
function onPageChange(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
function onConnectivityChange(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function NavLink({ id, label, icon, active }: { id: Page; label: string; icon: IconName; active: boolean }) {
  const { t } = useLanguage();
  return <a className={active ? 'nav-link active' : 'nav-link'} href={`#${id}`} aria-current={active ? 'page' : undefined}>
    <Icon name={icon} size={19} /><span>{t(label, filipinoPages[id])}</span>
  </a>;
}

function App() {
  const { t } = useLanguage();
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111326' : '#f7f7f7');
    try { localStorage.setItem('sari-theme', theme); } catch { /* Theme still works without storage. */ }
  }, [dark]);
  const themeToggle = (compact = false) => <button type="button"
    className={'theme-toggle' + (compact ? ' theme-toggle-mobile' : '')}
    aria-label={t('Dark mode', 'Madilim na tema')} aria-pressed={dark}
    title={dark ? t('Switch to light mode', 'Gumamit ng maliwanag na tema') : t('Switch to dark mode', 'Gumamit ng madilim na tema')}
    onClick={() => setDark(value => !value)}>
    <Icon name={dark ? 'sun' : 'moon'} size={19} />
    {!compact && <span>{t('Dark mode', 'Madilim na tema')}</span>}
  </button>;
  const location = useSyncExternalStore(onPageChange, readLocation);
  const route = resolveRoute(location);
  const page = route.page;
  const parentPage = page === 'sales-history' ? 'sales' : page === 'stock-history' ? 'stock' : page === 'restock-planner' ? 'forecasting' : page;
  const connected = useSyncExternalStore(onConnectivityChange, () => navigator.onLine);
  const [store, setStore] = useState<Store | null>(null);
  const [problem, setProblem] = useState('');
  const [entry, open] = useState<Entry | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const assistant = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const openEntry = useCallback((next: Entry) => {
    setChatOpen(false);
    open(next);
  }, []);

  useEffect(() => { setChatOpen(false); }, [page]);
  useEffect(() => {
    const dialog = assistant.current;
    if (!dialog) return;
    if (dialog.open) dialog.close();
    if (page === 'ask') dialog.show();
    else if (chatOpen) dialog.showModal();
  }, [chatOpen, page, !!store]);

  function closeChat() {
    setChatOpen(false);
    launcher.current?.focus();
  }

  const [notice, setNotice] = useState<{ receipt: Receipt; entry: Entry } | null>(null);
  const refreshId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    setProblem('');
    try {
      const snapshot = await api<Store>('store');
      if (id === refreshId.current) setStore(snapshot);
    } catch (error) {
      if (id === refreshId.current) setProblem(error instanceof Error ? error.message : 'Could not load store records.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);
  useEffect(() => { window.scrollTo(0, 0); }, [location]);

  const current = allPages.find(({ id }) => page === id) ?? pages[0];
  const controls = store ? { store, open: openEntry } : null;
  let content;
  if (controls) {
    if (page === 'home') content = <Home {...controls} view={route.homeView} />;
    else if (page === 'sales') content = <Sales {...controls} />;
    else if (page === 'stock') content = <Stock {...controls} />;
    else if (page === 'stock-history') content = <StockHistory key={location} store={controls.store} productId={route.productId} movementId={route.movementId} />;
    else if (page === 'sales-history') content = <SalesHistory key={location} {...controls} saleId={route.saleId} initialPeriod={route.period} initialRange={route.range} />;
    else if (page === 'forecasting') content = <Forecasting key={route.productId} store={controls.store} productId={route.productId} />;
    else if (page === 'restock-planner') content = <RestockPlanning key={route.productId} store={controls.store} productId={route.productId} />;
    else if (page === 'ask') content = null;
    else if (page === 'expenses') content = <Expenses {...controls} />;
    else if (page === 'ledger') content = <Ledger {...controls} />;
    else content = <More />;
  }

  return <div className="app">
    <a className="skip-link" href="#content" onClick={(event) => {
      event.preventDefault();
      document.getElementById('content')?.focus();
    }}>{t('Skip to content', 'Lumaktaw sa nilalaman')}</a>
    <aside className="sidebar">
      <a className="brand" href="#home"><img src={dark ? '/wordmark-light.svg' : '/wordmark.svg'} alt="SARI-AI" /></a>
      <div className="store-identity">
        <Icon name="shop" /><strong>{t('Your Store', 'Ang Tindahan Mo')}</strong></div>
      <nav className="side-nav" aria-label={t('Main navigation', 'Pangunahing menu')}>
        {pages.map((link) => <NavLink {...link} key={link.id} active={parentPage === link.id} />)}
      </nav>
      <nav className="side-nav records-nav" aria-label={t('Store records', 'Mga tala ng tindahan')}>
        <span>{t('RECORDS', 'MGA TALA')}</span>{records.map((link) => <NavLink {...link} key={link.id} active={page === link.id} />)}
      </nav>
      <div className="sidebar-footer">{themeToggle()}
        <span className="rail-status"><i />{connected ? t('Online', 'Konektado') : t('Offline', 'Walang koneksiyon')}</span>
      </div>
    </aside>

    <div className="workspace">
      <header className={page === 'home' ? "topbar home-topbar" : "topbar"}>
        <a href="#home" className="mobile-brand"><img src={dark ? '/wordmark-light.svg' : '/wordmark.svg'} alt="SARI-AI" /></a>
        <div className="breadcrumb"><span>{t('Your Store', 'Ang Tindahan Mo')}</span><Icon name="chevron" size={13} /><strong>{t(current.label, filipinoPages[page])}</strong></div>
        <div className="top-actions">
          <span className={connected && !problem ? 'status' : 'status disconnected'}><i />{
            !connected ? t('Offline', 'Walang koneksiyon') : problem ? t('Unavailable', 'Hindi maabot') : store ? t('Online', 'Konektado') : t('Connecting', 'Kumokonekta')
          }</span>
          <LanguageSelect />
          {themeToggle(true)}
          {parentPage !== 'sales' && page !== 'home' && <button className="button primary quick-sale" disabled={!store || !connected}
            onClick={() => openEntry({ kind: 'sale' })}><Icon name="plus" size={18} /> {t('Record Sale', 'Itala ang Benta')}</button>}
        </div>
      </header>
      <main id="content" tabIndex={-1} className="content">
        {!connected && <p role="status" className="notice warning">{t('Reconnect to save or refresh store records.', 'Kumonekta muli para mag-save o mag-refresh.')}</p>}
        {problem && <div role="alert" className="notice warning"><span>{localError(t, new Error(problem))}</span>
          <button className="text-link" onClick={() => void refresh()}>{t('Try again', 'Subukan muli')}</button></div>}
        {controls && <dialog ref={assistant} id="sari-assistant"
          className={page === 'ask' ? 'assistant-page' : 'assistant-drawer'}
          role={page === 'ask' ? 'region' : undefined}
          aria-labelledby={page === 'ask' ? 'ask-page-title' : 'sari-chat-title'}
          onCancel={event => { event.preventDefault(); closeChat(); }}
          onClose={() => { if (!chatOpen && page !== 'ask') launcher.current?.focus(); }}
          onClick={event => {
            if ((event.target as HTMLElement).closest('a[href^="#"]')) setChatOpen(false);
          }}>
          {page !== 'ask' && <header className="assistant-header">
            <SariMascot /><div><h2 id="sari-chat-title">{t('Ask Sari', 'Tanungin si Sari')}</h2>
              <p>{t('Help with your store', 'Tulong para sa tindahan')}</p></div>
            <button type="button" className="icon-button" aria-label={t('Close chat', 'Isara ang chat')}
              onClick={closeChat}><Icon name="close" /></button>
          </header>}
          <div className="assistant-body"><Ask {...controls} /></div>
        </dialog>}
        {content}
        {!controls && !problem && <div className="loading-store" role="status">
          <p>{t('Loading Your Store…', 'Binubuksan ang tindahan…')}</p>
          <div className="loading-summaries" aria-hidden="true"><span /><span /><span /></div>
        </div>}
      </main>
    </div>
    <nav className="bottom-nav" aria-label={t('Mobile navigation', 'Menu ng telepono')}>
      {pages.filter(link => link.id !== 'ask').map((link) => <NavLink {...link} key={link.id}
        active={parentPage === link.id || (link.id === 'more' && (page === 'ask' || records.some((record) => record.id === page)))} />)}
    </nav>
    {page !== 'ask' && !entry && <button type="button" ref={launcher} hidden={chatOpen}
      className="sari-launcher" aria-haspopup="dialog" aria-controls="sari-assistant"
      aria-expanded={chatOpen} onClick={() => setChatOpen(true)} disabled={!store}
      aria-label={t('Ask Sari, open chat assistant', 'Tanungin si Sari, buksan ang chat assistant')}>
      <SariMascot /><span>{t('Ask Sari', 'Tanungin si Sari')}</span>
    </button>}
    {entry && store && <EntryDialog entry={entry} store={store} connected={connected} close={() => open(null)} saved={(receipt, savedEntry) => {
      open(null);
      setNotice({ receipt, entry: savedEntry });
      void refresh();
    }} />}
    {notice && <SaveReceipt {...notice} close={() => setNotice(null)} />}
  </div>;
}

function SaveReceipt({ receipt, entry, close }: { receipt: Receipt; entry: Entry; close: () => void }) {
  const { t } = useLanguage();
  const isSale = entry.kind === 'sale' || entry.kind === 'sale-correction';
  const link = isSale ? '#sales/entry/' + receipt.id :
    entry.kind === 'payment' ? '#ledger' : entry.kind === 'expense' ? '#expenses' : '#stock/history/' + (receipt.stock?.[0]?.product_id ?? '');
  return <div className="save-receipt" role="status"><div className="receipt-title">
    <Icon name="check" /><strong>{t('Entry saved', 'Naitala na')}</strong>
    <button className="icon-button" aria-label={t('Dismiss receipt', 'Isara ang kumpirmasyon')} onClick={close}><Icon name="close" size={18} /></button>
    </div>{receipt.name && <p>{receipt.name}</p>}
    {receipt.total !== undefined && <p>{receipt.method === 'credit' ? t('Credit sale', 'Benta sa utang')
      : isSale ? t('Cash sale', 'Benta na bayad agad') : t('Amount', 'Halaga')} · {peso(receipt.total)}</p>}
    {receipt.balance !== undefined && <p>{t('Remaining credit', 'Natitirang utang')} · {receipt.customer} · {peso(receipt.balance)}</p>}
    {!!receipt.stock?.length && <ul>{receipt.stock.map(row => <li key={row.product_id}>{row.name} · {row.change > 0 ? '+' : ''}{row.change} {row.unit} · {row.on_hand} {t('on hand', 'natitira')}</li>)}</ul>}
    <a href={entry.kind === 'product' || entry.kind === 'product-details' ? '#stock' : link} onClick={close}>{t('View record', 'Tingnan ang tala')} →</a>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><LanguageProvider><App /></LanguageProvider></StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistration('/').then(registration => {
    if (registration?.active?.scriptURL === new URL('/sw.js', window.location.origin).href) return registration.unregister();
  }).catch(() => undefined);
}
