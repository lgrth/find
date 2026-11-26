/* === v2.0: Character select — ดึงจาก gid=513976173 ของ SHEET_ID เดิม === */
(function(){
  const CHAR_SHEET_ID = _dk('7110d54204f1927075b0c4e391d643a56455a58020e782a1061137d3315791a0112255a05166e383e61286a5','k9x#mP2w');
  const CHAR_GID      = "513976173";
  const LINK_PREFIX   = "[ลิงก์]";
  const norm = s => (s == null ? "" : String(s)).trim();

  // เติมรายชื่อลง charSelect (รองรับทั้ง TomSelect และ native <select>)
  function fillCharSelect(names){
    const el = document.getElementById('charSelect');
    if (!el || !names.length) return;
    const uniq = Array.from(new Set(names.map(norm).filter(Boolean)))
                       .sort((a, b) => a.localeCompare(b, 'th'));

    if (el.tomselect){
      const ts = el.tomselect;
      const prev = ts.getValue();
      ts.clearOptions();
      ts.addOptions([{value:'', text:''}, ...uniq.map(n => ({value:n, text:n}))]);
      ts.refreshOptions(false);
      if (prev) ts.setValue(prev, true);
    } else {
      while (el.options.length > 1) el.remove(1);
      uniq.forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.textContent = n;
        el.appendChild(o);
      });
      // init TomSelect หลังเติม option แล้ว
      initTomSelectOnChar(el);
    }
  }

  // Init TomSelect บน charSelect ให้ค้นหาได้เหมือน ability select
  async function initTomSelectOnChar(el){
    const t0 = Date.now();
    while (!window.TomSelect && Date.now() - t0 < 6000){
      await new Promise(r => setTimeout(r, 100));
    }
    if (!window.TomSelect || el.tomselect) return;
    try {
      new TomSelect(el, {
        create: false,
        allowEmptyOption: true,
        placeholder: '🔍 พิมพ์ชื่อตัวละคร...',
        maxItems: 1,
        plugins: { clear_button: { title: 'ลบค่า' } },
        searchField: ['text', 'value'],
        onChange: function(){
          if (typeof updateCharPreview === 'function') updateCharPreview();
          if (typeof invalidateResultsForCriteriaChange === 'function') invalidateResultsForCriteriaChange();
          if (typeof updateCalcAvailability === 'function') updateCalcAvailability();
        },
        score: function(search){
          const base = this.getScoreFunction(search);
          return item => {
            let s = base(item);
            const q = (search || '').toLowerCase().trim();
            const t = (item.text || '').toLowerCase();
            if (q && t.startsWith(q)) s += 1.0;
            return s;
          };
        }
      });
    } catch(e){ console.warn('[CharSelect] TomSelect init failed', e); }
  }

  // JSONP callback — GViz ส่งข้อมูลกลับมา
  window.__CharGViz_v2 = function(resp){
    try {
      const t = resp.table || {};
      const cols = (t.cols || []).map(c => norm(c.label));

      // หา index ของคอลัมน์ ID และ AllowedChars
      let idxId = cols.findIndex(c => /^ID$/i.test(c));
      let idxAc = cols.findIndex(c => /^AllowedChars?$/i.test(c));
      // fallback: ถ้า headers ไม่ถูก detect ให้ใช้ col 0 = ID, col 1 = AllowedChars
      if (idxId < 0) idxId = 0;
      if (idxAc < 0) idxAc = 1;

      const set = new Set();
      const charToLinkId = window.__charToLinkId = {};
      (t.rows || []).forEach(r => {
        const c   = r.c || [];
        const id  = norm(c[idxId]?.v);
        const ac  = norm(c[idxAc]?.v);
        // ข้ามแถว header ที่อาจถูก return มาเป็น data row
        if (id === 'ID' || !id.startsWith(LINK_PREFIX)) return;
        if (ac) ac.split(/[,;|/、]+/).map(norm).filter(Boolean).forEach(n => {
          set.add(n);
          if (!charToLinkId[n]) charToLinkId[n] = id;
        });
      });

      if (set.size > 0){
        fillCharSelect(Array.from(set));
      } else {
        console.warn('[CharGViz] ไม่พบข้อมูลตัวละคร — ตรวจสอบว่า gid=513976173 มีข้อมูลและเปิดแชร์ให้ Anyone');
      }
    } catch(e){ console.warn('[CharGViz] parse error', e); }
    window.__charSheetReady = true;
    if(typeof updateCalcAvailability === 'function') updateCalcAvailability();
  };

  function loadCharGViz(){
    const tqx = encodeURIComponent('out:json;responseHandler:__CharGViz_v2');
    const src  = `https://docs.google.com/spreadsheets/d/${CHAR_SHEET_ID}/gviz/tq?gid=${CHAR_GID}&headers=1&tqx=${tqx}&rand=${Date.now()}`;
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onerror = () => { console.warn('[CharGViz] โหลดไม่สำเร็จ: ตรวจสิทธิ์แชร์ sheet ให้ Anyone with the link – Viewer'); window.__charSheetReady = true; if(typeof updateCalcAvailability === 'function') updateCalcAvailability(); };
    document.head.appendChild(s);
  }

  // รอให้ TomSelect พร้อมก่อน แล้วค่อย load
  document.addEventListener('DOMContentLoaded', async () => {
    // pre-init TomSelect บน charSelect (ก่อนมีข้อมูล) เพื่อให้ UI พร้อม
    const el = document.getElementById('charSelect');
    if (el) await initTomSelectOnChar(el);
    loadCharGViz();
  });
})();
