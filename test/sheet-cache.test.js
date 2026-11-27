'use strict';
// Refresh shows the cached sheet at once; the network copy replaces it only when it changed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeEnv } = require('./helpers/app');
const { compactSheetTable, expandSheetTable } = require('../js/sheet-cache.js');
const mainSheet = require('./fixtures/sheet-main.json');

test.after(closeEnv);

const ready = (page, timeout) => page.waitForFunction(() =>
  typeof _abilityListReady !== 'undefined' && _abilityListReady === true && window.__charSheetReady === true,
  null, { timeout });

test('compact cache form round-trips the cells the parsers read', () => {
  const back = expandSheetTable(compactSheetTable(mainSheet.table));
  assert.deepEqual(back.cols.map((c) => c.label), mainSheet.table.cols.map((c) => c.label));
  const row = mainSheet.table.rows[3].c.map((c) => (c == null ? null : (c.v ?? c.f ?? null)));
  assert.deepEqual(back.rows[3].c.map((c) => (c == null ? null : c.v)), row);
});

test('refresh renders from the cache while the sheet is still loading, then swaps in changed data', async () => {
  const { page, context, errors } = await openApp();
  try {
    const firstCount = await page.evaluate(() => jewels.length);
    assert.ok(await page.evaluate(() => !!localStorage.getItem('sheet_cache:main')), 'saved after the first load');
    assert.ok(await page.evaluate(() => !!localStorage.getItem('sheet_cache:chars')));

    // Second visit: the sheet answers slowly and with one pendant fewer.
    const fewer = JSON.stringify({ table: { ...mainSheet.table, rows: mainSheet.table.rows.slice(0, -1) } });
    let release;
    const gate = new Promise((r) => { release = r; });
    await context.route(/^https:\/\/docs\.google\.com\/.*gviz\/tq\?.*[?&]gid=0&/, async (route) => {
      await gate;
      const m = (new URL(route.request().url()).searchParams.get('tqx') || '').match(/responseHandler:([\w$]+)/);
      route.fulfill({ contentType: 'application/javascript', body: `${m ? m[1] : 'google.visualization.Query.setResponse'}(${fewer});` });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 5000);
    assert.equal(await page.evaluate(() => jewels.length), firstCount, 'cached data shown before the sheet answers');
    assert.equal(await page.evaluate(() => document.getElementById('overlay')?.classList.contains('show') || false), false);

    release();
    await page.waitForFunction((n) => jewels.length === n - 1, firstCount, { timeout: 10000 });
    assert.match(await page.textContent('#toastMessage'), /อัปเดตข้อมูลจี้ล่าสุด/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
