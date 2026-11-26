#!/usr/bin/env node
'use strict';
// Draft the "Abilities" tab (one row per skill) from the sheet snapshot.
// Output: docs/abilities-draft.csv — a starting point to review and paste into the sheet.
// Rules below are a first guess; the `review` column flags rows that need a human decision.
const fs = require('node:fs');
const path = require('node:path');
const { loadJewels } = require('../test/helpers/fixture-jewels');
const kw = require('../test/fixtures/sheet-keywords.json').table;

// [group, regex, extra] — first match wins. Order matters (specific before general).
const RULES = [
  ['โล่', /^โล่ซูเปอร์/, { variant: 'โล่ซูเปอร์', stack_key: 'โล่' }],
  ['โล่', /^โล่ขาว/, { variant: 'โล่ขาว', stack_key: 'โล่' }],
  ['ยกเว้นค่าผ่านทาง', /^ยกเว้นค่าผ่านทาง/],
  ['เพิ่มค่าผ่านทาง', /^เพิ่มค่าผ่านทาง|^ค่าผ่านทางที่แพงขึ้น|^ก่อสร้างแลนด์มาร์ค เพิ่มค่าผ่านทาง/],
  ['ไม่ให้ยกเว้นค่าผ่านทาง', /^ผนึกยกเว้นค่าผ่านทาง|^ละเว้นการยกเว้น|^เอฟเฟกต์ ไม่ได้รับการยกเว้น/],
  ['กันวิคตอรี่', /^กันวิคตอรี่/],
  ['ป้องกันเอฟเฟคอันตราย', /^ป้องกันเอฟเฟคอันตราย/],
  ['ป้องกันการเคลื่อนย้าย', /^ป้องกันบังคับย้าย|^ป้องกันเคลื่อนย้ายอัญเชิญ/],
  ['หนีคุก', /^ป้องกันขังคุก|^ยกเลิกขังคุก/],
  ['ป้องกันการโจมตีเมือง', /^ป้องกันซื้อต่อ|^ป้องกันทาสีโจมตีทำลาย|^ป้องกันขโมยมาร์เบิ้ล|^ป้องกันการ์ดดวง/],
  ['ขังคุก', /^ขังคุก|ขังคุก$/],
  ['ขังฟองสบู่', /^ขังฟองสบู่|ขังฟองสบู่$|^เจาะฟองสบู่/],
  ['ดูด', /^ดูด/],
  ['ผลัก / เนรเทศ', /^ผลัก|^เนรเทศ|^ปล่อยปลิว/],
  ['ทอยหน้าหลัง', /^ทอยหน้าหลัง/],
  ['ลูกเต๋า', /เต๋า|^ทอยดับเบิ้ล|^ทอยเบิ้ล/],
  ['ทอยผ่าน', /^ทอยผ่าน|^ทอยลบ/],
  ['ไดเมนชั่น', /ไดเมนชั่น/],
  ['หลุมดำ', /หลุมดำ/],
  ['เมืองคูณ', /เมืองคูณ/],
  ['เงิน', /เงิน/],
  ['บัตรเชิญ / เรียก', /^บัตรเชิญ|^เรียก/],
  ['แปลน / อัพเกรด', /^แปลน|^อัพเกรดแลนด์มาร์ค/],
  ['ก่อสร้างแล้วเคลื่อนย้าย', /^ก่อสร้าง|^สร้างแลนด์มาร์ค/],
  ['เครื่องหมาย', /เครื่องหมาย/],
  ['เอฟเฟกต์พื้นที่', /^เอฟเฟกต์พื้นที่/],
  ['ยกเลิก / สลาย', /^ยกเลิก|^สลาย/],
  ['ผนึก', /^ผนึก/],
  ['สิ่งติดตั้ง / อัญเชิญ', /^โดรนก๊อปปี้|^หุ่น|^ด่านตรวจ|^กับดัก|^บอทจับ|^เมล็ดพันธุ์|^แมงกะพรุน|^โลมา|^เงือก/],
];
// Value is an amount (can exceed 100%), not a chance. From the owner: เพิ่มค่าผ่านทาง, ตกเมืองได้เงิน.
const AMOUNT = new Set(['เพิ่มค่าผ่านทาง', 'ตกเมืองได้เงิน']);
const AMOUNT_GUESS = new Set(['เริ่มเกมเพิ่มเงิน']);  // values 150–160: probably an amount, needs confirming

const stats = new Map();
for (const j of loadJewels()) for (const s of j.substats) {
  const o = stats.get(s.name) || { n: 0, max: 0 };
  o.n++; o.max = Math.max(o.max, s.value); stats.set(s.name, o);
}
const keywords = new Map(kw.rows.map((r) => [String(r.c[0]?.v ?? '').trim(), String(r.c[1]?.v ?? '').trim()]));

const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const header = ['name', 'group', 'variant', 'trigger', 'stack_key', 'unit', 'max_value', 'max_stack', 'keywords', 'pendants', 'review'];
const rows = [...stats.keys()].sort((a, b) => a.localeCompare(b, 'th')).map((name) => {
  const rule = RULES.find(([, re]) => re.test(name));
  const group = rule ? rule[0] : 'อื่น ๆ';
  const extra = (rule && rule[2]) || {};
  const amount = AMOUNT.has(name) || AMOUNT_GUESS.has(name);
  const st = stats.get(name);
  const review = [];
  if (!rule) review.push('ยังไม่มีกลุ่ม');
  if (AMOUNT_GUESS.has(name)) review.push('ค่าเกิน 100 — เป็นจำนวน ไม่ใช่โอกาส?');
  if (!amount && st.max > 100) review.push('ค่าเกิน 100');
  if (st.max === 0) review.push('ค่าเป็น 0 ในชีต');
  if (extra.variant) review.push('ใส่ trigger และ max_stack');
  return [name, group, extra.variant || '', '', extra.stack_key || '', amount ? 'amount' : 'chance',
    amount ? st.max : 100, '', keywords.get(name) || '', st.n, review.join('; ')];
});
const out = path.join(__dirname, '..', 'docs', 'abilities-draft.csv');
fs.writeFileSync(out, '﻿' + [header, ...rows].map((r) => r.map(csv).join(',')).join('\n') + '\n');
const groups = {};
rows.forEach((r) => { groups[r[1]] = (groups[r[1]] || 0) + 1; });
console.log(`${rows.length} skills → ${Object.keys(groups).length} groups`);
console.log(Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} (${n})`).join(', '));
