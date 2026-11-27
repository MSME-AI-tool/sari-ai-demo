import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
// Recognition capability detection is the only browser read during server render.
globalThis.window = {};
after(() => server.close());
const pages = await server.ssrLoadModule('/src/Pages.tsx');
const { default: EntryDialog } = await server.ssrLoadModule('/src/EntryDialog.tsx');
const { default: Home } = await server.ssrLoadModule('/src/Home.tsx');
const store = {
  today: '2026-11-27', products: [{ id: 'coffee', name: 'Coffee', category: 'Drinks', unit: 'sachet', stock: 20, price: 1000, cost: 700, threshold: 5 }],
  sales: [{ id: 'sale', day: '2026-11-27', method: 'credit', customer: 'Customer A', total: 1000 }],
  items: [{ sale_id: 'sale', product_id: 'coffee', quantity: 1, price: 1000, cost: 700 }],
  movements: [], payments: [], expenses: [],
};
for (const page of ['Sales', 'Stock', 'Expenses', 'Ledger']) {
  test(`${page} keeps recording assistance inside its entry dialog`, () => {
    const html = renderToStaticMarkup(createElement(pages[page], { store, open() {} }));
    assert.doesNotMatch(html, /capture-form|Record (?:a sale|an expense|a repayment|with) (?:with )?Sari/);
    assert.doesNotMatch(html, /href="#stock\/record"/);
  });
}
for (const kind of ['sale', 'stock', 'expense', 'payment']) {
  test(`${kind} opens with Manual and With Sari choices while preserving confirmation`, () => {
    const html = renderToStaticMarkup(createElement(EntryDialog, { entry: { kind }, store, connected: true, close() {}, saved() {} }));
    assert.match(html, /aria-pressed="true"[^>]*>Manual</);
    assert.match(html, />With Sari</);
    assert.match(html, /Confirm and save/);
    assert.equal((html.match(/<form\b/g) ?? []).length, 1);
  });
}

test('Stock overview links to a separate history and forecasting view', () => {
  const html = renderToStaticMarkup(createElement(pages.Stock, { store, open() {} }));
  assert.match(html, /href="#stock\/history"[^>]*>Stock History</);
  assert.doesNotMatch(html, /<table|id="stock-history"|planner-fields/);
});
test('Sales overview has two charts and keeps history records on their own page', () => {
  const html = renderToStaticMarkup(createElement(pages.Sales, { store, open() {} }));
  assert.match(html, />Sales Trend</);
  assert.match(html, />Top Products</);
  assert.match(html, /href="#sales\/history"/);
  assert.doesNotMatch(html, /records-table|sale-details/);
});
test('dedicated history views retain sales corrections and stock records', () => {
  assert.equal(typeof pages.StockHistory, 'function');
  assert.equal(typeof pages.SalesHistory, 'function');
  const stockHtml = renderToStaticMarkup(createElement(pages.StockHistory, { store }));
  const salesHtml = renderToStaticMarkup(createElement(pages.SalesHistory, { store, open() {}, saleId: 'sale' }));
  assert.match(stockHtml, /records-table/);
  assert.doesNotMatch(stockHtml, /catalog-grid|planner-fields/);
  assert.match(salesHtml, /Correct Sale/);
  assert.match(salesHtml, /Customer A/);
});
test('Forecasting exposes the established method, its evidence, and the planner', () => {
  assert.equal(typeof pages.Forecasting, 'function');
  const html = renderToStaticMarkup(createElement(pages.Forecasting, { store }));
  assert.match(html, />Forecasting</);
  assert.match(html, /Past 7 days/);
  assert.match(html, /at least three/);
  assert.match(html, /href="#forecasting\/planner"/);
  assert.doesNotMatch(html, /planner-fields/);
  assert.match(html, /More sales history needed/);
});
test('Home separates its content into focused views and removes embedded recording', () => {
  const html = renderToStaticMarkup(createElement(Home, { store, open() {} }));
  assert.match(html, /href="#home\/products"/);
  assert.match(html, /href="#home\/money"/);
  assert.doesNotMatch(html, /capture-form|Record with Sari/);
});
test('Home product view has a product sales trend and Money has a pie chart', () => {
  const products = renderToStaticMarkup(createElement(Home, { store, open() {}, view: 'products' }));
  const money = renderToStaticMarkup(createElement(Home, { store: { ...store, expenses: [{ id: 'e', day: store.today, category: 'Rent', amount: 100 }] }, open() {}, view: 'money' }));
  assert.match(products, /Product Sales Trend/);
  assert.match(money, /expense-pie/);
});
test('Sales History includes a chart and the full report period picker', () => {
  const html = renderToStaticMarkup(createElement(pages.SalesHistory, { store, open() {} }));
  assert.match(html, /Sales by Item/);
  for (const label of ['3 Days', '1 Week', '1 Month', '6 Months', 'Set Custom Period']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /7 Complete Days/);
});
