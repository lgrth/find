/* ===== Filter state — the one place that knows what a "filter" is =====
 *
 *   { selected: string[],  // wanted skills (max MAX_SELECTS)
 *     unwanted: string[],  // unwanted skills
 *     char:     string,    // character name, '' = none
 *     darkOnly: boolean,
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
    darkOnly: !!darkOnly?.checked,
    topK: topKInput?.value ? String(topKInput.value) : String(DEFAULT_TOPK)
  };
}

/** Put values into the form. Only keys present in `partial` are changed. */
function applyFilterState(partial){
  const p = partial || {};
  if('selected' in p) window.setChipState(p.selected || []);
  if('unwanted' in p) window.setUnwantedState(p.unwanted || []);
  if('darkOnly' in p && darkOnly) darkOnly.checked = !!p.darkOnly;
  if('topK' in p){
    if(topKInput) topKInput.value = String(p.topK || DEFAULT_TOPK);
    document.querySelectorAll('.topk-preset').forEach(b => b.classList.toggle('active', b.dataset.val === String(topKInput?.value || DEFAULT_TOPK)));
  }
  if('char' in p){
    if(p.char) setCharSelectValue(p.char); else clearCharSelect();
  }
}

/** Clean an untrusted filter (saved preset, import file). */
function normalizeFilterState(raw){
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  return {
    selected: sanitizeStringArray(src.selected, MAX_SELECTS, 120),
    unwanted: sanitizeStringArray(src.unwanted, MAX_SELECTS, 120),
    topK: clampNumber(src.topK, 3, 50, 10),
    darkOnly: !!src.darkOnly,
    char: sanitizePlainString(src.char ?? '', 120)
  };
}

function hasMeaningfulFilter(state){
  return !!(
    state.selected.length ||
    state.unwanted.length ||
    state.char ||
    state.darkOnly ||
    String(state.topK || '') !== String(DEFAULT_TOPK)
  );
}

function summarizeFilterState(state){
  return [
    `${(state.selected || []).length} สกิลที่ต้องการ`,
    `${(state.unwanted || []).length} สกิลที่ไม่ต้องการ`,
    state.char ? state.char : 'ไม่เลือกตัวละคร',
    state.darkOnly ? '[ดาร์ค] เท่านั้น' : 'ทุกจี้',
    `${state.topK || DEFAULT_TOPK} เซ็ต`
  ].join(' • ');
}

/* ---- share-link codec (compressed ?d=… payload) ----
 * Keys: s/u = skill indices (old links), sn/un = skill names (authoritative),
 *       k = topK (omitted when 10), m = 1 for darkOnly, c = character.
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
  if (state.darkOnly) out.m = 1;
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
    darkOnly: parsed.m === 1,
    char: parsed.c != null ? sanitizePlainString(parsed.c, 120) : ''
  };
}
