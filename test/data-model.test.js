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

const { parseAbilitiesTable, parseTriggersTable, finalizeAbilities } = require('../js/data-model.js');
const { abilityScore } = require('../js/search-core.js');
const tbl = (labels, rows) => ({ cols: labels.map((label) => ({ label })), rows: rows.map((r) => ({ c: r.map(cell) })) });
const AB = ['name', 'group', 'variant', 'trigger', 'stack_key', 'unit', 'max_stack', 'keywords', 'review'];

test('Abilities tab: defaults, stack_key, units, keywords', () => {
  const { abilities, problems } = parseAbilitiesTable(tbl(AB, [
    ['โล่ซูเปอร์', 'โล่', 'โล่ซูเปอร์', '', 'โล่', 'chance', '3', 'โล่ไฮเปอร์, บาเรีย', 'x'],
    ['เพิ่มค่าผ่านทาง', 'เพิ่มค่าผ่านทาง', '', '', '', 'amount', '', '', ''],
    ['ผลัก', '', '', '', '', '', '', '', ''],
    ['ผิด', 'g', '', '', '', 'percent', '', '', ''],
  ]));
  assert.deepEqual(abilities.get('โล่ซูเปอร์'), {
    name: 'โล่ซูเปอร์', group: 'โล่', variant: 'โล่ซูเปอร์', trigger: '', stackKey: 'โล่', unit: 'chance',
    maxValue: null, maxStack: 3, keywords: ['โล่ไฮเปอร์', 'บาเรีย'],
  });
  const push = abilities.get('ผลัก');
  assert.equal(push.group, 'อื่น ๆ');
  assert.equal(push.stackKey, 'ผลัก', 'blank stack_key = own name (old rule)');
  assert.equal(push.unit, 'chance');
  assert.equal(problems.length, 1, problems.join('\n'));   // bad unit
});

test('finalizeAbilities fills max values from the pendants and reports problems', () => {
  const { abilities } = parseAbilitiesTable(tbl(AB, [
    ['เพิ่มค่าผ่านทาง', 'ค่าผ่านทาง', '', '', '', 'amount', '', '', ''],
    ['ผลัก', 'ผลัก', '', 'ทุกการทอย', '', 'chance', '', '', ''],
    ['ไม่มีใครใช้', 'x', '', 'สะกดผิด', '', '', '', '', ''],
  ]));
  const jewels = [
    { id: 'a', substats: [{ name: 'เพิ่มค่าผ่านทาง', value: 250 }, { name: 'ผลัก', value: 60 }] },
    { id: 'b', substats: [{ name: 'หลุมดำ', value: 0 }] },
  ];
  const problems = finalizeAbilities(abilities, jewels, ['ทุกการทอย']);
  assert.equal(abilities.get('เพิ่มค่าผ่านทาง').maxValue, 250);
  assert.equal(abilities.get('ผลัก').maxValue, 100);
  assert.equal(abilities.get('หลุมดำ').group, 'อื่น ๆ', 'skill missing from the tab gets a default row');
  assert.equal(problems.length, 4, problems.join('\n')); // missing row, unused row, value 0, unknown trigger
});

test('Triggers tab is ordered by the order column, then by row', () => {
  const t = parseTriggersTable(tbl(['trigger', 'order', 'note'], [['ตกพื้นที่', 3, ''], ['ทุกการทอย', 2, ''], ['ใหม่', '', ''], ['เริ่มเทิร์น', 1, '']]));
  assert.deepEqual(t, ['เริ่มเทิร์น', 'ทุกการทอย', 'ตกพื้นที่', 'ใหม่']);
  assert.deepEqual(parseTriggersTable({ cols: [{ label: '' }], rows: [] }), []);
});

test('abilityScore: chance skills keep their value, amounts become % of max', () => {
  assert.equal(abilityScore(55, { maxValue: 100 }), 55);
  assert.equal(abilityScore(250, { maxValue: 250 }), 100);
  assert.equal(abilityScore(125, { maxValue: 250 }), 50);
  assert.equal(abilityScore(300, { maxValue: 250 }), 100, 'capped');
  assert.equal(abilityScore(42, undefined), 42, 'no ability data → raw value');
});

const { parseNote, parseSheetTable: parseTab } = require('../js/data-model.js');

test('parseNote reads the game wording', () => {
  assert.deepEqual(parseNote('+5% เมื่อไม่แสดงผล'), { unknown: [], grow: 5 });
  assert.deepEqual(parseNote('หลัง 2 เทิร์น ลดลง -50%'), { unknown: [], decayAfter: 2, decay: 50 });
  assert.deepEqual(parseNote('จำกัด 2 ครั้ง'), { unknown: [], limit: 2 });
  assert.deepEqual(parseNote('(2 ครั้ง)'), { unknown: [], limit: 2 });
  assert.deepEqual(parseNote('จำกัด 1 ครั้ง, +5% เมื่อไม่แสดงผล'), { unknown: [], limit: 1, grow: 5 });
  assert.deepEqual(parseNote('อะไรสักอย่าง'), { unknown: ['อะไรสักอย่าง'] });
});

test('Note columns next to each Value are attached to that skill', () => {
  const labels = ['ID', 'AllowedChars', 'Substat1', 'Value1', 'Note1', 'Substat2', 'Value2', 'Note2', 'Substat3', 'Value3', 'Note3'];
  const { jewels, problems } = parseTab(tbl(labels, [
    ['[ไวท์] แกนบลัดกักขังโกสต์', '', 'ขังคุก', 45, '+5% เมื่อไม่แสดงผล', 'เดินไดเมนชั่น', 60, '', 'ป้องกันบังคับย้ายและดักจับ', 90, '2 ครั้ง'],
    ['จี้ทดสอบ', '', 'ผลัก', 50, 'ข้อความแปลก', '', '', 'จำกัด 1 ครั้ง', '', '', ''],
  ]));
  assert.deepEqual(jewels[0].substats, [
    { name: 'ขังคุก', value: 45, note: '+5% เมื่อไม่แสดงผล', grow: 5 },
    { name: 'เดินไดเมนชั่น', value: 60 },
    { name: 'ป้องกันบังคับย้ายและดักจับ', value: 90, note: '2 ครั้ง', limit: 2 },
  ]);
  assert.deepEqual(jewels[1].substats, [{ name: 'ผลัก', value: 50, note: 'ข้อความแปลก' }]);
  assert.equal(problems.length, 2, problems.join('\n'));   // unreadable note + note without skill
  assert.match(problems.join('\n'), /อ่านไม่ออก: "ข้อความแปลก"/);
  assert.match(problems.join('\n'), /Note2 "จำกัด 1 ครั้ง" แต่ไม่มี Substat2/);
});
