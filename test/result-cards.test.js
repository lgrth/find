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

test('similar sets share a card and the picker lists every set to choose from', async () => {
  const { page, context, errors } = await openApp();
  try {
    const results = await searchAndRender(page, { selected: SIX, topK: 10 });
    const cards = page.locator('#result .result-card');
    const cardCount = await cards.count();
    assert.ok(cardCount < results.length, `${cardCount} cards for ${results.length} results`);
    assert.match(await page.textContent('#resultMeta'), new RegExp(`รวมเหลือ ${cardCount} แบบ`));

    // every result is still reachable: picking each option over all cards gives ranks 1..N
    const seen = await page.evaluate(() => {
      const ranks = [];
      document.querySelectorAll('#result .result-card').forEach((card) => {
        if (!card.querySelector('.jewel-swap')) { ranks.push(Number(card.dataset.rank)); return; }
        card.querySelector('.jewel-swap').click();
        const n = card.querySelectorAll('.vp-option').length;
        for (let i = 0; i < n; i++) {
          if (!card.querySelector('.variant-picker')) card.querySelector('.jewel-swap').click();
          card.querySelectorAll('.vp-option')[i].click();
          ranks.push(Number(card.dataset.rank));
        }
      });
      return ranks.sort((a, b) => a - b);
    });
    assert.deepEqual(seen, results.map((_, i) => i + 1));

    // the picker lists every set of the card; choosing one shows it and closes the list
    const grouped = page.locator('#result .result-card--grouped').first();
    await grouped.locator('.jewel-swap').click();
    const options = grouped.locator('.vp-option');
    assert.equal(await options.count(), Number((await grouped.locator('.swap-short').textContent()).replace('+', '')) + 1);
    assert.equal(await grouped.locator('.vp-option.is-on').count(), 1);
    assert.equal(await grouped.locator('.jewel-swap').getAttribute('aria-expanded'), 'true');
    // each other option names what it gives and what changes
    assert.ok(await grouped.locator('.vp-option').nth(1).locator('.vp-want').count() > 0);
    const before = await grouped.getAttribute('data-key');
    const target = await grouped.locator('.vp-option:not(.is-on)').first().locator('.vp-rank').textContent();
    await grouped.locator('.vp-option:not(.is-on)').first().click();
    assert.notEqual(await grouped.getAttribute('data-key'), before);
    assert.equal(`#${await grouped.getAttribute('data-rank')}`, target);
    assert.equal(await grouped.locator('.variant-picker').count(), 0);
    // Esc closes it
    await grouped.locator('.jewel-swap').click();
    await page.keyboard.press('Escape');
    assert.equal(await grouped.locator('.variant-picker').count(), 0);
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

test('extra skills: all on one sideways-scrolling line, tap opens the floating add / skip bubble', async () => {
  const { page, context, errors } = await openApp();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await searchAndRender(page, { selected: SIX, topK: 10 });
    const card = page.locator('#result .result-card').first();
    const total = await card.locator('.extra-skill').count();
    assert.ok(total > 0);
    assert.equal(await card.locator('.extra-more').count(), 0, 'no "+N อื่น ๆ" button any more');
    // one line: every chip shares the same top, and the line scrolls instead of widening the page
    const tops = await card.locator('.extra-skill').evaluateAll((els) => [...new Set(els.map((e) => e.offsetTop))]);
    assert.equal(tops.length, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const scroller = card.locator('.extra-scroll');
    if (await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)) {
      assert.match(await scroller.getAttribute('class'), /has-more-right/);
    }

    const chip = card.locator('.extra-skill').last();
    const skill = await chip.getAttribute('data-skill');
    await chip.click();
    const menu = page.locator('#skillActionMenu.show');
    await menu.waitFor();
    assert.equal(await page.textContent('#skillActionMenu .skill-action-menu__title'), skill);
    // floats next to the chip, fully on screen
    const [m, c] = await Promise.all([menu.boundingBox(), chip.boundingBox()]);
    assert.ok(m.x >= 0 && m.x + m.width <= 390, 'bubble inside the viewport');
    assert.ok(Math.abs((m.y + m.height) - c.y) < 20 || Math.abs(m.y - (c.y + c.height)) < 20, 'bubble sits right above or below the chip');
    // tapping the same chip again closes it
    await chip.click();
    assert.equal(await page.locator('#skillActionMenu.show').count(), 0);
    await chip.click();
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
