import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { Window } from 'happy-dom';
import { createElement, act } from 'react';
import { createServer } from 'vite';

const browser = new Window({ url: 'http://localhost/' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'FormData'])
  Object.defineProperty(globalThis, name, { value: name === 'window' ? browser : browser[name], configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
browser.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
const { createRoot } = await import('react-dom/client');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { ReportControls, useReportPeriod } = await server.ssrLoadModule('/src/ReportControls.tsx');
const { TrendChart } = await server.ssrLoadModule('/src/TrendCharts.tsx');
const { default: EntryDialog } = await server.ssrLoadModule('/src/EntryDialog.tsx');
const store = { today: '2026-11-27', products: [{ id: 'coffee', name: 'Coffee', unit: 'sachet', price: 1000, cost: 500, stock: 20, threshold: 2 }],
  sales: [], items: [], movements: [], payments: [], expenses: [] };
let root, host;
const originalFetch = globalThis.fetch;
async function mount(component, props = {}) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(component, props)));
}
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); globalThis.fetch = originalFetch; });
after(async () => { await server.close(); await browser.happyDOM.close(); });
async function choose(select, value) { await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }); }
async function fill(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function click(button) { await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true }))); }
function button(text) { return [...host.querySelectorAll('button')].find(item => item.textContent === text); }
function ControlsHarness() {
  const control = useReportPeriod(store);
  return createElement('div', {}, createElement(ReportControls, { control }), createElement('output', {}, JSON.stringify(control.range)));
}
test('reporting presets update the applied date range and custom dates require Apply', async () => {
  await mount(ControlsHarness);
  await choose(host.querySelector('select'), '3days');
  assert.equal(host.querySelector('output').textContent, '{"start":"2026-11-25","end":"2026-11-27"}');
  await choose(host.querySelector('select'), '6months');
  assert.equal(host.querySelector('output').textContent, '{"start":"2026-05-28","end":"2026-11-27"}');
  await choose(host.querySelector('select'), 'custom');
  const dates = host.querySelectorAll('input[type="date"]');
  await fill(dates[0], '2026-10-01'); await fill(dates[1], '2026-10-31');
  assert.match(host.querySelector('output').textContent, /2026-05-28/);
  await click(button('Apply Dates'));
  assert.equal(host.querySelector('output').textContent, '{"start":"2026-10-01","end":"2026-10-31"}');
  await fill(dates[1], '2027-01-01'); await click(button('Apply Dates'));
  assert.ok(host.querySelector('[role="alert"]'));
  assert.equal(host.querySelector('output').textContent, '{"start":"2026-10-01","end":"2026-10-31"}');
});
test('chart item controls change visible series without dropping the underlying data', async () => {
  await mount(TrendChart, { data: { buckets: ['2026-11-27'], series: [{ id: 'a', name: 'Coffee', values: [100] }, { id: 'b', name: 'Sardines', values: [200] }] }, grouping: 'day', label: 'Sales by Item' });
  assert.equal(host.querySelectorAll('polyline').length, 2);
  await click(button('Coffee')); assert.equal(host.querySelectorAll('polyline').length, 1);
  assert.match(host.querySelector('.chart-data').textContent, /Coffee/);
  await click(button('Show All Items')); assert.equal(host.querySelectorAll('polyline').length, 2);
});
test('Manual and With Sari preserve manual inputs and review drafts in the same dialog', async () => {
  await mount(EntryDialog, { entry: { kind: 'sale' }, store, connected: true, close() {}, saved() {} });
  await choose(host.querySelector('.manual-entry-form select[required]'), 'coffee');
  await fill(host.querySelector('.manual-entry-form input[type="number"]'), '3');
  await click(button('With Sari'));
  assert.ok(host.querySelector('.capture-form'));
  assert.equal(host.querySelectorAll('form form').length, 0);
  await click(button('Manual'));
  assert.equal(host.querySelector('.manual-entry-form input[type="number"]').value, '3');
  await click(button('With Sari'));
  const textarea = host.querySelector('.capture-form textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Sold 2 Coffee');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  let writes = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/ask')) return new Response(JSON.stringify({ agent: 'recording', source: 'records', draft: { kind: 'sale', method: 'cash', lines: [{ product_id: 'coffee', quantity: '2', note: '' }] } }), { status: 200 });
    writes++; return new Response(JSON.stringify({ saved: true }), { status: 201 });
  };
  await act(async () => host.querySelector('.capture-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.ok(host.querySelector('.assisted-review'));
  assert.equal(host.querySelector('.assisted-review input[type="number"]').value, '2');
  assert.equal(writes, 0, 'A draft must not save before confirmation');
});
