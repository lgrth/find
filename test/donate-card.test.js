'use strict';
// Support card under the results: when it shows, "ไว้คราวหน้า", amount ideas, QR in the card.
const test = require('node:test');
const assert = require('node:assert/strict');
const { openApp, runSearch, closeEnv } = require('./helpers/app');

test.after(closeEnv);

const SIX = ['โดรนก๊อปปี้', 'โล่ซูเปอร์', 'ป้องกันเอฟเฟคอันตราย', 'แปลน 3 หลัง', 'บัตรเชิญ', 'คุมเต๋า'];

async function search(page) {
  const out = await runSearch(page, { selected: SIX, topK: 10 });
  assert.ok(out.results && out.results.length);
  await page.waitForSelector('#result .result-card');
}
const cardVisible = (page) => page.isVisible('#donateResultCard');

async function fresh() {
  const env = await openApp();
  await env.page.evaluate(() => localStorage.removeItem('donateCard_v1'));
  return env;
}

test('hidden on the first search, shown from the second', async () => {
  const { page, context, errors } = await fresh();
  try {
    await search(page);
    assert.equal(await cardVisible(page), false);
    await search(page);
    assert.equal(await cardVisible(page), true);
    // re-renders (Top N, swapping) do not count as searches
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('donateCard_v1')).searches), 2);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('shown right after copying a set, even on the first search', async () => {
  const { page, context } = await fresh();
  try {
    await search(page);
    assert.equal(await cardVisible(page), false);
    const card = page.locator('#result .result-card').first();
    await card.locator('[data-action="menu"]').click();
    await card.locator('[data-action="copy-names"]').click();
    assert.equal(await cardVisible(page), true);
  } finally {
    await context.close();
  }
});

test('"ไว้คราวหน้า" hides the card for 15 minutes', async () => {
  const { page, context } = await fresh();
  try {
    await search(page);
    await search(page);
    await page.click('#donateLaterBtn');
    assert.equal(await cardVisible(page), false);
    const until = await page.evaluate(() => JSON.parse(localStorage.getItem('donateCard_v1')).hiddenUntil - Date.now());
    assert.ok(until > 14 * 60 * 1000 && until <= 15 * 60 * 1000, `snoozed for ${until} ms`);
    await search(page);
    assert.equal(await cardVisible(page), false, 'still hidden on the next search');
    // 15 minutes later
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('donateCard_v1'));
      s.hiddenUntil = Date.now() - 1;
      localStorage.setItem('donateCard_v1', JSON.stringify(s));
    });
    await search(page);
    assert.equal(await cardVisible(page), true);
  } finally {
    await context.close();
  }
});

test('desktop: amount ideas change the button, QR sits in the card, paying opens the QR window', async () => {
  const { page, context, errors } = await fresh();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await search(page);
    await search(page);
    assert.equal(await page.isVisible('#donateCardQrBtn img'), true, 'QR in the card on wide screens');
    await page.click('#donateResultCard .donate-amt[data-amount="99"]');
    assert.equal(await page.textContent('#donateResultBtnLabel'), 'เลี้ยงข้าวหนึ่งมื้อ');
    assert.equal(await page.getAttribute('#donateResultCard .donate-amt[data-amount="99"]', 'aria-checked'), 'true');
    await page.click('#donateResultBtn');
    await page.locator('#donateModal.show').waitFor();
    assert.match(await page.textContent('#donateModalHint'), /99 ฿/);
    await page.click('#donateClose');
    assert.match(await page.textContent('#toastMessage'), /ขอบคุณ/);
    assert.equal(await cardVisible(page), true, 'still shown after supporting');
    await search(page);
    assert.equal(await cardVisible(page), true, 'no long snooze after supporting');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('mobile: no QR in the card, a "บันทึก QR" button instead', async () => {
  const { page, context } = await fresh();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await search(page);
    await search(page);
    assert.equal(await page.isVisible('#donateCardQrBtn'), false);
    assert.equal(await page.isVisible('#donateCardSaveQr'), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await context.close();
  }
});
