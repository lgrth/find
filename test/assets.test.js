'use strict';
// Every local script / stylesheet carries the same ?v= so a deploy is never mixed with cached old files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('local js/css in index.html share one ?v= version', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  const missing = refs.filter((r) => !/\?v=[\w.-]+$/.test(r));
  assert.deepEqual(missing, [], 'run: npm run bump-assets');
  const versions = new Set(refs.map((r) => r.split('?v=')[1]));
  assert.equal(versions.size, 1, [...versions].join(', '));
});
