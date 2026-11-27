/* Pure helpers for the compact result cards (no DOM). Shared by main.js and the Node tests. */

const JEWEL_PREFIX_RE = /^\[([^\]]+)\]\s*/;
const JEWEL_TAG_RE = /\s*\(([^()]+)\)\s*$/;

/** '[ดาร์ค] หมวกเหมียวไบค์ (ครบรอบ 12 ปี)' → { prefix:'ดาร์ค', base:'หมวกเหมียวไบค์', tag:'ครบรอบ 12 ปี' } */
function splitJewelName(id){
  let rest = String(id || '').trim();
  let prefix = '';
  let tag = '';
  const p = rest.match(JEWEL_PREFIX_RE);
  if(p){ prefix = p[1]; rest = rest.slice(p[0].length); }
  const t = rest.match(JEWEL_TAG_RE);
  if(t && t.index > 0){ tag = t[1]; rest = rest.slice(0, t.index); }
  return { prefix, base: rest, tag };
}

/** CSS modifier for a name prefix: dark | white | link | other */
function jewelPrefixKind(prefix){
  if(prefix === 'ดาร์ค') return 'dark';
  if(prefix === 'ไวท์') return 'white';
  if(prefix === 'ลิงก์') return 'link';
  return 'other';
}

/**
 * Fold results that differ by a single pendant into one group, in rank order.
 * items: [{ ids: string[], quality?: string }]  (quality: members must match, e.g. "matched|unwanted")
 * → [{ members: item[], base: string[] | null }]  base = the ids every member shares (null for a lone item)
 */
function groupSimilarResults(items){
  const groups = [];
  (items || []).forEach(item => {
    const ids = Array.isArray(item?.ids) ? item.ids : [];
    const quality = item?.quality ?? '';
    for(const g of groups){
      const first = g.members[0];
      if((first.quality ?? '') !== quality) continue;
      if(first.ids.length !== ids.length || ids.length < 2) continue;
      if(g.base){
        if(g.base.every(id => ids.includes(id))){ g.members.push(item); return; }
      }else{
        const shared = first.ids.filter(id => ids.includes(id));
        if(shared.length === ids.length - 1){ g.base = shared; g.members.push(item); return; }
      }
    }
    groups.push({ members: [item], base: null });
  });
  return groups;
}

/** Ids present in every list (order of the first list). Empty when fewer than `minLists` lists. */
function commonIds(lists, minLists = 3){
  if(!Array.isArray(lists) || lists.length < minLists) return [];
  const [first, ...rest] = lists;
  return (first || []).filter(id => rest.every(l => (l || []).includes(id)));
}

/** true when every value is equal (and there are at least two). */
function allEqual(values){
  return Array.isArray(values) && values.length > 1 && values.every(v => v === values[0]);
}

if (typeof module === 'object' && module.exports){
  module.exports = { splitJewelName, jewelPrefixKind, groupSimilarResults, commonIds, allEqual };
}
