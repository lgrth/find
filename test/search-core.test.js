'use strict';
// Unit tests for js/search-core.js (runs in plain Node, no browser).
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/search-core.js');
const { loadJewels } = require('./helpers/fixture-jewels');

const jewels = loadJewels();
const nonLink = jewels.filter((j) => !j.id.startsWith('[ลิงก์]'));
const DESIRED = ['โดรนก๊อปปี้', 'โล่ซูเปอร์', 'บัตรเชิญ', 'คุมเต๋า', 'ขังคุก', 'ยิงระเบิด'];

function sharesSkill(ids) {
  const byId = new Map(jewels.map((j) => [j.id, j]));
  const seen = new Set();
  for (const id of ids) for (const s of byId.get(id).substats) { if (seen.has(s.name)) return true; seen.add(s.name); }
  return false;
}

test('jewelToCandidate builds the desired-skill bitmask', () => {
  const j = { id: 'x', substats: [{ name: 'B', value: 10 }, { name: 'Z', value: 5 }, { name: 'U', value: 1 }] };
  const c = core.jewelToCandidate(j, ['A', 'B'], ['U']);
  assert.equal(c.mask, 0b10);
  assert.equal(c.score, 10);
  assert.equal(c.unwantedCount, 1);
  assert.equal(c.extraCount, 1);
});

test('buildCandidates keeps at least one pendant for every desired skill', () => {
  const cand = core.buildCandidates(DESIRED, nonLink, [], 10);
  for (let bit = 0; bit < DESIRED.length; bit++) assert.ok(cand.some((c) => c.mask & (1 << bit)), DESIRED[bit]);
});

test('searchCombos never puts two pendants with the same skill in one set', () => {
  const cand = core.buildCandidates(DESIRED, nonLink, []);
  const best = core.searchCombos({ desired: DESIRED, cand, topK: 30 });
  assert.equal(best.length, 30);
  for (const r of best) assert.equal(sharesSkill(r.ids), false, r.ids.join(' + '));
});

test('pruned 4-set search finds the same best coverage as brute force', () => {
  // Small random instances so brute force over all 4-sets is cheap.
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let round = 0; round < 20; round++) {
    const pool = Array.from({ length: 22 }, () => nonLink[Math.floor(rnd() * nonLink.length)]);
    const uniq = [...new Map(pool.map((j) => [j.id, j])).values()];
    const cand = core.buildCandidates(DESIRED, uniq, [], 999);
    const best = core.searchCombos({ desired: DESIRED, cand, topK: 5 });
    let bruteMin = Infinity;
    const n = cand.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
      const ids = [cand[a], cand[b], cand[c], cand[d]];
      if (sharesSkill(ids.map((x) => x.id))) continue;
      const mask = ids.reduce((m, x) => m | x.mask, 0);
      bruteMin = Math.min(bruteMin, DESIRED.length - core.popcount(mask));
    }
    if (bruteMin === Infinity) assert.equal(best.length, 0);
    else assert.equal(best[0].notMiss, bruteMin, `round ${round}`);
  }
});

test('locked pendant is always in slot 1 and fillers make full sets possible', () => {
  const link = jewels.find((j) => j.allowedChars === 'โมเสส');
  const desired = ['ยิงระเบิด', 'ยกเว้นค่าผ่านทาง', 'โดรนก๊อปปี้', 'โล่ซูเปอร์', 'บัตรเชิญ'];
  const others = core.compatibleWith(link, nonLink);
  assert.ok(others.every((j) => !j.substats.some((s) => link.substats.some((t) => t.name === s.name))));
  const fixed = core.jewelToCandidate(link, desired);

  const withoutFillers = core.searchCombos({ desired, cand: core.buildCandidates(desired, others), topK: 10, fixed });
  assert.equal(withoutFillers.length, 0, 'only 2 open slots can add a wanted skill here');

  const cand = core.buildCandidates(desired, others).concat(core.buildFillerCandidates(desired, others));
  const best = core.searchCombos({ desired, cand, topK: 10, fixed });
  assert.equal(best.length, 10);
  for (const r of best) {
    assert.equal(r.ids[0], link.id);
    assert.equal(sharesSkill(r.ids), false);
  }
  assert.equal(best[0].notMiss, 0);
});

test('stack_key: pendants whose skills share a stack key never pair (โล่ซูเปอร์ + โล่ขาว)', () => {
  const abilityOf = (n) => (n === 'โล่ซูเปอร์' || n === 'โล่ขาว' ? { stackKey: 'โล่' } : undefined);
  const desired = ['โล่ซูเปอร์', 'โล่ขาว', 'ป้องกันเอฟเฟคอันตราย', 'ป้องกันขังคุก', 'ป้องกันบังคับย้ายและดักจับ'];
  const hasShield = (id) => jewels.find((j) => j.id === id).substats.some((s) => s.name === 'โล่ซูเปอร์' || s.name === 'โล่ขาว');

  const without = core.searchCombos({ desired, cand: core.buildCandidates(desired, nonLink), topK: 10 });
  assert.ok(without.some((r) => r.ids.filter(hasShield).length > 1), 'by name only, both shields can pair');

  const cand = core.buildCandidates(desired, nonLink, [], 120, abilityOf);
  const best = core.searchCombos({ desired, cand, topK: 10 });
  assert.equal(best.length, 10);
  for (const r of best) assert.ok(r.ids.filter(hasShield).length <= 1, r.ids.join(' + '));
  assert.ok(best[0].notMiss >= 1, 'cannot have both shields any more');

  const link = { id: 'L', substats: [{ name: 'โล่ขาว', value: 50 }] };
  assert.ok(core.compatibleWith(link, nonLink, abilityOf).every((j) => !hasShield(j.id)));
});

test('group requirement: one bit for any skill of the group, scored by its best skill', () => {
  const abilityOf = (n) => ({ A1: { group: 'A' }, A2: { group: 'A' }, B: { group: 'B' } })[n];
  const j = { id: 'x', substats: [{ name: 'A1', value: 30 }, { name: 'A2', value: 80 }, { name: 'B', value: 10 }, { name: 'U', value: 5 }] };
  const c = core.jewelToCandidate(j, ['กลุ่ม:A', 'Q'], ['U'], abilityOf);
  assert.equal(c.mask, 0b01);
  assert.equal(c.score, 80, 'best skill of the group only (E4)');
  assert.deepEqual(c.otherNames, ['B', 'U']);
  assert.equal(c.unwantedCount, 1);

  const u = core.jewelToCandidate(j, ['Q'], ['กลุ่ม:A'], abilityOf);
  assert.equal(u.unwantedCount, 2, 'an unwanted group counts each of its skills');
  assert.equal(u.extraCount, 2);
});

test('growAverage: long-run trigger rate of "+x% เมื่อไม่แสดงผล"', () => {
  const r = (a, g) => Math.round(core.growAverage(a, g) * 10) / 10;
  assert.equal(r(45, 5), 49.4);   // ขังคุก 45% +5 (แกนบลัดกักขังโกสต์)
  assert.equal(r(10, 5), 22.1);
  assert.equal(r(30, 5), 36.9);
  assert.equal(r(60, 5), 62.7);
  assert.equal(r(45, 0), 45);
  assert.equal(r(100, 5), 100);
  assert.equal(r(0, 50), 40);     // 0% → 50% → 100%: fires after 2 or 3 turns, 2.5 on average
});

test('effectiveValue: decay uses the value after the drop, limit changes nothing, amount skills untouched', () => {
  assert.equal(core.effectiveValue({ value: 80, decay: 50, decayAfter: 2 }), 30);   // แปลน 3 หลัง
  assert.equal(core.effectiveValue({ value: 40, decay: 50, decayAfter: 2 }), 0);
  assert.equal(core.effectiveValue({ value: 95, limit: 1 }), 95);
  assert.equal(core.effectiveValue({ value: 50 }), 50);
  assert.equal(core.effectiveValue({ value: 50, decay: 10, grow: 5 }), 40, 'both → decay only');
  assert.equal(core.effectiveValue({ value: 120, decay: 50 }, { unit: 'amount' }), 120);
});

test('a decaying skill scores lower and can lose the tie-break', () => {
  const A = { id: 'A', substats: [{ name: 'X', value: 80, decay: 50, decayAfter: 2 }] };
  const B = { id: 'B', substats: [{ name: 'X', value: 60 }] };
  const C = { id: 'C', substats: [{ name: 'X', value: 45, grow: 5 }] };
  assert.equal(core.jewelToCandidate(A, ['X']).score, 30);
  assert.equal(core.jewelToCandidate(B, ['X']).score, 60);
  assert.equal(Math.round(core.jewelToCandidate(C, ['X']).score * 10) / 10, 49.4);
  const order = core.buildCandidates(['X'], [A, B, C], [], 10).map((c) => c.id);
  assert.deepEqual(order, ['B', 'C', 'A']);
});
