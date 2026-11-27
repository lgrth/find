/* ===== Data model: Google Sheet table → pendant objects (pure, no DOM) =====
 *
 * Sheet layout (tab 1):  ID | AllowedChars | Substat1 | Value1 | (Note1) | … | Substat5 | Value5 | (Note5) | (Type)
 * NoteN (optional) = conditions of that skill on that pendant, written as in the game — see parseNote().
 *
 * Pendant object:
 *   {
 *     id:           '[ดาร์ค] พีชมอนสเตอร์',   // name shown in game (unique)
 *     prefix:       '[ดาร์ค]',                 // bracketed tag at the start of the name, or ''
 *     type:         'dark' | 'white' | 'link' | 'other',
 *     allowedChars: 'โมเสส',                    // only on 'link' pendants
 *     substats:     [{ name: 'โดรนก๊อปปี้', value: 50 }, …]   // 1–5 skills
 *                   // + when NoteN is filled: note, and any of grow / decay / decayAfter / limit
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
    const cols = { id: find(/^ID$/i), allowedChars: find(/^AllowedChars?$/i), type: find(/^Type$/i), substat: [], value: [], note: [] };
    for(let s=1; s<=SUBSTAT_SLOTS; s++){
      cols.substat.push(find(new RegExp(`^Substat${s}$`, 'i')));
      cols.value.push(find(new RegExp(`^Value${s}$`, 'i')));
      cols.note.push(find(new RegExp(`^Note${s}$`, 'i')));
    }
    return cols;
  }
  // No header row: the original layout without Note columns
  const cols = { id: 0, allowedChars: 1, type: -1, substat: [], value: [], note: [] };
  for(let s=0; s<SUBSTAT_SLOTS; s++){ cols.substat.push(2 + s*2); cols.value.push(3 + s*2); cols.note.push(-1); }
  return cols;
}

/* ---- NoteN: conditions of one skill on one pendant, in the game's own words ----
 *   "+5% เมื่อไม่แสดงผล"        → grow: 5          (📈 +5 every time it does not trigger, back to start when it does)
 *   "หลัง 2 เทิร์น ลดลง -50%"   → decay: 50, decayAfter: 2   (📉 once, minus 50)
 *   "จำกัด 2 ครั้ง" / "2 ครั้ง"  → limit: 2         (🔒 at most 2 times per game)
 * Several conditions may share one cell, separated by commas.                      */
const NUM = '(\\d+(?:\\.\\d+)?)';
const NOTE_PATTERNS = [
  { re: new RegExp(`^หลัง\\s*${NUM}\\s*เทิร์น\\s*ลดลง\\s*[-−]?\\s*${NUM}\\s*%?$`), set: (m, o)=>{ o.decayAfter = +m[1]; o.decay = +m[2]; } },
  { re: new RegExp(`^\\+?\\s*${NUM}\\s*%?\\s*เมื่อไม่แสดงผล$`),                    set: (m, o)=>{ o.grow = +m[1]; } },
  { re: new RegExp(`^(?:จำกัด\\s*)?${NUM}\\s*ครั้ง$`),                              set: (m, o)=>{ o.limit = +m[1]; } },
];

/** @returns {{ grow?, decay?, decayAfter?, limit?, unknown: string[] }} */
function parseNote(text){
  const out = { unknown: [] };
  String(text ?? '').split(/[,，]/).map(t => t.trim().replace(/^\(|\)$/g, '').trim()).filter(Boolean).forEach(part => {
    const p = NOTE_PATTERNS.find(p => p.re.test(part));
    if(p) p.set(part.match(p.re), out); else out.unknown.push(part);
  });
  return out;
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
    const noteProblems = [];
    for(let s=0; s<SUBSTAT_SLOTS; s++){
      const name = String(cell(row, col.substat[s]) ?? '').trim();
      const note = String(cell(row, col.note[s]) ?? '').trim();
      if(!name){ if(note) noteProblems.push(`Note${s+1} "${note}" แต่ไม่มี Substat${s+1}`); continue; }
      const sub = { name, value: parseNumber(cell(row, col.value[s])) };
      if(note){
        const { unknown, ...cond } = parseNote(note);
        Object.assign(sub, { note }, cond);
        if(unknown.length) noteProblems.push(`Note${s+1} อ่านไม่ออก: "${unknown.join('", "')}"`);
        if(cond.grow != null && cond.decay != null) noteProblems.push(`Note${s+1} มีทั้งเติบโตและลดลง — ใช้แค่ลดลง`);
      }
      substats.push(sub);
    }
    if(!substats.length) return;   // blank / spacer row
    if(!id){ problems.push(`แถว ${i+2}: มีความสามารถแต่ไม่มี ID`); return; }
    noteProblems.forEach(msg => problems.push(`แถว ${i+2} "${id}": ${msg}`));
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

/* ===== Abilities tab: one row per skill =====
 * name | group | variant | trigger | stack_key | unit | max_stack | keywords
 * (extra columns such as pendants / review / an old max_value are ignored)
 *
 * Ability object:
 *   { name, group ('อื่น ๆ' when blank), variant, trigger,
 *     stackKey   — skills with the same key may not share a set (blank → name),
 *     unit       — 'chance' (%, max 100) | 'amount' (can exceed 100),
 *     maxValue   — divisor for the score: 100 for chance, the highest value any pendant has for amount
 *                  (set by finalizeAbilities, not read from the sheet),
 *     maxStack   — number | null (display only),
 *     keywords   — string[] (search aliases) }
 */
const OTHER_GROUP = 'อื่น ๆ';
const ABILITY_UNITS = ['chance', 'amount'];

function splitList(text){
  return String(text ?? '').split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
}

/** Rows of a header-labelled GViz table as objects keyed by lower-case label. */
function tableRecords(table){
  const labels = (table?.cols || []).map(c => String(c?.label || '').trim().toLowerCase());
  return (table?.rows || []).map(row => {
    const rec = {};
    labels.forEach((l, i)=>{ if(l){ const c = row?.c?.[i]; rec[l] = c ? (c.v ?? c.f ?? '') : ''; } });
    return rec;
  });
}

/** @returns {{ abilities: Map<string, object>, problems: string[] }} */
function parseAbilitiesTable(table){
  const abilities = new Map();
  const problems = [];
  tableRecords(table).forEach((r, i)=>{
    const name = String(r.name ?? '').trim();
    if(!name) return;
    const row = i + 2;
    if(abilities.has(name)) problems.push(`Abilities แถว ${row}: ชื่อซ้ำ "${name}"`);
    let unit = String(r.unit ?? '').trim().toLowerCase() || 'chance';
    if(!ABILITY_UNITS.includes(unit)){ problems.push(`Abilities แถว ${row}: unit "${r.unit}" ไม่รู้จัก (ใช้ chance / amount)`); unit = 'chance'; }
    const stackRaw = String(r.max_stack ?? '').trim();
    const maxStack = stackRaw ? parseNumber(stackRaw) : null;
    abilities.set(name, {
      name,
      group: String(r.group ?? '').trim() || OTHER_GROUP,
      variant: String(r.variant ?? '').trim(),
      trigger: String(r.trigger ?? '').trim(),
      stackKey: String(r.stack_key ?? '').trim() || name,
      unit,
      maxValue: null,   // filled in by finalizeAbilities()
      maxStack: maxStack > 0 ? maxStack : null,
      keywords: splitList(r.keywords)
    });
  });
  return { abilities, problems };
}

/** Triggers tab (optional): trigger | order | note → ordered list of trigger names. */
function parseTriggersTable(table){
  return tableRecords(table)
    .map((r, i) => ({ trigger: String(r.trigger ?? '').trim(), order: r.order === '' || r.order == null ? Infinity : parseNumber(r.order), i }))
    .filter(t => t.trigger)
    .sort((a, b) => (a.order - b.order) || (a.i - b.i))
    .map(t => t.trigger);
}

/**
 * Fill defaults that depend on the pendants and cross-check both tabs.
 * Every skill used by a pendant gets an Ability (a default one if the tab lacks it).
 * @returns {string[]} problems
 */
function finalizeAbilities(abilities, jewels, triggers = []){
  const problems = [];
  const highest = new Map();
  const growing = new Set();
  jewels.forEach(j => j.substats.forEach(s => {
    highest.set(s.name, Math.max(highest.get(s.name) ?? -Infinity, s.value));
    if(s.grow != null || s.decay != null) growing.add(s.name);
  }));

  const missing = [...highest.keys()].filter(n => !abilities.has(n));
  if(abilities.size && missing.length) problems.push(`Abilities: ไม่มีแถวของ ${missing.length} สกิล (ใช้กลุ่ม "${OTHER_GROUP}"): ${missing.join(', ')}`);
  missing.forEach(name => abilities.set(name, {
    name, group: OTHER_GROUP, variant: '', trigger: '', stackKey: name, unit: 'chance', maxValue: null, maxStack: null, keywords: []
  }));

  const knownTriggers = new Set(triggers);
  abilities.forEach(a => {
    const top = highest.get(a.name);
    if(top === undefined){ problems.push(`Abilities: "${a.name}" ไม่มีจี้ใช้`); }
    a.maxValue = a.unit === 'amount' ? Math.max(top ?? 0, 100) : 100;
    if(a.unit === 'chance' && top > 100) problems.push(`"${a.name}" เป็นโอกาส (chance) แต่มีค่า ${top} > 100`);
    if(top === 0) problems.push(`"${a.name}" มีค่า 0 ในแท็บจี้`);
    if(a.unit === 'amount' && growing.has(a.name)) problems.push(`"${a.name}" เป็นจำนวน (amount) แต่มี Note เติบโต/ลดลง (ออกแบบไว้สำหรับโอกาส)`);
    if(a.trigger && knownTriggers.size && !knownTriggers.has(a.trigger)) problems.push(`"${a.name}": trigger "${a.trigger}" ไม่อยู่ในแท็บ Triggers`);
  });
  return problems;
}

if (typeof module === 'object' && module.exports){
  module.exports = { PENDANT_TYPES, OTHER_GROUP, pendantPrefix, pendantType, parseSheetTable, parseNumber, parseNote,
    parseAbilitiesTable, parseTriggersTable, finalizeAbilities };
}
