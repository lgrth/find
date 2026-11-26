'use strict';
// End-to-end smoke test through real clicks: pick skills → search → result cards.
const test = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeEnv } = require('./helpers/app');

test.after(closeEnv);

test('pick 4 skills with clicks, search, see result cards', async () => {
  const { page, context, errors } = await openApp();
  try {
    for (const name of ['โดรนก๊อปปี้', 'โล่ซูเปอร์', 'บัตรเชิญ', 'คุมเต๋า']) {
      await page.fill('#chipSearch', name);
      await page.locator('#chipAll button.chip', { hasText: name }).first().click();
    }
    assert.equal(await page.evaluate(() => window._chipSelected.length), 4);

    await page.locator('#calcBtn:visible, #calcBtn2:visible').first().click();
    await page.waitForFunction(() => document.querySelectorAll('#result .result-card').length > 0,
      null, { timeout: 30000 });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
