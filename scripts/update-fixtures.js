#!/usr/bin/env node
'use strict';
// Refresh test/fixtures/sheet-*.json from the live Google Sheet (GViz JSON).
// After running, re-record goldens with `npm run test:update-golden` and review the diff.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'test', 'fixtures');

function findSheetId() {
  const files = ['index.html', ...(fs.existsSync(path.join(ROOT, "js")) ? fs.readdirSync(path.join(ROOT, "js"), { recursive: true }) : [])
    .filter((f) => f.endsWith('.js')).map((f) => path.join('js', f))].filter((f) => fs.existsSync(path.join(ROOT, f)));
  for (const f of files) {
    const m = fs.readFileSync(path.join(ROOT, f), 'utf8').match(/SHEET_ID\s*=\s*_dk\('([0-9a-f]+)','([^']+)'\)/);
    if (m) {
      const h = m[1].split('').reverse().join('');
      let r = '';
      for (let i = 0; i < h.length; i += 2) r += String.fromCharCode(parseInt(h.slice(i, i + 2), 16) ^ m[2].charCodeAt((i / 2) % m[2].length));
      return r;
    }
  }
  throw new Error('SHEET_ID not found');
}

// file → query (gid=… or sheet=<tab name>)
const TABS = {
  'sheet-main.json': '',
  'sheet-chars.json': 'gid=513976173',
  'sheet-abilities.json': 'sheet=Abilities',
  'sheet-triggers.json': 'sheet=Triggers',
};

(async () => {
  const id = findSheetId();
  for (const [file, q] of Object.entries(TABS)) {
    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json${q ? `&${q}&headers=1` : ''}`;
    const text = await (await fetch(url)).text();
    const payload = JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')));
    if (!payload.table) throw new Error(`${file}: no table in response`);
    fs.writeFileSync(path.join(FIXTURES, file), JSON.stringify({ table: payload.table }));
    console.log(`${file}: ${payload.table.rows.length} rows`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
