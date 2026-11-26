'use strict';
// Golden-master test for the search: runs fixed scenarios against the real sheet
// snapshot (test/fixtures) through the real UI entry point (calculate()) and
// compares the full top-K output with test/golden/search-results.json.
//
// Refactors must keep this file byte-identical. To intentionally change search
// behaviour, run `npm run test:update-golden` and review the golden diff.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openApp, runSearch, closeEnv } = require('./helpers/app');
const { loadJewels } = require('./helpers/fixture-jewels');

const GOLDEN = path.join(__dirname, 'golden', 'search-results.json');

const S = {
  drone: 'โดรนก๊อปปี้', superShield: 'โล่ซูเปอร์', antiHazard: 'ป้องกันเอฟเฟคอันตราย',
  plan3: 'แปลน 3 หลัง', invite: 'บัตรเชิญ', dice: 'คุมเต๋า', jail: 'ขังคุก',
  antiMove: 'ป้องกันบังคับย้ายและดักจับ', bomb: 'ยิงระเบิด', tollFree: 'ยกเว้นค่าผ่านทาง',
  antiVictory: 'กันวิคตอรี่', exile: 'เนรเทศ / ส่งไปเกาะร้าง', cityMoney: 'ตกเมืองได้เงิน',
  antiJail: 'ป้องกันขังคุก', dimension: 'ไดเมนชั่น', push: 'ผลัก', whiteShield: 'โล่ขาว',
  bike: 'ทอยหน้าหลังแล้วเดิน (ไบค์)', bubble: 'ขังฟองสบู่', scarecrow: 'หุ่นไล่กา',
  toll4: 'เพิ่มค่าผ่านทาง fixed x4', blackhole: 'หลุมดำ',
};

const SCENARIOS = {
  'min-4-common': { selected: [S.drone, S.superShield, S.antiHazard, S.plan3] },
  '6-mixed': { selected: [S.drone, S.superShield, S.invite, S.dice, S.jail, S.bomb] },
  '8-wide': { selected: [S.drone, S.superShield, S.antiHazard, S.plan3, S.invite, S.dice, S.jail, S.antiMove] },
  '10-wide-top20': { selected: [S.drone, S.superShield, S.antiHazard, S.plan3, S.invite, S.dice, S.jail, S.antiMove, S.bomb, S.tollFree], topK: 20 },
  '14-max': {
    selected: [S.drone, S.superShield, S.antiHazard, S.plan3, S.invite, S.dice, S.jail, S.antiMove,
      S.bomb, S.tollFree, S.antiVictory, S.exile, S.cityMoney, S.antiJail],
  },
  'unwanted-2': { selected: [S.drone, S.superShield, S.invite, S.dice, S.jail], unwanted: [S.push, S.bubble] },
  'unwanted-5': { selected: [S.plan3, S.invite, S.dice, S.tollFree], unwanted: [S.drone, S.superShield, S.antiHazard, S.jail, S.bomb] },
  'dark-only': { selected: [S.drone, S.superShield, S.antiHazard, S.plan3, S.invite], jewelTypes: ['dark'] },
  'dark-only-unwanted': { selected: [S.dice, S.jail, S.bomb, S.exile, S.antiJail], unwanted: [S.push], jewelTypes: ['dark'] },
  'rare-skills': { selected: [S.whiteShield, S.bike, S.scarecrow, S.toll4, S.blackhole] },
  'shields': { selected: [S.superShield, S.whiteShield, S.antiHazard, S.antiJail, S.antiMove] },
  'top3': { selected: [S.drone, S.dimension, S.push, S.cityMoney], topK: 3 },
  'top50': { selected: [S.drone, S.dimension, S.push, S.cityMoney, S.antiVictory], topK: 50 },
  'white-only': { selected: [S.drone, S.superShield, S.antiHazard, S.invite], jewelTypes: ['white'] },
  'dark-white': { selected: [S.drone, S.superShield, S.antiHazard, S.plan3, S.invite], jewelTypes: ['dark', 'white'] },
  'other-only': { selected: [S.drone, S.superShield, S.invite, S.dice], jewelTypes: ['other'] },
  'all-three-types': { selected: [S.drone, S.superShield, S.antiHazard, S.plan3], jewelTypes: ['dark', 'white', 'other'] },
  // Character scenarios: the [ลิงก์] pendant of the chosen character must be locked in.
  'char-moses': { selected: [S.bomb, S.tollFree, S.drone, S.superShield, S.invite], char: 'โมเสส' },
  'char-scorpion': { selected: [S.superShield, S.antiHazard, S.plan3, S.dice, S.jail, S.bomb], char: 'สกอร์เปียน' },
  'char-sasha-dark': { selected: [S.antiJail, S.drone, S.invite, S.dice], char: 'ชาช่า', jewelTypes: ['dark'] },
};

test('search results match golden master', async (t) => {
  const { page, context, errors } = await openApp();
  const actual = {};
  try {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      actual[name] = { scenario, output: await runSearch(page, scenario) };
    }
  } finally {
    await context.close();
    await closeEnv();
  }
  assert.deepEqual(errors, [], 'page threw errors');

  // Rule (independent of the golden file): with a character selected, every set
  // starts with that character's own [ลิงก์] pendant and has no other [ลิงก์].
  const linkOf = new Map(loadJewels().filter((j) => j.allowedChars).map((j) => [j.allowedChars, j.id]));
  for (const [name, { scenario, output }] of Object.entries(actual)) {
    if (!scenario.char) continue;
    assert.ok(output.results && output.results.length > 0, `${name}: no results`);
    for (const r of output.results) {
      assert.equal(r.ids[0], linkOf.get(scenario.char), `${name}: locked pendant`);
      assert.ok(r.ids.slice(1).every((id) => !id.startsWith('[ลิงก์]')), `${name}: extra [ลิงก์]`);
    }
  }

  if (process.env.UPDATE_GOLDEN === '1' || !fs.existsSync(GOLDEN)) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + '\n');
    t.diagnostic('golden file written: ' + path.relative(process.cwd(), GOLDEN));
    return;
  }
  const expected = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  for (const name of Object.keys(SCENARIOS)) {
    assert.deepEqual(actual[name], expected[name], `scenario "${name}" changed`);
  }
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
});
