/* ===== Filter state — the one place that knows what a "filter" is =====
 *
 *   { selected: string[],  // wanted requirements (max MAX_SELECTS): skill names or 'กลุ่ม:<group>'
 *     unwanted: string[],  // unwanted requirements (same form)
 *     char:     string,    // character name, '' = none
 *     jewelTypes: string[],  // subset of 'dark' | 'white' | 'other'; [] = every pendant
 *     topK:     string }   // '3'–'50' (stored as string, as in saved presets)
 *
 * Every feature that reads, writes, saves or shares the filter goes through here:
 * search, share links, saved presets, import/export, feedback and analytics.
 * To add a filter field: add it to readFilterState / applyFilterState /
 * normalizeFilterState / summarizeFilterState and to the share-link codec below.
 */

const MAX_SAFE_STRING_LENGTH = 180;

function clampNumber(value, min, max, fallback){
  const n = Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function sanitizePlainString(value, maxLen = MAX_SAFE_STRING_LENGTH){
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function sanitizeStringArray(list, maxItems = 100, maxLen = MAX_SAFE_STRING_LENGTH){
  if(!Array.isArray(list)) return [];
  return Array.from(new Set(
    list
      .map(v => sanitizePlainString(v, maxLen))
      .filter(Boolean)
  )).slice(0, maxItems);
}

/* ---- pendant-type filter: [ดาร์ค] / [ไวท์] / อื่น ๆ (multi-select) ---- */

const JEWEL_TYPE_FILTERS = [
  { type: 'dark',  label: '[ดาร์ค]', bit: 1 },
  { type: 'white', label: '[ไวท์]',  bit: 2 },
  { type: 'other', label: 'อื่น ๆ',   bit: 4 }   // no prefix, or any other prefix
];

/** Valid, de-duplicated, in display order. */
function normalizeJewelTypes(list){
  const set = new Set(Array.isArray(list) ? list : []);
  return JEWEL_TYPE_FILTERS.map(f => f.type).filter(t => set.has(t));
}

function jewelTypesToBits(types){
  return normalizeJewelTypes(types).reduce((bits, t) => bits | JEWEL_TYPE_FILTERS.find(f => f.type === t).bit, 0);
}

function bitsToJewelTypes(bits){
  const n = Number(bits) || 0;
  return JEWEL_TYPE_FILTERS.filter(f => n & f.bit).map(f => f.type);
}

/** true when the filter lets every pendant through */
function isAllJewelTypes(types){
  const t = normalizeJewelTypes(types);
  return t.length === 0 || t.length === JEWEL_TYPE_FILTERS.length;
}

function jewelTypesLabel(types){
  if(isAllJewelTypes(types)) return 'ทุกจี้';
  return normalizeJewelTypes(types).map(t => JEWEL_TYPE_FILTERS.find(f => f.type === t).label).join(' + ');
}

function jewelTypeButtons(){
  return Array.from(document.querySelectorAll('#jewelTypeFilter .jewel-type'));
}

function readJewelTypesUI(){
  return normalizeJewelTypes(jewelTypeButtons().filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.type));
}

function setJewelTypesUI(types){
  const set = new Set(normalizeJewelTypes(types));
  jewelTypeButtons().forEach(b => {
    const on = set.has(b.dataset.type);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('active', on);
  });
  const all = document.getElementById('jewelTypeAll');
  if(all){
    const on = set.size === 0;
    all.setAttribute('aria-pressed', on ? 'true' : 'false');
    all.classList.toggle('active', on);
  }
}

/* ---- topK: hidden #topK holds the value, #topKSelect in the results header shows it ---- */
function setTopKValue(val){
  const v = String(clampNumber(val, 3, 50, DEFAULT_TOPK));
  if(topKInput) topKInput.value = v;
  const sel = document.getElementById('topKSelect');
  if(sel){
    if(!Array.from(sel.options).some(o => o.value === v)){
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = `Top ${v}`;
      const after = Array.from(sel.options).find(o => Number(o.value) > Number(v));
      sel.insertBefore(opt, after || null);
    }
    sel.value = v;
  }
  return v;
}

/* ---- ability groups (from the Abilities tab) ----
 * A whole group is picked as the requirement string 'กลุ่ม:<group>' (see search-core.js).
 * D5: a group and one of its own skills are never kept side by side — the group wins. */

/** Skills of `group` that some pendant actually has. */
function groupMembers(group){
  const names = (typeof _abilityList !== 'undefined' && _abilityList.length) ? _abilityList : [...abilities.keys()];
  return names.filter(n => abilityOf(n)?.group === group);
}

/** Groups for the group tabs: biggest first, "อื่น ๆ" last. */
function abilityGroupList(){
  const counts = new Map();
  const names = (typeof _abilityList !== 'undefined' && _abilityList.length) ? _abilityList : [...abilities.keys()];
  names.forEach(n => { const g = abilityOf(n)?.group; if(g) counts.set(g, (counts.get(g) || 0) + 1); });
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count, pickable: count >= 2 && group !== OTHER_GROUP }))
    .sort((a, b) => (a.group === OTHER_GROUP) - (b.group === OTHER_GROUP) || b.count - a.count || a.group.localeCompare(b.group, 'th'));
}

/** Shown text of a requirement: a skill name, or "🗂 โล่ (ทุกแบบ)". */
function requirementLabel(req){
  return isGroupRequirement(req) ? `🗂 ${groupOfRequirement(req)} (ทุกแบบ)` : String(req);
}

/** A group requirement counts only when its group still has skills (unknown groups from old links are dropped). */
function requirementExists(req){
  if(isGroupRequirement(req)) return !abilities.size || groupMembers(groupOfRequirement(req)).length >= 2;
  return (typeof _abilityList === 'undefined' || !_abilityList.length) ? true : _abilityList.includes(req);
}

/** true when some skill satisfies both requirements. */
function requirementsOverlap(a, b){
  if(a === b) return true;
  const ga = groupOfRequirement(a), gb = groupOfRequirement(b);
  if(ga && gb) return false;               // a skill belongs to one group only
  if(ga) return abilityOf(b)?.group === ga;
  if(gb) return abilityOf(a)?.group === gb;
  return false;
}

/* ---- conflicts: wanted skills that can never share a set ----
 * Two pendants in a set may not share a stack_key (Abilities tab), so e.g. โล่ขาว and
 * โล่ซูเปอร์ (both stack_key "โล่") can't both be in one set. A group requirement
 * conflicts only when none of its skills could sit next to the other requirement. */

function requirementSkills(req){
  return isGroupRequirement(req) ? groupMembers(groupOfRequirement(req)) : [req];
}

/** true when no skill of `a` can be in the same set as any skill of `b`. */
function requirementsConflict(a, b){
  if(a === b || requirementsOverlap(a, b)) return false;
  const key = (n)=> abilityOf(n)?.stackKey || n;
  const sa = requirementSkills(a), sb = requirementSkills(b);
  if(!sa.length || !sb.length) return false;
  return sa.every(x => sb.every(y => key(x) === key(y)));
}

/** Every conflicting pair in `list`, in list order: [[a, b], …]. */
function findRequirementConflicts(list){
  const pairs = [];
  const l = list || [];
  for(let i = 0; i < l.length; i++)
    for(let j = i + 1; j < l.length; j++)
      if(requirementsConflict(l[i], l[j])) pairs.push([l[i], l[j]]);
  return pairs;
}

/** Drop duplicates, unknown groups and skills already covered by a chosen group (D5). */
function mergeRequirements(list){
  const out = [];
  (list || []).forEach(req => {
    if(typeof req !== 'string' || !req || out.includes(req)) return;
    if(isGroupRequirement(req) && !requirementExists(req)) return;
    if(out.some(o => isGroupRequirement(o) && requirementsOverlap(o, req))) return;   // covered by a group
    if(isGroupRequirement(req)){
      for(let i = out.length - 1; i >= 0; i--) if(requirementsOverlap(req, out[i])) out.splice(i, 1);
    }
    out.push(req);
  });
  return out;
}

/* ---- character select (TomSelect or native <select>) ---- */

function getCharSelectValue(){
  const el = document.getElementById('charSelect');
  if (!el) return '';
  if (el.tomselect) return (el.tomselect.getValue() || '').trim();
  return (el.value || '').trim();
}

function setCharSelectValue(value){
  const el = document.getElementById('charSelect');
  if (!el || !value) return;
  if (el.tomselect){
    if (!el.tomselect.options[value]){
      el.tomselect.addOption({value, text:value});
      el.tomselect.refreshOptions(false);
    }
    el.tomselect.setValue(value, true);
  }
  else el.value = value;
}

function clearCharSelect(){
  const el = document.getElementById('charSelect');
  if(el?.tomselect) el.tomselect.clear(true);
  else if(el) el.value = '';
}

/* ---- read / write the form ---- */

/** Current filter as shown in the form. */
function readFilterState(){
  return {
    selected: getDesired(),
    unwanted: Array.isArray(window._chipUnwanted) ? window._chipUnwanted.slice() : [],
    char: getCharSelectValue(),
    jewelTypes: readJewelTypesUI(),
    topK: topKInput?.value ? String(topKInput.value) : String(DEFAULT_TOPK)
  };
}

/** Put values into the form. Only keys present in `partial` are changed. */
function applyFilterState(partial){
  const p = partial || {};
  if('selected' in p) window.setChipState(p.selected || []);
  if('unwanted' in p) window.setUnwantedState(p.unwanted || []);
  if('jewelTypes' in p) setJewelTypesUI(p.jewelTypes);
  if('topK' in p) setTopKValue(p.topK || DEFAULT_TOPK);
  if('char' in p){
    if(p.char) setCharSelectValue(p.char); else clearCharSelect();
  }
}

/** Clean an untrusted filter (saved preset, import file).
 *  Older data has `darkOnly: true` instead of `jewelTypes`; it becomes ['dark']. */
function normalizeFilterState(raw){
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  return {
    selected: sanitizeStringArray(src.selected, MAX_SELECTS, 120),
    unwanted: sanitizeStringArray(src.unwanted, MAX_SELECTS, 120),
    topK: clampNumber(src.topK, 3, 50, 10),
    jewelTypes: Array.isArray(src.jewelTypes) ? normalizeJewelTypes(src.jewelTypes) : (src.darkOnly ? ['dark'] : []),
    char: sanitizePlainString(src.char ?? '', 120)
  };
}

function hasMeaningfulFilter(state){
  return !!(
    state.selected.length ||
    state.unwanted.length ||
    state.char ||
    (state.jewelTypes || []).length ||
    String(state.topK || '') !== String(DEFAULT_TOPK)
  );
}

function summarizeFilterState(state){
  return [
    `${(state.selected || []).length} สกิลที่ต้องการ`,
    `${(state.unwanted || []).length} สกิลที่ไม่ต้องการ`,
    state.char ? state.char : 'ไม่เลือกตัวละคร',
    isAllJewelTypes(state.jewelTypes) ? 'ทุกจี้' : `${jewelTypesLabel(state.jewelTypes)} เท่านั้น`,
    `${state.topK || DEFAULT_TOPK} เซ็ต`
  ].join(' • ');
}

/* ---- share-link codec (compressed ?d=… payload) ----
 * Keys: s/u = skill indices (old links), sn/un = skill names (authoritative),
 *       k = topK (omitted when 10), ty = pendant types as bits (dark 1, white 2,
 *       other 4), c = character. Old links used m = 1 for "[ดาร์ค] only".
 * The positional indices shift whenever the sheet gains or drops a skill, so
 * names are written too and win when present.                                    */

function filterStateToShareParams(state){
  const selected = sanitizeStringArray(state.selected, MAX_SELECTS, 120);
  const unwanted = sanitizeStringArray(state.unwanted, MAX_SELECTS, 120);
  const topK = String(clampNumber(state.topK, 3, 50, 10));
  const char = sanitizePlainString(state.char || '', 120);
  const out = {};
  const s = toAbilityIndices(selected), u = toAbilityIndices(unwanted);
  if (s.length) out.s = s;
  if (u.length) out.u = u;
  if (selected.length) out.sn = selected;
  if (unwanted.length) out.un = unwanted;
  if (topK !== '10') out.k = topK;
  const ty = jewelTypesToBits(state.jewelTypes);
  if (ty) out.ty = ty;
  if (char) out.c = char;
  return out;
}

/** Inverse of filterStateToShareParams. `topK` is '' and `char` '' when absent. */
function shareParamsToFilterState(parsed){
  const nameSels = sanitizeStringArray(Array.isArray(parsed.sn) ? parsed.sn.slice(0, MAX_SELECTS) : [], MAX_SELECTS, 120);
  const nameUnwanted = sanitizeStringArray(Array.isArray(parsed.un) ? parsed.un.slice(0, MAX_SELECTS) : [], MAX_SELECTS, 120);
  const idxSels = fromAbilityIndices(Array.isArray(parsed.s) ? parsed.s.slice(0, MAX_SELECTS) : []);
  const idxUnwanted = fromAbilityIndices(Array.isArray(parsed.u) ? parsed.u.slice(0, MAX_SELECTS) : []);
  return {
    selected: nameSels.length ? nameSels : idxSels,
    unwanted: nameUnwanted.length ? nameUnwanted : idxUnwanted,
    topK: parsed.k != null ? String(clampNumber(parsed.k, 3, 50, 10)) : '',
    jewelTypes: parsed.ty != null ? bitsToJewelTypes(parsed.ty) : (parsed.m === 1 ? ['dark'] : []),
    char: parsed.c != null ? sanitizePlainString(parsed.c, 120) : ''
  };
}
