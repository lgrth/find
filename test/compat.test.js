'use strict';
// Backward-compatibility tests: links people already shared and data people
// already saved in their browser must keep working after any refactor.
const test = require('node:test');
const assert = require('node:assert/strict');
const LZString = require('lz-string');
const { openApp, readForm, closeEnv } = require('./helpers/app');

test.after(closeEnv);

const SEL = ['โดรนก๊อปปี้', 'โล่ซูเปอร์', 'บัตรเชิญ', 'คุมเต๋า'];
const UNW = ['ผลัก', 'ขังฟองสบู่'];
const CHAR = 'โมเสส';

const packed = (state) => '?d=' + LZString.compressToEncodedURIComponent(JSON.stringify(state));

async function withApp(opts, fn) {
  const app = await openApp(opts);
  try { return await fn(app); } finally { await app.context.close(); }
}

async function abilityIndices(names) {
  return withApp({}, ({ page }) => page.evaluate((n) => n.map((x) => _abilityList.indexOf(x)), names));
}

const EXPECTED = { selected: SEL, unwanted: UNW, darkOnly: true, topK: '20', char: CHAR };

test('compressed share link with names (current format)', async () => {
  const search = packed({ s: [0], sn: SEL, un: UNW, k: '20', m: 1, c: CHAR });
  await withApp({ search }, async ({ page, errors }) => {
    assert.deepEqual(await readForm(page), EXPECTED);
    assert.deepEqual(errors, []);
  });
});

test('compressed share link with positional indices only (older format)', async () => {
  const s = await abilityIndices(SEL);
  const u = await abilityIndices(UNW);
  await withApp({ search: packed({ s, u, k: '20', m: 1, c: CHAR }) }, async ({ page }) => {
    assert.deepEqual(await readForm(page), EXPECTED);
  });
});

test('legacy query-string share link (?s=&u=&k=&d=1&char=)', async () => {
  const s = await abilityIndices(SEL);
  const u = await abilityIndices(UNW);
  const search = `?s=${s.join(',')}&u=${u.join(',')}&k=20&d=1&char=${encodeURIComponent(CHAR)}`;
  await withApp({ search }, async ({ page }) => {
    assert.deepEqual(await readForm(page), EXPECTED);
  });
});

test('legacy ?sel= link and ?dark=1 alias', async () => {
  const search = '?' + SEL.map((n) => 'sel=' + encodeURIComponent(n)).join('&') + '&dark=1';
  await withApp({ search }, async ({ page }) => {
    const form = await readForm(page);
    assert.deepEqual(form.selected, SEL);
    assert.equal(form.darkOnly, true);
  });
});

test('shared result link auto-runs the search', async () => {
  const search = packed({ sn: SEL, r: 'x|y' });
  await withApp({ search }, async ({ page }) => {
    await page.waitForFunction(() => Array.isArray(window._latestComputedResults), null, { timeout: 30000 });
    const n = await page.evaluate(() => window._latestComputedResults.length);
    assert.ok(n > 0);
  });
});

test('buildShareURL round-trips through a fresh page load', async () => {
  const url = await withApp({ search: packed({ sn: SEL, un: UNW, k: '20', m: 1, c: CHAR }) }, ({ page }) =>
    page.evaluate(() => buildShareURL()));
  const state = JSON.parse(LZString.decompressFromEncodedURIComponent(new URL(url).searchParams.get('d')));
  assert.deepEqual(Object.keys(state).sort(), ['c', 'k', 'm', 'r', 's', 'sn', 'u', 'un'].filter((k) => k !== 'r').sort());
  assert.deepEqual(state.sn, SEL);
  assert.equal(state.m, 1);
  await withApp({ search: new URL(url).search }, async ({ page }) => {
    assert.deepEqual(await readForm(page), EXPECTED);
  });
});

test('saved filter preset (lgr_filter_favorites_v1) still applies', async () => {
  const store = {
    version: 1,
    presets: [{
      id: 'fav_old', name: 'ชุดเก่า', createdAt: '2025-01-01T00:00:00.000Z',
      state: { selected: SEL, unwanted: UNW, topK: '20', darkOnly: true, char: CHAR },
    }],
  };
  await withApp({ localStorage: { lgr_filter_favorites_v1: JSON.stringify(store) } }, async ({ page }) => {
    await page.evaluate(() => document.getElementById('favoriteBtn').click());
    await page.locator('#favList .fav-item button', { hasText: 'ใช้ Filter นี้' }).first().click();
    assert.deepEqual(await readForm(page), EXPECTED);
  });
});

test('persisted form controls (persist:*) are restored', async () => {
  const ls = { 'persist:darkOnly': 'true', 'persist:topK': '30' };
  await withApp({ localStorage: ls }, async ({ page }) => {
    const form = await readForm(page);
    assert.equal(form.topK, '30');
    // Current behaviour: applyStateFromURL() always writes darkOnly from the URL,
    // so a persisted darkOnly is overridden to false on a plain page load.
    assert.equal(form.darkOnly, false);
  });
});

test('inventory (ownedJewelIds_v1) is loaded', async () => {
  const ids = ['[ดาร์ค] พีชมอนสเตอร์', '[ไวท์] UFO สตาร์เกต'];
  await withApp({ localStorage: { ownedJewelIds_v1: JSON.stringify(ids) } }, async ({ page }) => {
    assert.equal(await page.evaluate(() => getOwnedCount()), 2);
  });
});

test('import file v1 is normalised the same way', async () => {
  const payload = {
    app: 'lgrth-find', version: 1, exportedAt: '2025-02-02T00:00:00.000Z',
    inventory: { version: 1, ids: ['a', 'a', ' b '] },
    favorites: { version: 1, presets: [{ id: 'f1', name: 'n', createdAt: '2025-01-01T00:00:00.000Z', selected: SEL, darkOnly: true, topK: 99, char: CHAR }] },
    resultSets: { version: 1, items: [{ id: 'r1', name: 'set', createdAt: '2025-01-01T00:00:00.000Z', names: ['x', 'y'], snapshot: { rank: 2, totalValue: 120 } }] },
  };
  const out = await withApp({}, ({ page }) => page.evaluate((p) => normalizeTransferPayload(p), payload));
  assert.deepEqual(out.inventory, { version: 1, ids: ['a', 'b'] });
  assert.deepEqual(out.favorites.presets[0], {
    id: 'f1', name: 'n', createdAt: '2025-01-01T00:00:00.000Z',
    selected: SEL, unwanted: [], topK: 50, darkOnly: true, char: CHAR,
    state: { selected: SEL, unwanted: [], topK: 50, darkOnly: true, char: CHAR },
  });
  assert.deepEqual(out.resultSets.items[0].snapshot, {
    key: 'x|y', names: ['x', 'y'], rank: 2, matchedCount: 0, missingCount: 0, extraCount: 0, totalValue: 120,
  });
});
