/* ===== Sheet cache — show the last loaded sheet data instantly on refresh =====
 *
 * Every GViz table the app loads (pendants, Abilities, Triggers, characters) is
 * kept in localStorage in a compact form. On the next visit the page is built
 * from this copy right away and the sheet is fetched again in the background
 * (stale-while-revalidate); main.js / char-select.js swap in the fresh data when
 * it differs.
 *
 * Stored per tab under SHEET_CACHE_PREFIX + name as
 *   { v: SHEET_CACHE_VERSION, t: savedAt(ms), l: labels[], r: rows as arrays of cell values }
 * and read back as a GViz-shaped table { cols:[{label}], rows:[{c:[{v}|null]}] },
 * so the parsers do not know whether a table came from the cache or the network.
 */
const SHEET_CACHE_PREFIX = 'sheet_cache:';
const SHEET_CACHE_VERSION = 1;
const SHEET_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;   // older copies are ignored

function compactSheetTable(table){
  return {
    l: (table?.cols || []).map(c => String(c?.label ?? '')),
    r: (table?.rows || []).map(row => (row?.c || []).map(c => (c == null ? null : (c.v ?? c.f ?? null))))
  };
}

function expandSheetTable(compact){
  return {
    cols: (compact?.l || []).map(label => ({ label })),
    rows: (compact?.r || []).map(cells => ({ c: cells.map(v => (v == null ? null : { v })) }))
  };
}

/** The cached table for `name`, or null. */
function readSheetCache(name){
  try{
    const raw = localStorage.getItem(SHEET_CACHE_PREFIX + name);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || data.v !== SHEET_CACHE_VERSION || !Array.isArray(data.r)) return null;
    if(!(Date.now() - data.t < SHEET_CACHE_MAX_AGE_MS)) return null;
    return expandSheetTable(data);
  }catch(_){ return null; }
}

/**
 * Save `table` for `name`. Returns true when the stored rows changed
 * (false when they are the same as before, or when saving is not possible).
 */
function writeSheetCache(name, table){
  if(!table) return false;
  const compact = compactSheetTable(table);
  const key = SHEET_CACHE_PREFIX + name;
  let prevBody = null;
  try{
    const prev = JSON.parse(localStorage.getItem(key) || 'null');
    if(prev && prev.v === SHEET_CACHE_VERSION) prevBody = JSON.stringify({ l: prev.l, r: prev.r });
  }catch(_){}
  const body = JSON.stringify(compact);
  try{
    localStorage.setItem(key, JSON.stringify({ v: SHEET_CACHE_VERSION, t: Date.now(), l: compact.l, r: compact.r }));
  }catch(_){
    try{ localStorage.removeItem(key); }catch(__){}   // quota full: keep nothing rather than a stale copy
  }
  return prevBody !== body;
}

if (typeof module === 'object' && module.exports){
  module.exports = { compactSheetTable, expandSheetTable, readSheetCache, writeSheetCache };
}
