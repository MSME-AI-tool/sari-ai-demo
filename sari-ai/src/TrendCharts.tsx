import { useState } from 'react';
import { analyze, peso } from './data';
import type { Store } from './data';
import { autoGrouping, bucketLabel, productSeries, totalSeries } from './reporting';
import type { DateRange, Grouping } from './reporting';
import { GroupingControl } from './ReportControls';
import { useLanguage } from './language';
import { Empty } from './ui';

type ChartData = { buckets: string[]; series: { id: string; name: string; values: number[] }[] };
export function TrendChart({ data, grouping, label }: { data: ChartData; grouping: Grouping; label: string }) {
  const { t, language } = useLanguage();
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = data.series.filter(row => !hidden.includes(row.id));
  const peak = visible.reduce((maximum, row) => row.values.reduce((value, amount) => Math.max(value, amount), maximum), 100);
  const top = Math.ceil(peak / 100) * 100;
  const x = (i: number) => 18 + i * 680 / Math.max(1, data.buckets.length - 1);
  const y = (amount: number) => 210 - amount / top * 190;
  const color = (i: number) => `var(--chart-${i % 8 + 1})`;
  const labelFor = (day: string) => bucketLabel(day, grouping, language);
  if (!data.series.length) return <Empty>{t('No recorded sales in this period.', 'Walang naitalang benta sa saklaw na ito.')}</Empty>;
  return <div className="sales-trend">
    {data.series.length > 1 && <details className="chart-items"><summary>{t('Chart Items', 'Mga Item sa Graph')} · {visible.length}/{data.series.length}</summary>
      <button type="button" className="text-link" onClick={() => setHidden([])}>{t('Show All Items', 'Ipakita ang Lahat ng Item')}</button>
      <div className="series-legend">{data.series.map((row, i) => <button key={row.id} type="button" aria-pressed={!hidden.includes(row.id)}
        onClick={() => setHidden(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])}>
        <i style={{ background: color(i) }} />{row.name}</button>)}</div>
    </details>}
    {!visible.length ? <Empty>{t('Choose at least one chart item.', 'Pumili ng kahit isang item sa graph.')}</Empty> : <>
      <div className="trend-plot"><div className="trend-axis" aria-hidden="true"><span>{peso(top)}</span><span>{peso(top / 2)}</span><span>₱0</span></div>
        <svg viewBox="0 0 720 220" preserveAspectRatio="none" role="img" aria-label={label}>
          <title>{label}</title>
          {[20, 115, 210].map(line => <line key={line} x1="10" x2="706" y1={line} y2={line} stroke="var(--line)" />)}
          {visible.map(row => {
            const i = data.series.findIndex(item => item.id === row.id);
            return <g key={row.id}>
              <polyline points={row.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} fill="none" stroke={color(i)} strokeWidth="2.5"
                strokeDasharray={i >= 8 ? `${4 + Math.floor(i / 8) * 2} 4` : undefined} vectorEffect="non-scaling-stroke" />
              {row.values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r={data.buckets.length > 90 ? 2 : 3.5}
                fill={color(i)} tabIndex={0} aria-label={`${row.name}, ${labelFor(data.buckets[index])}, ${peso(value)}`}>
                <title>{`${row.name} · ${labelFor(data.buckets[index])} · ${peso(value)}`}</title></circle>)}
            </g>;
          })}
        </svg>
      </div>
      <div className="trend-dates">{[...new Set([0, Math.floor((data.buckets.length - 1) / 2), data.buckets.length - 1])].map(i => <span key={i}>{labelFor(data.buckets[i])}</span>)}</div>
      <div className="series-key">{visible.map(row => <span key={row.id}><i style={{ background: color(data.series.findIndex(item => item.id === row.id)) }} />{row.name}</span>)}</div>
    </>}
    <details className="chart-data"><summary>{t('View Chart Data', 'Tingnan ang Datos ng Graph')}</summary>
      <div className="table-scroll"><table><caption className="sr-only">{label}</caption><thead><tr><th>{t('Period', 'Saklaw')}</th>
        {data.series.map(row => <th key={row.id}>{row.name}</th>)}</tr></thead><tbody>{data.buckets.map((day, i) => <tr key={day}>
          <th>{labelFor(day)}</th>{data.series.map(row => <td key={row.id}>{peso(row.values[i])}</td>)}</tr>)}</tbody></table></div>
    </details>
  </div>;
}

export function ProductTrend({ store, range, top, title }: { store: Store; range: DateRange; top?: number; title?: string }) {
  const { t } = useLanguage();
  const [group, setGroup] = useState<Grouping | null>(null);
  const grouping = group ?? autoGrouping(range);
  const data = productSeries(store, range, grouping, top);
  const name = title ?? t('Product Sales Trend', 'Takbo ng Benta Bawat Item');
  return <section className="panel"><div className="panel-header"><h2>{name}</h2><GroupingControl value={grouping} change={setGroup} /></div>
    <p className="chart-caption">{top ? t('The top products by sales value in this period.', 'Mga nangungunang item ayon sa halaga ng benta sa saklaw na ito.')
      : t('Every item sold in the selected records is included. Choose chart items to compare.', 'Kasama ang bawat item na nabenta sa napiling mga tala. Pumili ng mga item na ihahambing.')}</p>
    <TrendChart data={data} grouping={grouping} label={name} />
  </section>;
}
export function SalesTrend({ store, range }: { store: Store; range: DateRange }) {
  const { t } = useLanguage();
  const [group, setGroup] = useState<Grouping | null>(null);
  const grouping = group ?? autoGrouping(range);
  return <section className="panel"><div className="panel-header"><h2>{t('Sales Trend', 'Takbo ng Benta')}</h2><GroupingControl value={grouping} change={setGroup} /></div>
    <TrendChart data={totalSeries(analyze(store, range).trend, range, grouping)} grouping={grouping} label={t('Recorded sales over time', 'Naitalang benta ayon sa panahon')} />
  </section>;
}
