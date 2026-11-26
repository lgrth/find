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

// Old links/presets said darkOnly; it must come back as the [ดาร์ค] type filter.
const EXPECTED = { selected: SEL, unwanted: UNW, jewelTypes: ['dark'], topK: '20', char: CHAR };

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
    assert.deepEqual(form.jewelTypes, ['dark']);
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
  assert.deepEqual(Object.keys(state).sort(), ['c', 'k', 's', 'sn', 'ty', 'u', 'un']);
  assert.deepEqual(state.sn, SEL);
  assert.equal(state.ty, 1);
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
    // A persisted darkOnly checkbox was always overridden by the URL state on load;
    // the type filter likewise starts empty (= every pendant).
    assert.deepEqual(form.jewelTypes, []);
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
    selected: SEL, unwanted: [], topK: 50, jewelTypes: ['dark'], char: CHAR,
    state: { selected: SEL, unwanted: [], topK: 50, jewelTypes: ['dark'], char: CHAR },
  });
  assert.deepEqual(out.resultSets.items[0].snapshot, {
    key: 'x|y', names: ['x', 'y'], rank: 2, matchedCount: 0, missingCount: 0, extraCount: 0, totalValue: 120,
  });
});

test('legacy (non-compressed) share URL builder still writes the old parameters', async () => {
  await withApp({ search: packed({ sn: SEL, un: UNW, k: '20', m: 1, c: CHAR }) }, async ({ page }) => {
    const url = await page.evaluate(() => buildLegacyShareURL(new URL(location.origin + location.pathname), 'k1', readFilterState(), ['b', 'a']));
    const p = new URL(url).searchParams;
    const idx = await page.evaluate((n) => n.map((x) => _abilityList.indexOf(x)).join(','), SEL);
    assert.equal(p.get('s'), idx);
    assert.equal(p.get('k'), '20');
    assert.equal(p.get('ty'), '1');
    assert.equal(p.get('char'), CHAR);
    assert.equal(p.get('r'), 'k1');
    assert.equal(p.get('rn'), 'a||b');
  });
});

test('saving the current filter stores the same preset shape', async () => {
  await withApp({ search: packed({ sn: SEL, un: UNW, k: '20', m: 1, c: CHAR }) }, async ({ page }) => {
    await page.evaluate(() => document.getElementById('favoriteBtn').click());
    await page.click('#favSaveCurrent');
    await page.fill('#favSavePanel input', 'ชุดทดสอบ');
    await page.click('#favConfirmSave');
    const store = await page.evaluate(() => JSON.parse(localStorage.getItem('lgr_filter_favorites_v1')));
    assert.equal(store.presets.length, 1);
    assert.equal(store.presets[0].name, 'ชุดทดสอบ');
    assert.deepEqual(store.presets[0].state, { selected: SEL, unwanted: UNW, char: CHAR, jewelTypes: ['dark'], topK: '20' });
    const meta = await page.locator('#favList .fav-item__meta').first().textContent();
    assert.equal(meta, '4 สกิลที่ต้องการ • 2 สกิลที่ไม่ต้องการ • โมเสส • [ดาร์ค] เท่านั้น • 20 เซ็ต');
  });
});

test('new share link with several pendant types (ty bits)', async () => {
  await withApp({ search: packed({ sn: SEL, ty: 6 }) }, async ({ page }) => {
    assert.deepEqual((await readForm(page)).jewelTypes, ['white', 'other']);
    const url = await page.evaluate(() => buildShareURL());
    const state = JSON.parse(LZString.decompressFromEncodedURIComponent(new URL(url).searchParams.get('d')));
    assert.equal(state.ty, 6);
  });
  await withApp({ search: '?sel=' + encodeURIComponent(SEL[0]) + '&ty=5' }, async ({ page }) => {
    assert.deepEqual((await readForm(page)).jewelTypes, ['dark', 'other'], 'legacy query-string form');
  });
});

test('type buttons toggle independently, show counts and filter the search', async () => {
  await withApp({}, async ({ page }) => {
    const btn = (t) => page.locator(`#jewelTypeFilter .jewel-type[data-type="${t}"]`);
    assert.equal(await btn('dark').locator('.jewel-type__count').textContent(), '(447)');
    assert.equal(await btn('white').locator('.jewel-type__count').textContent(), '(15)');
    assert.equal(await btn('other').locator('.jewel-type__count').textContent(), '(569)');
    await btn('white').click();
    await btn('other').click();
    assert.deepEqual((await readForm(page)).jewelTypes, ['white', 'other']);
    assert.equal(await btn('white').getAttribute('aria-pressed'), 'true');
    await btn('white').click();
    assert.deepEqual((await readForm(page)).jewelTypes, ['other']);
    const types = await page.evaluate(() => [...new Set(computeJewelPool().map((j) => j.type))]);
    assert.deepEqual(types, ['other']);
  });
});

test('saved preset summary names the selected types', async () => {
  const store = { version: 1, presets: [{ id: 'p', name: 'x', createdAt: '2025-01-01T00:00:00.000Z',
    state: { selected: SEL, unwanted: [], topK: '10', jewelTypes: ['dark', 'white'], char: '' } }] };
  await withApp({ localStorage: { lgr_filter_favorites_v1: JSON.stringify(store) } }, async ({ page }) => {
    await page.evaluate(() => document.getElementById('favoriteBtn').click());
    const meta = await page.locator('#favList .fav-item__meta').first().textContent();
    assert.equal(meta, '4 สกิลที่ต้องการ • 0 สกิลที่ไม่ต้องการ • ไม่เลือกตัวละคร • [ดาร์ค] + [ไวท์] เท่านั้น • 10 เซ็ต');
  });
});

test('Abilities tab is loaded and its keywords are searchable', async () => {
  await withApp({}, async ({ page, errors }) => {
    const info = await page.evaluate(() => ({
      size: abilities.size,
      shield: abilities.get('โล่ซูเปอร์'),
      kw: window._abilityKeywords.get('โล่ซูเปอร์'),
    }));
    assert.equal(info.size, 142);
    assert.equal(info.shield.stackKey, 'โล่');
    assert.ok(info.kw.includes('โล่ไฮเปอร์'));
    await page.fill('#chipSearch', 'โล่ไฮเปอร์');
    assert.ok(await page.locator('#chipAll button.chip', { hasText: 'โล่ซูเปอร์' }).count() > 0);
    assert.deepEqual(errors, []);
  });
});
