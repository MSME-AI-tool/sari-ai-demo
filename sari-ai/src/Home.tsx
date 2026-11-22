import { add, analyze, peso, runout, shortDate, weekday } from './data';
import type { Entry, Store } from './data';
import { Icon } from './ui';
import Notebook from './Notebook';
import { StoreHealth, StoreInsights } from './StoreTools';
import { useLanguage } from './language';

function DailySales({ trend }: { trend: ReturnType<typeof analyze>['trend'] }) {
  const { t } = useLanguage();
  const peak = Math.max(10000, Math.ceil(Math.max(...trend.map(p => p.sales)) / 10000) * 10000);
  const coordinates = trend.map((p, i) => [8 + i * 584 / Math.max(1, trend.length - 1), 126 - 118 * p.sales / peak]);
  const last = coordinates[coordinates.length - 1];
  return <figure className="daily-sales"><figcaption>{t('Daily sales', 'Benta bawat araw')}</figcaption>
    <div className="line-plot"><div className="tick-labels"><span>{peso(peak)}</span><span>{peso(peak / 2)}</span><span>₱0</span></div>
    <svg viewBox="0 0 600 134" preserveAspectRatio="none" role="img" aria-label={trend.map(p => weekday(p.day) + ' ' + peso(p.sales)).join(', ')}>
      {[8,67,126].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#dce1e6" />)}
      <polyline points={coordinates.map(point => point.join(',')).join(' ')} fill="none" stroke="#155ee8" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
      <circle cx={last[0]} cy={last[1]} r="4.5" fill="#155ee8"/>
    </svg></div><div className="day-labels">{trend.map(p => <span key={p.day}>{weekday(p.day)}</span>)}</div></figure>;
}

export default function Home({ store, open }: { store: Store; open: (entry: Entry) => void }) {
  const { t, language } = useLanguage();
  const day = analyze(store, 1);
  const week = analyze(store, 7);
  const delta = day.sales - day.previousSales;
  const watch = week.forecasts.find(f => f.product.stock <= f.product.threshold || (f.days !== null && f.days < 3));
  const names = new Map(store.products.map(p => [p.id, p.name]));
  const date = new Date(store.today + 'T12:00:00Z').toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return <div className="overview">
    <header className="page-heading"><div><h1>{t('Store overview', 'Buod ng tindahan')}</h1><p>{date}</p></div>
      <button className="button primary desktop-only" onClick={() => open({ kind: 'sale' })}><Icon name="plus" />{t('Record sale', 'Itala ang benta')}</button></header>
    <section className="summary-spread"><div className="day-total"><h2>{t('Today’s sales', 'Benta ngayong araw')}</h2><strong>{peso(day.sales)}</strong>
      <p>{delta === 0 ? t('Same as yesterday', 'Katulad ng kahapon') : peso(Math.abs(delta)) +
        (delta > 0 ? t(' above yesterday', ' na mas mataas kaysa kahapon') : t(' below yesterday', ' na mas mababa kaysa kahapon'))}</p></div>
      <DailySales trend={week.trend}/><div className="spending">{t('Expenses today', 'Gastos ngayong araw')} <strong>{peso(day.expenses)}</strong></div></section>
    <div className="book-spread"><section className="recent"><header><h2>{t('Recent sales', 'Mga huling benta')}</h2><a href="#sales">{t('View all', 'Tingnan lahat')}</a></header>
      <table><thead><tr><th>{t('Date', 'Petsa')}</th><th>{t('Product', 'Item')}</th><th>{t('Qty', 'Bilang')}</th><th>{t('Amount', 'Halaga')}</th></tr></thead>
        <tbody>{store.sales.slice(0, 4).map(s => {
          const items = store.items.filter(i => i.sale_id === s.id);
          return <tr key={s.id}><td>{shortDate(s.day)}</td><td>{items.map(i => names.get(i.product_id)).join(', ')}</td><td>{add(items,i => i.quantity)}</td><td>{peso(s.total)}</td></tr>;
        })}</tbody></table>{!store.sales.length && <p>{t('No sales recorded yet.', 'Wala pang naitalang benta.')}</p>}</section>
      <section className="stock-watch"><h2>{t('Stock to watch', 'Stock na kailangang bantayan')}</h2>{watch ? <>
        <h3><i/>{watch.product.stock <= watch.product.threshold ? t('Low stock', 'Mababang stock') : t('Running low', 'Malapit maubos')} · {watch.product.name}</h3>
        <div className="suki-byline"><img src="/suki.svg" alt=""/><div><strong>{t('Suki’s estimate', 'Tantiya ni Suki')}</strong>
          <p>{runout(watch.days, language)}{watch.daily ? ' · ' + watch.daily.toFixed(1) + t(' units/day', ' bawat araw') : ''}</p></div></div>
        <div className="watch-footer"><span>{watch.product.stock} {t('on hand', 'natitira')}</span>
          <a href={'#stock/history/' + encodeURIComponent(watch.product.id)}>{t('View stock history', 'Tingnan ang stock history')}</a></div>
      </> : <p>{t('No products are running low.', 'Walang item na malapit maubos.')}</p>}
      <div className="desktop-only"><Notebook open={open} store={store} /></div></section></div>
    <div className="stock-tools"><StoreInsights store={store} /><StoreHealth store={store} open={open} /></div>
    <button className="button primary mobile-only full" onClick={() => open({ kind: 'sale' })}>{t('Record sale', 'Itala ang benta')}</button>
  </div>;
}
