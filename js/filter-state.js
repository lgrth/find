/* ===== Filter state — the one place that knows what a "filter" is =====
 *
 *   { selected: string[],  // wanted skills (max MAX_SELECTS)
 *     unwanted: string[],  // unwanted skills
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
  if('topK' in p){
    if(topKInput) topKInput.value = String(p.topK || DEFAULT_TOPK);
    document.querySelectorAll('.topk-preset').forEach(b => b.classList.toggle('active', b.dataset.val === String(topKInput?.value || DEFAULT_TOPK)));
  }
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
