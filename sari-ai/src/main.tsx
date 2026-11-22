import { StrictMode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './Home';
import EntryDialog from './EntryDialog';
import { Ask, Expenses, Ledger, More, Sales, Stock } from './Pages';
import { api } from './data';
import type { Entry, Store } from './data';
import { Icon } from './ui';
import type { IconName } from './ui';
import './styles.css';

const pages = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'sales', label: 'Sales', icon: 'sales' },
  { id: 'stock', label: 'Stock', icon: 'stock' },
  { id: 'ask', label: 'Ask AI', icon: 'ai' },
  { id: 'more', label: 'More', icon: 'more' },
] as const;
const records = [
  { id: 'expenses', label: 'Expenses', icon: 'expense' },
  { id: 'ledger', label: 'Ledger', icon: 'ledger' },
] as const;
const allPages = [...pages, ...records];
type Page = typeof allPages[number]['id'];
type InstallPrompt = Event & { prompt: () => Promise<unknown> };

function readPage(): Page {
  const route = window.location.hash.slice(1).split('/')[0];
  return allPages.find(({ id }) => route === id)?.id ?? 'home';
}
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
  return <a className={active ? 'nav-link active' : 'nav-link'} href={`#${id}`} aria-current={active ? 'page' : undefined}>
    <Icon name={icon} size={19} /><span>{label}</span>
  </a>;
}

function App() {
  const page = useSyncExternalStore(onPageChange, readPage);
  const connected = useSyncExternalStore(onConnectivityChange, () => navigator.onLine);
  const [store, setStore] = useState<Store | null>(null);
  const [problem, setProblem] = useState('');
  const [entry, open] = useState<Entry | null>(null);

  const [notice, setNotice] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
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
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    function offerInstall(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    }
    function installed() { setInstallPrompt(null); }
    window.addEventListener('beforeinstallprompt', offerInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', offerInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const current = allPages.find(({ id }) => page === id) ?? pages[0];
  const controls = store ? { store, open } : null;
  let content;
  if (controls) {
    if (page === 'home') content = <Home {...controls} />;
    else if (page === 'sales') content = <Sales {...controls} />;
    else if (page === 'stock') content = <Stock {...controls} />;
    else if (page === 'ask') content = <Ask {...controls} length={7} />;
    else if (page === 'expenses') content = <Expenses {...controls} />;
    else if (page === 'ledger') content = <Ledger {...controls} />;
    else content = <More />;
  }

  return <div className="app">
    <a className="skip-link" href="#content" onClick={(event) => {
      event.preventDefault();
      document.getElementById('content')?.focus();
    }}>Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="#home"><img className="shop-mark" src="/suki.svg" alt="" /><img src="/wordmark.svg" alt="SARI-AI" /></a>
      <div className="store-identity">
        <span><strong>Your Store</strong></span></div>
      <nav className="side-nav" aria-label="Main navigation">
        {pages.map((link) => <NavLink {...link} key={link.id} active={page === link.id} />)}
      </nav>
      <nav className="side-nav records-nav" aria-label="Store records">
        <span>RECORDS</span>{records.map((link) => <NavLink {...link} key={link.id} active={page === link.id} />)}
      </nav>
      {installPrompt && <button className="install-button" onClick={async () => {
        await installPrompt.prompt().catch(() => undefined);
        setInstallPrompt(null);
      }}><Icon name="download" size={18} /> Install SARI-AI</button>}
      <span className="rail-status"><i />{connected ? "Online" : "Offline"}</span>
    </aside>

    <div className="workspace">
      <header className={page === 'home' ? "topbar home-topbar" : "topbar"}>
        <a href="#home" className="mobile-brand"><img src="/wordmark.svg" alt="SARI-AI" /></a>
        <div className="breadcrumb"><span>Your Store</span><Icon name="chevron" size={13} /><strong>{current.label}</strong></div>
        <div className="top-actions">
          <span className={connected && !problem ? 'status' : 'status disconnected'}><i />{
            !connected ? 'Offline' : problem ? 'Unavailable' : store ? 'Online' : 'Connecting'
          }</span>
          {installPrompt && <button className="icon-button mobile-install" aria-label="Install SARI-AI" onClick={async () => {
            await installPrompt.prompt().catch(() => undefined);
            setInstallPrompt(null);
          }}><Icon name="download" size={18} /></button>}
          <button className="button primary quick-sale" disabled={!store || !connected}
            onClick={() => open({ kind: 'sale' })}><Icon name="plus" size={18} /> Record sale</button>
        </div>
      </header>
      <main id="content" tabIndex={-1} className="content">
        {!connected && <p role="status" className="notice warning">Reconnect to save or refresh store records.</p>}
        {problem && <div role="alert" className="notice warning"><span>{problem}</span>
          <button className="text-link" onClick={() => void refresh()}>Try again</button></div>}
        {content ?? (!problem && <p className="empty" role="status">Loading Your Store…</p>)}
      </main>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {pages.map((link) => <NavLink {...link} key={link.id}
        active={page === link.id || (link.id === 'more' && records.some((record) => record.id === page))} />)}
    </nav>
    {entry && store && <EntryDialog entry={entry} store={store} close={() => open(null)} saved={() => {
      open(null);
      setNotice('Entry saved.');
      void refresh();
    }} />}
    {notice && <div className="toast" role="status"><Icon name="check" size={19} />{notice}</div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
