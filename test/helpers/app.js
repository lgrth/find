'use strict';
// Shared harness: serves the repo over HTTP and opens index.html in Chromium with
// every network dependency mocked, so tests are deterministic and work offline.
//   - Google Sheets (GViz JSONP)  → test/fixtures/sheet-*.json
//   - cdn.jsdelivr.net libraries  → node_modules (same pinned versions)
//   - analytics / feedback        → stubbed
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'test', 'fixtures');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

const SHEETS = {
  main: loadFixture('sheet-main.json'),
  '513976173': loadFixture('sheet-chars.json'),
  'sheet:Abilities': loadFixture('sheet-abilities.json'),
  'sheet:Triggers': loadFixture('sheet-triggers.json'),
};

async function installRoutes(context) {
  await context.route(/^https:\/\/docs\.google\.com\//, (route) => {
    const u = new URL(route.request().url());
    const tqx = u.searchParams.get('tqx') || '';
    const m = tqx.match(/responseHandler:([\w$]+)/);
    const handler = m ? m[1] : 'google.visualization.Query.setResponse';
    const key = u.searchParams.get('sheet') ? 'sheet:' + u.searchParams.get('sheet') : (u.searchParams.get('gid') || 'main');
    const body = SHEETS[key] || '{"table":{"cols":[],"rows":[]}}';
    route.fulfill({ contentType: 'application/javascript', body: `/*O_o*/\n${handler}(${body});` });
  });
  await context.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\//, (route) => {
    // https://cdn.jsdelivr.net/npm/<pkg>@<ver>/<file>  →  node_modules/<pkg>/<file>
    const m = new URL(route.request().url()).pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/);
    const file = m && path.join(ROOT, 'node_modules', m[1], m[2]);
    if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ contentType: MIME[path.extname(file)] || 'text/plain', body: fs.readFileSync(file) });
  });
  await context.route(/googletagmanager\.com|google-analytics\.com|doubleclick\.net/, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }));
  await context.route(/script\.google(usercontent)?\.com/, (route) => route.abort());
}

let shared = null;
async function getEnv() {
  if (shared) return shared;
  const server = await startServer();
  const browser = await chromium.launch();
  shared = { server, browser, baseURL: `http://127.0.0.1:${server.address().port}/` };
  return shared;
}

async function closeEnv() {
  if (!shared) return;
  await shared.browser.close();
  await new Promise((r) => shared.server.close(r));
  shared = null;
}

/**
 * Open the app and wait until data, chips and the character list are ready.
 * @param {object} [opts]
 * @param {string} [opts.search]        query string, e.g. '?d=...'
 * @param {object} [opts.localStorage]  key → string, seeded before any page script runs
 */
async function openApp(opts = {}) {
  const env = await getEnv();
  const context = await env.browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installRoutes(context);
  // Tutorial pops up on first visit and can intercept clicks; mark it as seen.
  const seed = Object.assign({ tutorial_autoshown_once_v1: '1' }, opts.localStorage || {});
  await context.addInitScript((items) => {
    try { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); } catch (_) {}
  }, seed);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(env.baseURL + 'index.html' + (opts.search || ''));
  await page.waitForFunction(() =>
    typeof _abilityListReady !== 'undefined' && _abilityListReady === true &&
    window.__charSheetReady === true &&
    !!document.getElementById('charSelect')?.tomselect, null, { timeout: 20000 });
  return { page, context, errors };
}

/** Set the filter form programmatically, run a search and return the raw top-K list. */
async function runSearch(page, scenario) {
  return page.evaluate(async (s) => {
    window.setChipState(s.selected || []);
    window.setUnwantedState(s.unwanted || []);
    applyFilterState({ jewelTypes: s.jewelTypes || [] });
    const ts = document.getElementById('charSelect').tomselect;
    if (s.char) setCharSelectValue(s.char); else ts.clear(true);
    document.getElementById('topK').value = String(s.topK || 10);

    window._latestComputedResults = null;
    await window.calculate();
    const t0 = Date.now();
    while (window._latestComputedResults === null && Date.now() - t0 < 30000) {
      await new Promise((r) => setTimeout(r, 25));
    }
    if (window._latestComputedResults === null) {
      return { error: 'no-result', toast: document.getElementById('toastMessage')?.textContent || '' };
    }
    return {
      results: window._latestComputedResults.map((r) => ({
        ids: r.ids, notMiss: r.notMiss, notIdx: r.notIdx,
        totalValue: r.totalValue, extraCount: r.extraCount, unwantedCount: r.unwantedCount,
      })),
    };
  }, scenario);
}

/** Read the current filter form back from the page. */
async function readForm(page) {
  return page.evaluate(() => ({
    selected: (window._chipSelected || []).slice(),
    unwanted: (window._chipUnwanted || []).slice(),
    jewelTypes: readFilterState().jewelTypes,
    topK: document.getElementById('topK')?.value,
    char: getCharSelectValue(),
  }));
}

module.exports = { ROOT, openApp, runSearch, readForm, closeEnv, getEnv };
