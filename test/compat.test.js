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
    const all = page.locator('#jewelTypeAll');
    assert.equal(await btn('dark').locator('.jewel-type__count').textContent(), '443');
    assert.equal(await btn('white').locator('.jewel-type__count').textContent(), '15');
    assert.equal(await btn('other').locator('.jewel-type__count').textContent(), '573');
    assert.equal(await all.getAttribute('aria-pressed'), 'true', '"ทั้งหมด" is on while nothing is picked');
    await btn('white').click();
    assert.equal(await all.getAttribute('aria-pressed'), 'false');
    await btn('other').click();
    assert.deepEqual((await readForm(page)).jewelTypes, ['white', 'other']);
    assert.equal(await btn('white').getAttribute('aria-pressed'), 'true');
    await btn('white').click();
    assert.deepEqual((await readForm(page)).jewelTypes, ['other']);
    const types = await page.evaluate(() => [...new Set(computeJewelPool().map((j) => j.type))]);
    assert.deepEqual(types, ['other']);
    await all.click();
    assert.deepEqual((await readForm(page)).jewelTypes, []);
    assert.equal(await all.getAttribute('aria-pressed'), 'true');
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

test('result tooltip shows the max stack from the Abilities tab', async () => {
  await withApp({}, async ({ page }) => {
    await page.evaluate(() => { abilities.get('โล่ซูเปอร์').maxStack = 3; });
    await page.evaluate(() => { window.setChipState(['โล่ซูเปอร์', 'โดรนก๊อปปี้', 'บัตรเชิญ', 'คุมเต๋า']); return window.calculate(); });
    await page.waitForSelector('#result .result-card');
    const tips = await page.$$eval('#result .jewel-column', (els) => els.map((e) => e.dataset.tooltip).join('\n'));
    assert.match(tips, /โล่ซูเปอร์: \d+% · สูงสุด 3 ขั้น/);
    assert.doesNotMatch(tips, /บัตรเชิญ: \d+% · สูงสุด/);
  });
});

const GROUP_SEL = ['กลุ่ม:โล่', 'โดรนก๊อปปี้', 'บัตรเชิญ', 'คุมเต๋า'];

test('whole-group requirements survive share links and saved presets', async () => {
  const url = await withApp({ search: packed({ sn: GROUP_SEL, un: ['กลุ่ม:หลุมดำ'] }) }, async ({ page }) => {
    assert.deepEqual((await readForm(page)).selected, GROUP_SEL);
    assert.deepEqual((await readForm(page)).unwanted, ['กลุ่ม:หลุมดำ']);
    return page.evaluate(() => buildShareURL());
  });
  const state = JSON.parse(LZString.decompressFromEncodedURIComponent(new URL(url).searchParams.get('d')));
  assert.deepEqual(state.sn, GROUP_SEL);
  await withApp({ search: new URL(url).search }, async ({ page }) => {
    assert.deepEqual((await readForm(page)).selected, GROUP_SEL);
  });

  const store = { version: 1, presets: [{ id: 'fav_g', name: 'กลุ่ม', createdAt: '2026-01-01T00:00:00.000Z',
    state: { selected: [...GROUP_SEL, 'กลุ่ม:ไม่มีจริง'], unwanted: [], topK: '10', char: '' } }] };
  await withApp({ localStorage: { lgr_filter_favorites_v1: JSON.stringify(store) } }, async ({ page }) => {
    await page.evaluate(() => document.getElementById('favoriteBtn').click());
    await page.locator('#favList .fav-item button', { hasText: 'ใช้ Filter นี้' }).first().click();
    assert.deepEqual((await readForm(page)).selected, GROUP_SEL, 'unknown group is skipped');
  });
});

test('browse by group: pick a whole group, its single skills merge into it (D5)', async () => {
  await withApp({}, async ({ page }) => {
    await page.evaluate(() => window.setChipState(['โล่ซูเปอร์', 'ขังคุก']));
    await page.evaluate(() => window.setUnwantedState(['โล่ขาว', 'ผลัก']));
    assert.equal(await page.isHidden('#chipGroupList'), true, 'folded by default');
    await page.click('#chipGroupToggle');
    assert.match(await page.textContent('#chipGroupList .chip-group-row[data-group="โล่"]'), /● 1/);
    await page.click('#chipGroupList .chip-group-row[data-group="โล่"]');
    await page.click('#chipGroupList .chip-group-all[data-group="โล่"]');
    const form = await readForm(page);
    assert.deepEqual(form.selected, ['ขังคุก', 'กลุ่ม:โล่']);
    assert.deepEqual(form.unwanted, ['ผลัก'], 'an unwanted shield cannot stay next to "any shield"');
    assert.match(await page.textContent('#toastMessage'), /รวม 1 สกิล/);
    assert.deepEqual(await page.$$eval('#chipSelected .chip', (b) => b.map((x) => x.textContent)), ['ขังคุก×', '🗂 โล่ (ทุกแบบ)×']);
    assert.match(await page.textContent('#chipGroupList .chip-group-row[data-group="โล่"]'), /● ทุกแบบ/);
    assert.equal(await page.locator('#chipGroupList .chip.is-covered').count(), 2, 'its skills are covered');
    // opening another group folds the first one
    await page.click('#chipGroupList .chip-group-row[data-group="ลูกเต๋า"]');
    assert.equal(await page.locator('#chipGroupList .chip-group-panel').count(), 1);
    // typing hides the group list and shows results under group headings
    await page.fill('#chipSearch', 'ยกเว้น');
    assert.equal(await page.isHidden('#chipGroupBrowse'), true);
    const heads = await page.$$eval('#chipAll .chip-group-head__title', (h) => h.map((x) =>
      x.querySelector('.chip-group-head__name').textContent + ' · ' + (x.querySelector('.chip-group-head__count')?.textContent || '')));
    assert.ok(heads.includes('ยกเว้นค่าผ่านทาง · 4'), heads.join(' | '));
    assert.equal(await page.locator('#chipAll .chip-group-all[data-group="ยกเว้นค่าผ่านทาง"]').count(), 1);
    // unwanted search: same headings, no "ทุกแบบ" for a group that is wanted
    await page.click('#chipUnwantedHeader');
    await page.fill('#chipUnwantedSearch', 'โล่');
    assert.equal(await page.locator('#chipUnwantedAll .chip-group-all[data-group="โล่"]').count(), 0);
  });
});

test('result card treats every skill of a wanted group as wanted', async () => {
  await withApp({}, async ({ page }) => {
    await page.evaluate(() => { window.setChipState(['กลุ่ม:โล่', 'โดรนก๊อปปี้', 'บัตรเชิญ', 'คุมเต๋า', 'กลุ่ม:ไดเมนชั่น']); return window.calculate(); });
    await page.waitForSelector('#result .result-card');
    const tips = await page.$$eval('#result .result-card:first-child .jewel-column', (els) => els.map((e) => e.dataset.tooltip).join('\n'));
    assert.match(tips, /✅ โล่(ซูเปอร์|ขาว)/);
    const missing = await page.$$eval('#result .row-miss', (els) => els.map((e) => e.textContent).join(' '));
    assert.doesNotMatch(missing, /กลุ่ม:/, 'missing groups are shown by label, not by token');
  });
});

test('up to 25 wanted skills; a 26th is refused', async () => {
  await withApp({}, async ({ page }) => {
    const n = await page.evaluate(() => {
      window.setChipState(_abilityList.slice(0, 30));
      return window._chipSelected.length;
    });
    assert.equal(n, 25);
    assert.match(await page.textContent('#selectedProgress'), /25\/25/);
  });
});

test('skills sharing a stack_key are flagged as a conflict with remove buttons', async () => {
  await withApp({}, async ({ page }) => {
    await page.evaluate(() => window.setChipState(['โล่ขาว', 'ยิงระเบิด']));
    assert.equal(await page.isHidden('#chipConflict'), true);
    await page.fill('#chipSearch', 'โล่ซูเปอร์');
    const hint = page.locator('#chipAll .chip.is-clash', { hasText: 'โล่ซูเปอร์' });
    assert.equal(await hint.count(), 1, 'search result warns before picking');
    await hint.click();
    assert.match(await page.textContent('#toastMessage'), /ใส่ในเซ็ตเดียวกับ/);
    assert.equal(await page.isVisible('#chipConflict'), true);
    assert.equal(await page.locator('#chipSelected .chip.is-conflict').count(), 2);
    await page.click('#chipConflict .chip-conflict__remove >> text=เอา โล่ขาว ออก');
    assert.deepEqual(await page.evaluate(() => window._chipSelected), ['ยิงระเบิด', 'โล่ซูเปอร์']);
    assert.equal(await page.isHidden('#chipConflict'), true);
    // a whole group never conflicts with one of its own skills' siblings
    assert.deepEqual(await page.evaluate(() => findRequirementConflicts(['กลุ่ม:โล่', 'ยิงระเบิด'])), []);
  });
});

test('result tooltip shows 📈 / 📉 / 🔒 from the Note columns', async () => {
  await withApp({}, async ({ page }) => {
    const tip = await page.evaluate(() => {
      const id = '[ไวท์] เรดมอนสเตอร์พิโรธ';
      const j = jewels.find((x) => x.id === id);
      Object.assign(j.substats.find((s) => s.name === 'แปลน 3 หลัง'), { note: 'หลัง 2 เทิร์น ลดลง -50%', decay: 50, decayAfter: 2 });
      Object.assign(j.substats.find((s) => s.name === 'กันวิคตอรี่'), { note: 'จำกัด 1 ครั้ง', limit: 1 });
      Object.assign(j.substats.find((s) => s.name === 'ป้องกันเอฟเฟคอันตราย'), { note: '+5% เมื่อไม่แสดงผล', grow: 5 });
      window.setChipState(['แปลน 3 หลัง', 'กันวิคตอรี่', 'ป้องกันเอฟเฟคอันตราย', 'ขังคุก']);
      renderResults([{ ids: [id], notMiss: 1, notIdx: [3], totalValue: 0, extraCount: 0, unwantedCount: 0 }], { skipTracking: true });
      return document.querySelector('#result .jewel-column').dataset.tooltip;
    });
    assert.equal(tip, [
      '✅ แปลน 3 หลัง: 80% · 📉 −50% หลัง 2 เทิร์น',
      '✨ ป้องกันบังคับย้ายและดักจับ: 70%',
      '✅ ป้องกันเอฟเฟคอันตราย: 65% · 📈 +5% เมื่อไม่แสดงผล',
      '✅ กันวิคตอรี่: 95% · 🔒 จำกัด 1 ครั้ง',
    ].join('\n'));
  });
});
