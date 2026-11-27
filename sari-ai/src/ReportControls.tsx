import { useState } from 'react';
import type { Store } from './data';
import { earliestRecord, periodRange, validateRange } from './reporting';
import type { DateRange, Grouping, ReportPreset } from './reporting';
import { useLanguage } from './language';

export function useReportPeriod(store: Store, initial?: DateRange, preset: ReportPreset = 'week') {
  const [range, setRange] = useState(initial && validateRange(initial, store.today) ? initial : periodRange(store.today, preset, earliestRecord(store)));
  const [choice, setChoice] = useState<ReportPreset>(initial ? 'custom' : preset);
  return { range, choice, setRange, setChoice, today: store.today, earliest: earliestRecord(store) };
}
export function ReportControls({ control, disabled = false }: { control: ReturnType<typeof useReportPeriod>; disabled?: boolean }) {
  const { t, language } = useLanguage();
  const [start, setStart] = useState(control.range.start), [end, setEnd] = useState(control.range.end);
  const [error, setError] = useState('');
  function choose(value: ReportPreset) {
    control.setChoice(value); setError('');
    if (value === 'custom') { setStart(control.range.start); setEnd(control.range.end); }
    else control.setRange(periodRange(control.today, value, control.earliest));
  }
  const display = (day: string) => new Date(day + 'T00:00:00Z').toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return <div className="report-controls">
    <label>{t('Reporting Period', 'Saklaw ng Ulat')}<select value={control.choice} disabled={disabled} onChange={event => choose(event.target.value as ReportPreset)}>
      <option value="today">{t('Today', 'Ngayon')}</option><option value="3days">{t('3 Days', '3 Araw')}</option>
      <option value="week">{t('1 Week', '1 Linggo')}</option><option value="month">{t('1 Month', '1 Buwan')}</option>
      <option value="6months">{t('6 Months', '6 Buwan')}</option><option value="all">{t('All Dates', 'Lahat ng Petsa')}</option>
      <option value="custom">{t('Set Custom Period', 'Itakda ang Sariling Saklaw')}</option>
      {control.choice === '14days' && <option value="14days">{t('14 Days', '14 Araw')}</option>}
      {control.choice === 'past7' && <option value="past7">{t('Past 7 days', 'Nakaraang 7 araw')}</option>}
    </select></label>
    {control.choice === 'custom' && <div className="custom-period">
      <label>{t('Start Date', 'Panimulang Petsa')}<input type="date" value={start} max={control.today} disabled={disabled} onChange={event => setStart(event.target.value)} /></label>
      <label>{t('End Date', 'Huling Petsa')}<input type="date" value={end} min={start} max={control.today} disabled={disabled} onChange={event => setEnd(event.target.value)} /></label>
      <button type="button" className="button secondary" disabled={disabled} onClick={() => {
        if (!validateRange({ start, end }, control.today)) { setError(t('Choose a valid start and end date, ending today or earlier. Shorten very long date ranges.', 'Pumili ng wastong simula at huling petsa na hindi lampas sa ngayon. Paikliin ang napakahabang saklaw.')); return; }
        control.setRange({ start, end }); setError('');
      }}>{t('Apply Dates', 'Gamitin ang mga Petsa')}</button>
    </div>}
    <p className="report-range">{t('Showing', 'Ipinapakita')} {display(control.range.start)}–{display(control.range.end)}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
export function GroupingControl({ value, change }: { value: Grouping; change: (group: Grouping) => void }) {
  const { t } = useLanguage();
  return <label className="chart-grouping">{t('Group Chart By', 'Pangkatin ang Graph')}<select value={value} onChange={event => change(event.target.value as Grouping)}>
    <option value="month">{t('Months', 'Mga Buwan')}</option><option value="week">{t('Weeks', 'Mga Linggo')}</option>
    <option value="day">{t('Days', 'Mga Araw')}</option></select></label>;
}
