(function(){
  // Guard to avoid double-apply
  if (window.__charLinkPatched) return;
  window.__charLinkPatched = true;

  const LINK_PREFIX = "[ลิงก์]";
  function isLinkId(id){
    return typeof id === 'string' && id.trim().startsWith(LINK_PREFIX);
  }
  window.isLinkId = window.isLinkId || isLinkId;

  // Wait helper
  function waitFor(condFn, timeoutMs=8000, step=100){
    return new Promise((resolve, reject)=>{
      const t0 = Date.now();
      (function tick(){
        try{
          if(condFn()){ resolve(true); return; }
        }catch(e){}
        if(Date.now()-t0>timeoutMs){ resolve(false); return; }
        setTimeout(tick, step);
      })();
    });
  }

  async function waitForTomSelect(){
    return !!(window.TomSelect);
  }

  // 1) Build character list from jewels (rows with [ลิงก์], using AllowedChars)
  async function buildCharacterSelect(){
    const el = document.getElementById('charSelect');
    if(!el) return;

    // Ensure jewels is loaded; some apps set it globally after fetch
    let maxWait = 50;
    while (!window.jewels && maxWait-- > 0){
      await new Promise(r=>setTimeout(r, 100));
    }
    const js = window.jewels || [];
    const linkJewels = js.filter(j => j && j.id && isLinkId(j.id));
    const charNames = Array.from(new Set(
      linkJewels.map(j => (j.allowedChars || j.AllowedChars || '').toString().trim()).filter(Boolean)
    )).sort();
    // Fill options
    if (charNames.length){
      // Clear existing options except first
      while (el.options.length > 1) el.remove(1);
      charNames.forEach(name=>{
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        el.appendChild(opt);
      });
    }

    // If v2.0 already initialized TomSelect, let it own the options — don't overwrite.
    // Only merge if we have new names AND v2.0 has nothing yet.
    if (el.tomselect){
      const ts = el.tomselect;
      const existing = Object.keys(ts.options || {}).filter(k => k !== '').length;
      if (existing === 0 && charNames.length){
        ts.addOptions(charNames.map(n => ({value:n, text:n})));
        ts.refreshOptions(false);
      }
      return;
    }
    if (await waitForTomSelect()){
      try{
        new TomSelect(el, {
          create: false,
          allowEmptyOption: true,
          placeholder: '🔍 พิมพ์ชื่อตัวละคร...',
          maxOptions: 500,
          searchField: ['text', 'value'],
          score: function(search){
            const base = this.getScoreFunction(search);
            return (item)=>{
              let s = base(item);
              const q = (search||'').toLowerCase().trim();
              const t = (item.text||'').toLowerCase();
              if (q && t.startsWith(q)) s += 1.0;
              return s;
            };
          },
          maxItems: 1,
          render: {
            option: (data, escape) => `<div class="px-2 py-1">${escape(data.text)}</div>`,
            item:   (data, escape) => `<div class="px-1">${escape(data.text)}</div>`
          }
        });
      }catch(e){ console.warn('TomSelect init failed for #charSelect', e); }
    }
  }

  // Hook normalizeByHeaders to ensure allowedChars is captured
  if (typeof window.normalizeByHeaders === 'function'){
    const _origNorm = window.normalizeByHeaders;
    window.normalizeByHeaders = function(rows){
      const out = _origNorm(rows) || [];
      // backfill allowedChars — ใช้ Map by ID แทน index เพราะ out ถูก .filter() มาแล้ว
      try{
        const idMap = new Map(out.map(j => [j.id, j]));
        rows.forEach(r => {
          const rawId = (r["ID"] ?? '').toString().trim();
          if (!rawId.startsWith(LINK_PREFIX)) return;
          const j = idMap.get(rawId);
          if (!j || j.allowedChars != null) return;
          j.allowedChars = (r["AllowedChars"] ?? r["AllowedChar"] ?? r["Allowed"] ?? "").toString().trim();
        });
      }catch(e){}
      return out;
    };
  }

  // 2) Share URL character support is now handled inside compressed state (?d=...)
// คง function ไว้เพื่อไม่ให้ flow เดิมพัง
function addCharToShareURL(){
  // no-op: buildShareURL() รุ่นใหม่รวม char ไว้ใน payload แล้ว
}

async function applyCharFromURL(){
  // รองรับทั้ง URL ใหม่แบบ compressed และ URL เก่าแบบ ?char=
  const compressed = (typeof parseCompressedStateFromURL === 'function')
    ? parseCompressedStateFromURL()
    : null;

  const charFromCompressed = compressed?.char || '';
  if (charFromCompressed){
    setCharSelectValue(charFromCompressed);
    return;
  }

  const params = new URLSearchParams(location.search);
  const char = params.get('char');
  if (char){
    setCharSelectValue(char);
  }
}

  // 3) Patch calculate to enforce fixed [ลิงก์] — ส่ง fixedCand เข้า Worker จริงๆ (3-combo)
  function patchCalculate(){
    if (typeof window.calculate !== 'function' || window.__calcPatched) return;
    window.__calcPatched = true;
    const _origCalc = window.calculate;

    window.calculate = async function(){
      // ถ้า jewels ยังไม่โหลด ให้ original จัดการ (จะ fetch เอง)
      if (!window.jewels || !Array.isArray(window.jewels)) {
        return _origCalc.apply(this, arguments);
      }

      const charEl = document.getElementById('charSelect');
      const charName = charEl
        ? ((charEl.tomselect ? charEl.tomselect.getValue() : charEl.value) || '').trim()
        : '';

      // ไม่ได้เลือกตัวละคร → ใช้ original calculate ปกติ
      if (!charName) return _origCalc.apply(this, arguments);

      // validate desired ขั้นต่ำก่อน
      const desired = (typeof window.getDesired === 'function') ? window.getDesired() : [];
      if (!desired || desired.length < (window.MIN_SELECTS || 4)){
        return _origCalc.apply(this, arguments);
      }
      const runId = beginCalcRun();

      // หาจี้ลิงก์ที่ตรงกับตัวละคร — ลอง allowedChars ใน main sheet ก่อน แล้ว fallback ไปใช้ map จาก gid=513976173
      let fixedLink = window.jewels.find(j =>
        isLinkId(j.id) &&
        String(j.allowedChars || j.AllowedChars || '').trim() === charName
      );
      if (!fixedLink && window.__charToLinkId && window.__charToLinkId[charName]){
        const linkId = window.__charToLinkId[charName];
        fixedLink = window.jewels.find(j => j.id === linkId);
      }
      if (!fixedLink){
        window.showToast(`ไม่พบจี้ [ลิงก์] สำหรับตัวละคร: ${charName}`, 3500, 'warn');
        return;
      }

      // Build candidate pool: จี้ลิงก์ถูกล็อกเสมอ ส่วนอีก 3 ช่องเคารพ darkOnly/filter ปัจจุบัน
      if (typeof window.computeJewelPool === 'function') window.jewelPool = window.computeJewelPool();
      const pool = (window.jewelPool && window.jewelPool.length) ? window.jewelPool : window.jewels;
      const unwanted = Array.isArray(window._chipUnwanted) ? window._chipUnwanted.slice() : [];
      const fixedCand = jewelToCandidate(fixedLink, desired, unwanted);
      const _limit = (window.SPEED_CFG && window.SPEED_CFG.FIXED_LINK_LIMIT) || 3000;
      const otherSource = pool.filter(j => j && j.id !== fixedLink.id && !isLinkId(j.id));
      const otherCand = buildCandidates(desired, otherSource, unwanted, _limit);

      if (otherCand.length < 3){
        window.showToast('จี้ที่ใช้คำนวณ (นอกจากจี้ลิงก์) มีไม่พอ 3 ชิ้น', 3500, 'warn');
        return;
      }

      let topK = parseInt((document.getElementById('topK')?.value || '').trim(), 10);
      if (isNaN(topK)) topK = DEFAULT_TOPK;
      if (topK < 3) topK = 3;
      if (topK > 50) topK = 50;

      const titleEl = document.getElementById('resultTitle');
      if(titleEl) titleEl.textContent = `💎 เซ็ตจี้ที่ดีที่สุด Top ${topK}`;
      document.getElementById('result').innerHTML = '';
      if (typeof window.showCalcOverlay === 'function') window.showCalcOverlay('กำลังค้นหาเซ็ตจี้ที่ดีที่สุด...');
      if (typeof window.__resetCalcETA === 'function') window.__resetCalcETA();
      if (typeof window.__startCalcCountdown === 'function') window.__startCalcCountdown(5);

      // ใช้ buildWorkerCode ที่เป็น single source of truth สำหรับทั้งสองเส้นทาง
      _fixedWorkerBlobUrl = URL.createObjectURL(new Blob([window.buildWorkerCode('3combo')],{type:'application/javascript'}));
      _fixedWorker = new Worker(_fixedWorkerBlobUrl);

      window.__etaState = { start: performance.now(), smoothSec: null };
      _fixedWorker.onmessage = function(e){
        if(runId !== _activeCalcRun) return;
        if (e.data.type === 'progress'){
  if (typeof window.__updateCalcETAFromProgress === 'function'){
    window.__updateCalcETAFromProgress(e.data.p);
  }
} else if (e.data.type === 'result'){
  if (typeof window.__completeCalcProgress === 'function'){
    window.__completeCalcProgress();
  }

  if (typeof window.renderResults === 'function') window.renderResults(e.data.best);

  setTimeout(()=>{
    if (typeof window.hideCalcOverlay === 'function') window.hideCalcOverlay();
    if (typeof window.hideLoading === 'function') window.hideLoading();
    cleanupFixedWorker();
  }, 300);
}
      };
      _fixedWorker.onerror = function(err){
        if(runId !== _activeCalcRun) return;
        console.error('fixed worker error:', err);
        cleanupFixedWorker();
        finishCalcWithError('เกิดข้อผิดพลาดระหว่างคำนวณ: ' + (err?.message || 'ไม่ทราบสาเหตุ'));
      };
      _fixedWorker.postMessage({ desired, cand: otherCand, fixed: fixedCand, topK });
    };
  }

  // 4) Init on DOM ready
  document.addEventListener('DOMContentLoaded', async ()=>{
    // Character options are loaded by v2.0 Character select below.
    addCharToShareURL();
    await applyCharFromURL();
    patchCalculate();
  });
})();
