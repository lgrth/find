'use strict';
// Unit tests for js/data-model.js (sheet table → pendant objects).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSheetTable, pendantType, pendantPrefix } = require('../js/data-model.js');

const cell = (v) => (v == null ? null : { v });
const HEAD = ['ID', 'AllowedChars', 'Substat1', 'Value1', 'Substat2', 'Value2'].map((label) => ({ label }));

test('prefix and type come from the bracketed tag', () => {
  assert.equal(pendantPrefix('[ดาร์ค] พีช'), '[ดาร์ค]');
  assert.equal(pendantPrefix('แกะน่ารัก'), '');
  assert.equal(pendantType('[ดาร์ค] พีช'), 'dark');
  assert.equal(pendantType('[ไวท์] UFO'), 'white');
  assert.equal(pendantType('[ลิงก์] คทา'), 'link');
  assert.equal(pendantType('[ฮาโลวีน] ฟักทอง'), 'other');
  assert.equal(pendantType('[ฮาโลวีน] ฟักทอง', 'Dark'), 'dark', 'Type column overrides the prefix');
});

test('parses by header labels, skips blank rows, reads AllowedChars for link pendants', () => {
  const { jewels, problems } = parseSheetTable({
    cols: HEAD,
    rows: [
      { c: [cell('[ลิงก์] คทา'), cell('สกอร์เปียน'), cell('โล่ซูเปอร์'), cell(30), cell('ทอยหน้าหลัง'), cell('20%')] },
      { c: [cell('แกะ'), cell('ignored'), cell('ผลัก'), cell(10), null, null] },
      { c: [null, null, null, null, null, null] },
    ],
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(jewels, [
    { id: '[ลิงก์] คทา', prefix: '[ลิงก์]', type: 'link', allowedChars: 'สกอร์เปียน',
      substats: [{ name: 'โล่ซูเปอร์', value: 30 }, { name: 'ทอยหน้าหลัง', value: 20 }] },
    { id: 'แกะ', prefix: '', type: 'other', substats: [{ name: 'ผลัก', value: 10 }] },
  ]);
});

test('falls back to the fixed column layout when GViz drops the header row', () => {
  const { jewels } = parseSheetTable({
    cols: HEAD.map((_, i) => ({ id: 'ABCDEF'[i], label: '' })),
    rows: [{ c: [cell('[ดาร์ค] พีช'), null, cell('ผลัก'), cell(5), cell('หลุมดำ'), cell(7)] }],
  });
  assert.deepEqual(jewels[0].substats, [{ name: 'ผลัก', value: 5 }, { name: 'หลุมดำ', value: 7 }]);
  assert.equal(jewels[0].type, 'dark');
});

test('reports duplicate IDs, missing IDs and link pendants without AllowedChars', () => {
  const { jewels, problems } = parseSheetTable({
    cols: HEAD,
    rows: [
      { c: [cell('A'), null, cell('x'), cell(1)] },
      { c: [cell('A'), null, cell('y'), cell(1)] },
      { c: [null, null, cell('z'), cell(1)] },
      { c: [cell('[ลิงก์] B'), null, cell('w'), cell(1)] },
    ],
  });
  assert.equal(jewels.length, 3);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /ID ซ้ำ "A"/);
  assert.match(problems[1], /ไม่มี ID/);
  assert.match(problems[2], /AllowedChars/);
});
