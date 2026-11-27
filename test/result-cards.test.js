'use strict';
// Compact result cards: grouping similar sets, pendant details, quick starts, mobile summary.
const test = require('node:test');
const assert = require('node:assert/strict');
const { openApp, runSearch, closeEnv } = require('./helpers/app');

test.after(closeEnv);

const SIX = ['โดรนก๊อปปี้', 'โล่ซูเปอร์', 'ป้องกันเอฟเฟคอันตราย', 'แปลน 3 หลัง', 'บัตรเชิญ', 'คุมเต๋า'];

async function searchAndRender(page, scenario) {
  const out = await runSearch(page, scenario);
  assert.ok(out.results && out.results.length, 'search returned results');
  await page.waitForSelector('#result .result-card');
  return out.results;
}

test('similar sets share a card and the swap button walks through them', async () => {
  const { page, context, errors } = await openApp();
  try {
    const results = await searchAndRender(page, { selected: SIX, topK: 10 });
    const cards = page.locator('#result .result-card');
    const cardCount = await cards.count();
    assert.ok(cardCount < results.length, `${cardCount} cards for ${results.length} results`);
    assert.match(await page.textContent('#resultMeta'), new RegExp(`รวมเหลือ ${cardCount} แบบ`));

    // every result is still reachable: the ranks over all cards and variants are 1..N
    const seen = await page.evaluate(() => {
      const ranks = [];
      document.querySelectorAll('#result .result-card').forEach((card) => {
        const start = card.dataset.rank;
        do {
          ranks.push(Number(card.dataset.rank));
          const swap = card.querySelector('.jewel-swap');
          if (!swap) break;
          swap.click();
        } while (card.dataset.rank !== start);
      });
      return ranks.sort((a, b) => a - b);
    });
    assert.deepEqual(seen, results.map((_, i) => i + 1));

    // swapping changes the set (key) and the rank shown
    const grouped = page.locator('#result .result-card--grouped').first();
    const before = await grouped.getAttribute('data-key');
    await grouped.locator('.jewel-swap').click();
    assert.notEqual(await grouped.getAttribute('data-key'), before);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('tapping a pendant lists its skills and highlights the picked ones', async () => {
  const { page, context, errors } = await openApp();
  try {
    await searchAndRender(page, { selected: SIX, topK: 10 });
    const card = page.locator('#result .result-card').first();
    const tile = card.locator('.jewel-column').first();
    const id = await tile.getAttribute('data-jewel-id');
    await tile.locator('.jewel-main').click();
    await card.locator('.jewel-detail').waitFor();
    const want = await card.locator('.jd-item--want .jd-name').allTextContents();
    assert.ok(want.length > 0, 'pendant gives at least one wanted skill');
    const hl = await page.locator('#chipSelected .chip.is-hl').count();
    assert.equal(hl, want.length, 'one highlighted chip per wanted skill');
    assert.equal(await card.locator(`.jewel-column[data-jewel-id="${id}"] .jewel-main`).getAttribute('aria-expanded'), 'true');

    // close: details gone, highlight cleared
    await card.locator('.jewel-detail__close').click();
    assert.equal(await card.locator('.jewel-detail').count(), 0);
    assert.equal(await page.locator('#chipSelected .chip.is-hl').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('extra skills: first 5 shown, "+N อื่น ๆ" shows the rest, tap opens the add / skip menu', async () => {
  const { page, context, errors } = await openApp();
  try {
    await searchAndRender(page, { selected: SIX, topK: 10 });
    const card = page.locator('#result .result-card').first();
    const total = await card.locator('.extra-skill').count();
    if (total > 5) {
      assert.equal(await card.locator('.extra-skill:visible').count(), 5);
      await card.locator('.extra-more').click();
      assert.equal(await card.locator('.extra-skill:visible').count(), total);
    }
    const skill = await card.locator('.extra-skill').first().getAttribute('data-skill');
    await card.locator('.extra-skill').first().click();
    await page.locator('#skillActionMenu.show').waitFor();
    await page.locator('#skillActionMenu [data-skill-action="want"]').click();
    assert.ok((await page.evaluate(() => window._chipSelected)).includes(skill));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('equal scores show once in the header instead of on every card', async () => {
  const { page, context } = await openApp();
  try {
    const results = await searchAndRender(page, { selected: SIX, topK: 10 });
    const same = results.every((r) => r.totalValue === results[0].totalValue);
    assert.equal(await page.isVisible('#resultScoreNote'), same);
    assert.equal(await page.locator('#result .badge--score').count() === 0, same);
  } finally {
    await context.close();
  }
});

test('a search is remembered and can be run again from the empty state', async () => {
  const { page, context, errors } = await openApp();
  try {
    await page.evaluate(() => { localStorage.removeItem('recentSearches_v1'); });
    await searchAndRender(page, { selected: SIX, topK: 10 });
    await page.evaluate(() => rememberRecentSearch());
    await page.evaluate(() => resetAll());
    const quick = page.locator('#result .quick-start[data-quick="recent"]').first();
    await quick.waitFor();
    assert.match(await quick.textContent(), /6 สกิล/);
    await quick.click();
    await page.waitForSelector('#result .result-card', { timeout: 30000 });
    assert.deepEqual(await page.evaluate(() => window._chipSelected), SIX);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('mobile: the filter panel folds into a summary after a search and opens again', async () => {
  const { page, context, errors } = await openApp();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await searchAndRender(page, { selected: SIX, topK: 10 });
    await page.evaluate(() => collapseFilterPanelForResults());
    assert.equal(await page.isVisible('#filterSummary'), true);
    assert.equal(await page.isVisible('#chipSearch'), false);
    assert.match(await page.textContent('#filterSummaryChips'), /6\s*สกิล/);
    await page.click('#filterSummaryEdit');
    assert.equal(await page.isVisible('#chipSearch'), true);
    // the search button stays on screen while scrolling
    assert.equal(await page.isVisible('#calcBtn2'), true);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
