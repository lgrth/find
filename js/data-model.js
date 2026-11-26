/* ===== Data model: Google Sheet table → pendant objects (pure, no DOM) =====
 *
 * Sheet layout (tab 1):  ID | AllowedChars | Substat1 | Value1 | … | Substat5 | Value5 | (Type)
 *
 * Pendant object:
 *   {
 *     id:           '[ดาร์ค] พีชมอนสเตอร์',   // name shown in game (unique)
 *     prefix:       '[ดาร์ค]',                 // bracketed tag at the start of the name, or ''
 *     type:         'dark' | 'white' | 'link' | 'other',
 *     allowedChars: 'โมเสส',                    // only on 'link' pendants
 *     substats:     [{ name: 'โดรนก๊อปปี้', value: 50 }, …]   // 1–5 skills
 *   }
 *
 * An optional "Type" column (dark / white / link / other) overrides the prefix.
 */

const PENDANT_PREFIX_TYPES = { '[ดาร์ค]': 'dark', '[ไวท์]': 'white', '[ลิงก์]': 'link' };
const PENDANT_TYPES = ['dark', 'white', 'link', 'other'];
const SUBSTAT_SLOTS = 5;

function parseNumber(val){
  if(typeof val === 'number') return val;
  const n = parseFloat(String(val ?? '').replace(/[, ]+/g,'').replace('%',''));
  return isNaN(n) ? 0 : n;
}

function pendantPrefix(id){
  const m = String(id || '').trim().match(/^\[[^\]]+\]/);
  return m ? m[0] : '';
}

function pendantType(id, typeColumn){
  const explicit = String(typeColumn || '').trim().toLowerCase();
  if(PENDANT_TYPES.includes(explicit)) return explicit;
  return PENDANT_PREFIX_TYPES[pendantPrefix(id)] || 'other';
}

/**
 * Column index for each field. Uses header labels when the sheet has them; GViz
 * sometimes drops the header row, then falls back to the fixed layout above.
 */
function resolveColumns(labels){
  const find = (re)=> labels.findIndex(l => re.test(l));
  if(find(/^ID$/i) >= 0){
    const cols = { id: find(/^ID$/i), allowedChars: find(/^AllowedChars?$/i), type: find(/^Type$/i), substat: [], value: [] };
    for(let s=1; s<=SUBSTAT_SLOTS; s++){
      cols.substat.push(find(new RegExp(`^Substat${s}$`, 'i')));
      cols.value.push(find(new RegExp(`^Value${s}$`, 'i')));
    }
    return cols;
  }
  const cols = { id: 0, allowedChars: 1, type: -1, substat: [], value: [] };
  for(let s=0; s<SUBSTAT_SLOTS; s++){ cols.substat.push(2 + s*2); cols.value.push(3 + s*2); }
  return cols;
}

/**
 * @param {{cols: Array<{label?:string,id?:string}>, rows: Array<{c: Array<{v?:any,f?:string}|null>}>}} table  GViz table
 * @returns {{ jewels: object[], problems: string[] }}  problems = rows skipped or suspicious (for console warnings)
 */
function parseSheetTable(table){
  const labels = (table?.cols || []).map(c => String(c?.label || '').trim());
  const col = resolveColumns(labels);
  const cell = (row, i)=>{
    if(i < 0) return '';
    const c = row?.c?.[i];
    return c ? (c.v ?? c.f ?? '') : '';
  };

  const jewels = [];
  const problems = [];
  const seen = new Set();
  (table?.rows || []).forEach((row, i)=>{
    const id = String(cell(row, col.id) ?? '').trim();
    const substats = [];
    for(let s=0; s<SUBSTAT_SLOTS; s++){
      const name = String(cell(row, col.substat[s]) ?? '').trim();
      if(name) substats.push({ name, value: parseNumber(cell(row, col.value[s])) });
    }
    if(!substats.length) return;   // blank / spacer row
    if(!id){ problems.push(`แถว ${i+2}: มีความสามารถแต่ไม่มี ID`); return; }
    if(seen.has(id)) problems.push(`แถว ${i+2}: ID ซ้ำ "${id}"`);
    seen.add(id);

    const jewel = { id, prefix: pendantPrefix(id), type: pendantType(id, cell(row, col.type)), substats };
    if(jewel.type === 'link'){
      jewel.allowedChars = String(cell(row, col.allowedChars) ?? '').trim();
      if(!jewel.allowedChars) problems.push(`แถว ${i+2}: จี้ลิงก์ "${id}" ไม่มี AllowedChars`);
    }
    jewels.push(jewel);
  });
  return { jewels, problems };
}

if (typeof module === 'object' && module.exports){
  module.exports = { PENDANT_TYPES, pendantPrefix, pendantType, parseSheetTable, parseNumber };
}
