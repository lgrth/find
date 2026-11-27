'use strict';
// Unit tests for js/result-view.js (plain Node, no browser).
const test = require('node:test');
const assert = require('node:assert/strict');
const rv = require('../js/result-view.js');

test('splitJewelName separates prefix, base name and trailing tag', () => {
  assert.deepEqual(rv.splitJewelName('[ดาร์ค] หมวกเหมียวไบค์ (ครบรอบ 12 ปี)'),
    { prefix: 'ดาร์ค', base: 'หมวกเหมียวไบค์', tag: 'ครบรอบ 12 ปี' });
  assert.deepEqual(rv.splitJewelName('ไพ่ทาโรต์ซูเปอร์ไดเมนชั่น'),
    { prefix: '', base: 'ไพ่ทาโรต์ซูเปอร์ไดเมนชั่น', tag: '' });
  // a name that is only "(...)" keeps it as the name
  assert.deepEqual(rv.splitJewelName('(ทดสอบ)'), { prefix: '', base: '(ทดสอบ)', tag: '' });
});

test('jewelPrefixKind maps known prefixes', () => {
  assert.equal(rv.jewelPrefixKind('ดาร์ค'), 'dark');
  assert.equal(rv.jewelPrefixKind('ไวท์'), 'white');
  assert.equal(rv.jewelPrefixKind('ลิงก์'), 'link');
  assert.equal(rv.jewelPrefixKind('ลิมิเต็ดเอดิชั่น'), 'other');
});

test('groupSimilarResults folds sets that differ by one pendant, keeping rank order', () => {
  const items = [
    { ids: ['A', 'B', 'C', 'D'] },
    { ids: ['A', 'B', 'C', 'E'] },   // differs from #1 by one → same card
    { ids: ['A', 'X', 'C', 'D'] },   // differs from #1 in another slot → new card
    { ids: ['B', 'A', 'E', 'C'] },   // same base A,B,C (order does not matter) → first card
    { ids: ['A', 'X', 'C', 'Y'] },   // differs from #3 by one → second card
  ];
  const groups = rv.groupSimilarResults(items);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].members, [items[0], items[1], items[3]]);
  assert.deepEqual(groups[0].base, ['A', 'B', 'C']);
  assert.deepEqual(groups[1].members, [items[2], items[4]]);
  assert.deepEqual(groups[1].base, ['A', 'X', 'C']);
});

test('groupSimilarResults keeps sets with a different quality apart', () => {
  const groups = rv.groupSimilarResults([
    { ids: ['A', 'B', 'C', 'D'], quality: '6|0' },
    { ids: ['A', 'B', 'C', 'E'], quality: '5|1' },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].base, null);
});

test('commonIds and allEqual', () => {
  assert.deepEqual(rv.commonIds([['A', 'B'], ['B', 'A'], ['B', 'C']]), ['B']);
  assert.deepEqual(rv.commonIds([['A'], ['A']]), [], 'needs at least 3 lists by default');
  assert.equal(rv.allEqual(['380', '380']), true);
  assert.equal(rv.allEqual(['380', '379']), false);
  assert.equal(rv.allEqual(['380']), false);
});
