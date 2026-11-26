const _dk=(e,k)=>{const h=e.split('').reverse().join('');let r='';for(let i=0;i<h.length;i+=2)r+=String.fromCharCode(parseInt(h.slice(i,i+2),16)^k.charCodeAt((i/2)%k.length));return r;};
const SHEET_ID = _dk('7110d54204f1927075b0c4e391d643a56455a58020e782a1061137d3315791a0112255a05166e383e61286a5','k9x#mP2w');
const GVIZ_JSONP_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

const MAX_SELECTS = 14;
const MIN_SELECTS = 4;
const DEFAULT_TOPK = 10;
const LINK_PREFIX = "[ลิงก์]";

let jewels = [];
let abilities = new Map();   // ชื่อสกิล → ข้อมูลจากแท็บ Abilities (ดู js/data-model.js)
let abilityTriggers = [];    // รายการการแสดงผลจากแท็บ Triggers (เรียงตาม order)
let jewelPool = [];
let tomSelects = [];
let worker = null; // Web Worker ของการค้นหาครั้งล่าสุด (สร้างใหม่ทุกครั้ง)

const overlay = document.getElementById('overlay');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const calcBtn = document.getElementById('calcBtn');
const calcBtn2 = document.getElementById('calcBtn2');
const topKInput = document.getElementById('topK');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const toastIcon = document.getElementById('toastIcon');
const toastUndoBtn = document.getElementById('toastUndoBtn');
const toastCloseBtn = document.getElementById('toastCloseBtn');
const resultTitle = document.getElementById('resultTitle');
const minHint = document.getElementById('minHint');
const selectedProgress = document.getElementById('selectedProgress');
const selectedProgressFill = selectedProgress?.querySelector('.sel-progress__fill');
const selectedProgressLabel = selectedProgress?.querySelector('.sel-progress__label');


const OWNED_JEWELS_STORAGE_KEY = 'ownedJewelIds_v1';
function readOwnedJewelIds(){try{const raw=localStorage.getItem(OWNED_JEWELS_STORAGE_KEY);const parsed=raw?JSON.parse(raw):[];if(!Array.isArray(parsed)) return new Set();return new Set(parsed.map(v=>String(v||'').trim()).filter(Boolean));}catch(_){return new Set();}}
function saveOwnedJewelIds(){try{localStorage.setItem(OWNED_JEWELS_STORAGE_KEY, JSON.stringify(Array.from(window._ownedJewelIds || [])));}catch(_){}}
function getOwnedCount(){return (window._ownedJewelIds && typeof window._ownedJewelIds.size==='number') ? window._ownedJewelIds.size : 0;}
window._hasSearchedResults = false;
function computeResultOwnership(result){const ids=Array.isArray(result?.ids)?result.ids:[];const ownedIds=ids.filter(id=>window._ownedJewelIds?.has(id));const missingIds=ids.filter(id=>!window._ownedJewelIds?.has(id));return {ownedIds, missingIds, missingCount: missingIds.length, isBuildable: missingIds.length===0, isMissingOnly1: missingIds.length===1};}
function filterResultsByInventory(results){const mode=window._inventoryResultFilterMode||'all';const list=Array.isArray(results)?results:[];if(mode==='buildable') return list.filter(r=>computeResultOwnership(r).isBuildable);if(mode==='missing1') return list.filter(r=>computeResultOwnership(r).isMissingOnly1);return list;}
function syncInventoryResultFilterUI(){const wrap=document.getElementById('inventoryResultFilters'); if(!wrap) return; wrap.querySelectorAll('.inventory-result-filter').forEach(btn=>btn.classList.toggle('active', btn.dataset.filter === (window._inventoryResultFilterMode||'all')));}
function updateInventoryResultFiltersVisibility(){
  const wrap = document.getElementById('inventoryResultFilters');
  if(!wrap) return;

  const hasSearched = window._hasSearchedResults === true;
  const hasResults = Array.isArray(window._latestComputedResults) && window._latestComputedResults.length > 0;
  const hasOwned = getOwnedCount() > 0;

  wrap.hidden = !(hasSearched && hasResults && hasOwned);
}
function updateInventoryMenuMeta(){const meta=document.getElementById('menuInventoryMeta'); if(meta) meta.textContent=`${getOwnedCount()} ชิ้น`;}
function updateInventoryCountUI(filteredCount){
  const count = getOwnedCount();
  const countEl = document.getElementById('inventoryCount');
  const allMeta = document.getElementById('inventoryAllMeta');

  if(countEl) countEl.textContent = `(${count})`;
  if(allMeta) allMeta.textContent = `${filteredCount} รายการ`;
  updateInventoryMenuMeta();
}

function getInventoryVisibleNames(){
  const query = (document.getElementById('inventorySearchInput')?.value || '').trim().toLowerCase();

  const names = Array.from(
    new Set((jewels || []).map(j => (j.id || '').trim()).filter(Boolean))
  ).sort((a,b)=>a.localeCompare(b,'th'));

  return query
    ? names.filter(name => name.toLowerCase().includes(query))
    : names;
}

function makeInventoryChip(name, owned){
  return `
    <button
      type="button"
      class="chip inventory-chip${owned ? ' is-owned' : ''}"
      data-jewel-id="${escapeHtmlAttr(name)}"
      aria-pressed="${owned ? 'true' : 'false'}"
      aria-label="${owned ? `เอา ${escapeHtmlAttr(name)} ออกจากคลัง` : `เพิ่ม ${escapeHtmlAttr(name)} เข้าคลัง`}"
      title="${owned ? 'กดเพื่อลบออกจากคลัง' : 'กดเพื่อเพิ่มเข้าคลัง'}"
    >
      <span class="inventory-chip__label">${escapeHtmlText(name)}</span>
      ${owned ? '<span class="chip-x" aria-hidden="true">×</span>' : ''}
    </button>
  `;
}
function renderInventoryLists(){
  const allWrap = document.getElementById('inventoryAllList');
  if(!allWrap) return;

  const visibleNames = getInventoryVisibleNames();

  allWrap.innerHTML = visibleNames.length
    ? visibleNames.map(name => makeInventoryChip(name, window._ownedJewelIds?.has(name))).join('')
    : '<div class="inventory-empty">ไม่พบจี้ที่ค้นหา</div>';

  updateInventoryCountUI(visibleNames.length);
}

function refreshResultsForInventory(){
  syncInventoryResultFilterUI();
  updateInventoryResultFiltersVisibility();

  if(
    window._hasSearchedResults === true &&
    Array.isArray(window._latestComputedResults) &&
    window._latestComputedResults.length &&
    typeof window.renderResults === 'function'
  ){
    window.renderResults(window._latestComputedResults, {skipTracking:true});
  }
}

function updateInventoryChipState(name){
  const list = document.getElementById('inventoryAllList');
  if(!list || typeof CSS === 'undefined' || !CSS.escape) return false;
  const chip = list.querySelector('.inventory-chip[data-jewel-id="' + CSS.escape(name) + '"]');
  if(!chip) return false;
  const owned = !!(window._ownedJewelIds && window._ownedJewelIds.has(name));
  chip.classList.toggle('is-owned', owned);
  chip.setAttribute('aria-pressed', owned ? 'true' : 'false');
  chip.setAttribute('aria-label', owned ? ('เอา ' + name + ' ออกจากคลัง') : ('เพิ่ม ' + name + ' เข้าคลัง'));
  chip.setAttribute('title', owned ? 'กดเพื่อลบออกจากคลัง' : 'กดเพื่อเพิ่มเข้าคลัง');
  let x = chip.querySelector('.chip-x');
  if(owned && !x){
    x = document.createElement('span'); x.className = 'chip-x'; x.setAttribute('aria-hidden','true'); x.textContent = '×';
    chip.appendChild(x);
  } else if(!owned && x){
    x.remove();
  }
  return true;
}

// Toggling one jewel used to re-render the whole 1042-chip list; update just the
// affected chip (and the counter) when it is already in the DOM, and fall back
// to a full render only when it isn't (e.g. filtered out by the search box).
function refreshInventoryChip(name){
  if(updateInventoryChipState(name)){
    const list = document.getElementById('inventoryAllList');
    updateInventoryCountUI(list ? list.querySelectorAll('.inventory-chip').length : getOwnedCount());
  } else {
    renderInventoryLists();
  }
}

function toggleOwnedJewel(id){
  const name = String(id || '').trim();
  if(!name) return;

  const hadBefore = window._ownedJewelIds.has(name);

  if(hadBefore){
    window._ownedJewelIds.delete(name);
    saveOwnedJewelIds();
    refreshInventoryChip(name);
    refreshResultsForInventory();

    showToast(`ลบจี้ "${name}" ออกจากคลังของฉันแล้ว`, 5000, 'info', {
      actionLabel: 'Undo',
      onAction: () => {
        window._ownedJewelIds.add(name);
        saveOwnedJewelIds();
        refreshInventoryChip(name);
        refreshResultsForInventory();
        showToast(`กู้คืนจี้ "${name}" กลับเข้าคลังแล้ว`, 2200, 'success');
      }
    });
    return;
  }

  window._ownedJewelIds.add(name);
  saveOwnedJewelIds();
  refreshInventoryChip(name);
  refreshResultsForInventory();
}
function showLoading(msg){
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden','false');
  overlay.setAttribute('aria-busy','true');
  setProgress(0, msg || 'กำลังโหลดข้อมูล...');

  const setBusy = (btn)=>{
    if(!btn) return;
    if(!btn.dataset.original){ btn.dataset.original = btn.innerHTML; }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> ค้นหาเซ็ตจี้';
    btn.setAttribute('aria-live','assertive');
  };
  setBusy(calcBtn);
  setBusy(calcBtn2);
}

function hideLoading(){
  stopProgressSimulation(false);
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden','true');
  overlay.setAttribute('aria-busy','false');
  const unsetBusy = (btn)=>{
    if(!btn) return;
    btn.disabled = false;
    if(btn.dataset.original){ btn.innerHTML = btn.dataset.original; }
    btn.removeAttribute('aria-live');
  };
  unsetBusy(calcBtn);
  unsetBusy(calcBtn2);
  updateCalcAvailability();
}
    
function setProgress(p, msg, options = {}){
  progressBar.style.width = Math.max(0, Math.min(100, p)) + '%';

  if(!msg) return;

  if(options.trustedHtml === true){
    progressText.innerHTML = msg;
  }else{
    progressText.textContent = msg;
  }
}
/* ===== ETA helpers for progress ===== */
let __etaState = {
  start: 0,
  deadline: 0,
  lastPct: 0,
  lastLabelSec: null,
  timer: null,
  locked: false
};

let __progressSimTimer = null;
let __progressSimValue = 0;

function startProgressSimulation(start = 12, max = 92, label = 'กำลังโหลดข้อมูลอัปเดตล่าสุด...'){
  stopProgressSimulation(false);
  __progressSimValue = start;
  setProgress(__progressSimValue, label);

  __progressSimTimer = setInterval(()=>{
    if(__progressSimValue >= max) return;
    const remaining = max - __progressSimValue;
    const step = remaining > 30 ? 4 : remaining > 15 ? 2 : 1;
    __progressSimValue = Math.min(max, __progressSimValue + step);
    setProgress(__progressSimValue, label);
  }, 220);
}

function stopProgressSimulation(complete = true, label = 'โหลดข้อมูลสำเร็จ'){
  if(__progressSimTimer){
    clearInterval(__progressSimTimer);
    __progressSimTimer = null;
  }

  if(complete){
    __progressSimValue = 100;
    setProgress(100, label);
  }
}

function __formatETA(sec){
  sec = Math.max(0, Math.round(sec)); // ปัดเป็นวินาที
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} ชม. ${m} นาที ${s} วินาที`;
  if (m > 0) return `${m} นาที ${s} วินาที`;
  return `${s} วินาที`;
}

function __getEtaMessage(sec, isOvertime = false){
  if (isOvertime){
    return `กำลังประมวลผลต่อ…<br>อาจใช้เวลานานกว่าปกติเล็กน้อย`;
  }

  sec = Math.max(1, Math.ceil(sec));
  if (sec <= 1) return 'ใกล้เสร็จแล้ว…';

  return `กำลังประมวลผล…<br>เหลือประมาณ ${__formatETA(sec)}`;
}

function __clampPct(pct, min = 0, max = 100){
  return Math.max(min, Math.min(max, Number(pct) || 0));
}

function __paintCalcProgress(msg){
  setCalcProgress(
    Math.round(__etaState.visualPct || __etaState.lastPct || 10),
    msg
  );
}

function __resetCalcETA(){
  if (__etaState.timer){
    clearInterval(__etaState.timer);
  }

  __etaState = {
    start: performance.now(),
    deadline: 0,
    initialSec: 0,

    // progress จริงจาก worker
    lastPct: 0,

    // progress ที่ user เห็น ให้เดินเองได้
    visualPct: 0,

    lastLabelSec: null,
    timer: null,
    isOvertime: false
  };
}

function __startCalcCountdown(initialSec = 8){
  if (__etaState.timer){
    clearInterval(__etaState.timer);
  }

  const now = performance.now();
  const safeInitialSec = Math.max(3, Math.min(20, Math.ceil(initialSec)));

  __etaState.start = now;
  __etaState.deadline = now + safeInitialSec * 1000;
  __etaState.initialSec = safeInitialSec;
  __etaState.lastPct = 5;
  __etaState.visualPct = 5;
  __etaState.lastLabelSec = safeInitialSec;
  __etaState.isOvertime = false;

  __paintCalcProgress(__getEtaMessage(safeInitialSec));

  __etaState.timer = setInterval(()=>{
    const now = performance.now();
    const remainingSec = Math.ceil((__etaState.deadline - now) / 1000);

    if (remainingSec > 0){
      // ช่วง countdown: ให้หลอดค่อย ๆ วิ่งจาก 10% ไปประมาณ 82%
      const elapsedMs = now - __etaState.start;
      const totalMs = Math.max(1, __etaState.initialSec * 1000);
      const ratio = __clampPct(elapsedMs / totalMs, 0, 1);

      const countdownTargetPct = 1 + ratio * 59; // 1 -> 60
      __etaState.visualPct = Math.max(
        __etaState.visualPct || 1,
        __etaState.lastPct || 1,
        countdownTargetPct
      );

      if (remainingSec !== __etaState.lastLabelSec){
        __etaState.lastLabelSec = remainingSec;
      }

      __paintCalcProgress(__getEtaMessage(remainingSec));
      return;
    }

    // ถ้าเกินเวลาประมาณแล้ว ให้เปลี่ยนเป็น overtime
    if (!__etaState.isOvertime){
      __etaState.isOvertime = true;
      __etaState.lastLabelSec = 0;
      __etaState.visualPct = Math.max(__etaState.visualPct || 0, __etaState.lastPct || 0, 60);
    }

    // ช่วง overtime: หลอดยังต้องขยับต่อ แต่ค่อย ๆ ช้าลง และไม่เต็ม 100 จนกว่าจะเสร็จจริง
    const overtimeMax = 98; // cap progress ตอน overtime ไว้ที่ 98% เพื่อกันไม่ให้ดูเหมือนค้างตอน 99%
    const current = __etaState.visualPct || 70;
    const remainingToMax = overtimeMax - current;

    if (remainingToMax > 0.15){
      const step = Math.max(0.02, remainingToMax * 0.02);
      __etaState.visualPct = Math.min(overtimeMax, current + step);
    }

    __paintCalcProgress(__getEtaMessage(0, true));
  }, 200);
}

function __stopCalcCountdown(){
  if (__etaState.timer){
    clearInterval(__etaState.timer);
    __etaState.timer = null;
  }
}

function __updateCalcETAFromProgress(rawPct){
  const workerPct = __clampPct(rawPct, 0, 99);

  // worker progress ช่วยดันหลอดไปข้างหน้าได้ แต่ห้ามทำให้หลอดถอยหลัง
  __etaState.lastPct = Math.max(__etaState.lastPct || 0, workerPct);

  const now = performance.now();
  const remainingSec = Math.ceil((__etaState.deadline - now) / 1000);

  if (__etaState.isOvertime || remainingSec <= 0){
    __etaState.isOvertime = true;

    // ถ้า worker ส่ง progress สูงกว่า visual ก็ให้ดันขึ้น แต่ยัง cap ที่ 96
    __etaState.visualPct = Math.max(
      __etaState.visualPct || 60,
      Math.min(99, __etaState.lastPct || 60)
    );

    __paintCalcProgress(__getEtaMessage(0, true));
    return;
  }

  // ก่อน overtime: ใช้ค่าที่มากที่สุดระหว่าง visual timer กับ worker จริง
  __etaState.visualPct = Math.max(
    __etaState.visualPct || 1,
    Math.min(99, __etaState.lastPct || 1)
  );

  __paintCalcProgress(__getEtaMessage(remainingSec));
}

function __completeCalcProgress(){
  __stopCalcCountdown();
  setCalcProgress(100, 'จัดเซ็ตเสร็จแล้ว');
}

window.__resetCalcETA = __resetCalcETA;
window.__startCalcCountdown = __startCalcCountdown;
window.__stopCalcCountdown = __stopCalcCountdown;
window.__updateCalcETAFromProgress = __updateCalcETAFromProgress;
window.__completeCalcProgress = __completeCalcProgress;

let _toastTimers = [];
let _toastUndoHandler = null;

function getToastIconByKind(kind){
  if(kind === 'success') return '✓';
  if(kind === 'warn') return '!';
  if(kind === 'error') return '!';
  return 'i';
}

function clearToastTimers(){
  _toastTimers.forEach(t => clearTimeout(t));
  _toastTimers = [];
}

function hideToast(immediate = false){
  clearToastTimers();

  if(immediate){
    toast.classList.remove('show','hide','toast--success','toast--info','toast--warn','toast--error');
    toast.hidden = true;
    toastUndoBtn.hidden = true;
    toastCloseBtn.hidden = false;
    _toastUndoHandler = null;
    return;
  }

  toast.classList.add('hide');
  _toastTimers.push(setTimeout(()=>{
    toast.classList.remove('show','hide','toast--success','toast--info','toast--warn','toast--error');
    toast.hidden = true;
    toastUndoBtn.hidden = true;
    toastCloseBtn.hidden = false;
    _toastUndoHandler = null;
  }, 220));
}

function showToast(text, ms = 2600, kind = 'info', options = {}){
  if(typeof options !== 'object' || options === null) options = {};

  const {
    actionLabel = '',
    onAction = null,
    closable = true
  } = options;

  clearToastTimers();

  toast.hidden = false;
  toastMessage.textContent = text || '';
  toastIcon.textContent = getToastIconByKind(kind);

  toast.classList.remove('hide','toast--success','toast--info','toast--warn','toast--error');
  if(kind === 'error') toast.classList.add('toast--error');
  else if(kind === 'warn') toast.classList.add('toast--warn');
  else if(kind === 'success') toast.classList.add('toast--success');
  else toast.classList.add('toast--info');

  if(actionLabel && typeof onAction === 'function'){
    _toastUndoHandler = onAction;
    toastUndoBtn.textContent = actionLabel;
    toastUndoBtn.hidden = false;
  }else{
    _toastUndoHandler = null;
    toastUndoBtn.hidden = true;
  }

  toastCloseBtn.hidden = !closable;
  toast.classList.add('show');

  if (text && text.includes('โหลดข้อมูลอัปเดตล่าสุดเรียบร้อย')) {
    document.dispatchEvent(new CustomEvent('sheetLoadSuccessToastShown'));
  }

  const exitDelay = Math.max(0, ms - 220);
  _toastTimers.push(setTimeout(()=> toast.classList.add('hide'), exitDelay));
  _toastTimers.push(setTimeout(()=> hideToast(true), ms));
}

toastUndoBtn?.addEventListener('click', ()=>{
  const handler = _toastUndoHandler;
  hideToast(true);
  if(typeof handler === 'function'){
    handler();
  }
});

toastCloseBtn?.addEventListener('click', ()=>{
  hideToast();
});
function showErrorBanner(text){
  let el = document.getElementById('errorBanner');
  if (!el){
    el = document.createElement('div');
    el.id = 'errorBanner';
    el.className = 'error-banner';
    el.innerHTML = `<span class="error-banner__text"></span><button type="button" class="error-banner__close" aria-label="ปิด">×</button>`;
    el.querySelector('.error-banner__close').addEventListener('click', ()=> el.remove());
    document.querySelector('main')?.prepend(el);
  }
  el.querySelector('.error-banner__text').textContent = text;
}


function updateCalcAvailability(){
  const count = getDesired().length;
  const charEl = document.getElementById('charSelect');
  const charName = charEl ? ((charEl.tomselect ? charEl.tomselect.getValue() : charEl.value) || '').trim() : '';
  const waitingCharSheet = charName && !window.__charSheetReady;
  // ปุ่มพร้อม/ไม่พร้อม + ข้อความแนะนำ
  if (count < MIN_SELECTS){
    calcBtn.disabled = true;
    calcBtn2.disabled = true;
    minHint.classList.remove('hint--ok');
    minHint.classList.add('hint--error');
    minHint.innerHTML = `<span class="dot"></span><span>เลือกอีก ${MIN_SELECTS - count} ความสามารถเพื่อเริ่มค้นหา (ขั้นต่ำ ${MIN_SELECTS} สกิล)</span>`;
  }else if(waitingCharSheet){
    calcBtn.disabled = true;
    calcBtn2.disabled = true;
    minHint.classList.remove('hint--error');
    minHint.classList.add('hint--ok');
    minHint.innerHTML = `<span class="dot"></span><span>กำลังโหลดข้อมูลตัวละคร…</span>`;
  }else{
    calcBtn.disabled = false;
    calcBtn2.disabled = false;
    minHint.classList.remove('hint--error');
    minHint.classList.add('hint--ok');
    minHint.innerHTML = `<span class="dot"></span><span>พร้อมค้นหาเซ็ตจี้แล้ว</span>`;
  }
  // ตัวนับ + progress bar
  if (selectedProgress){
    const pct = Math.min(100, Math.round((count / MAX_SELECTS) * 100));
    if (selectedProgressFill) selectedProgressFill.style.width = pct + '%';
    if (selectedProgressLabel) selectedProgressLabel.textContent = `${count}/${MAX_SELECTS}`;
    selectedProgress.setAttribute('aria-valuenow', String(count));
    selectedProgress.classList.toggle('is-ready', count >= MIN_SELECTS);
  }
}


// chip-picker เป็นเจ้าของ state — ไม่สร้าง TomSelect DOM อีกต่อไป
async function makeTomSelects(options=[]){
  tomSelects = [];
  window.tomSelects = tomSelects;
  if (typeof window.buildChipPicker === 'function'){
    window.buildChipPicker(options);
  }
  updateCalcAvailability();
}

// getDesired อ่านจาก chip state โดยตรง
function getDesired(){
  return Array.isArray(window._chipSelected) ? window._chipSelected.slice() : [];
}

// compat stubs — ไม่มี TomSelect DOM แล้ว
function getSelectValueAt(i){ return (window._chipSelected || [])[i] || ''; }

function escapeHtmlText(s){
  return String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function escapeHtmlAttr(s){
  return escapeHtmlText(s).replace(/\n/g, '&#10;');
}

function fetchGVizJSONP(){
  const MAX_ATTEMPTS = 3;
  const attempt = (n)=> _fetchGVizJSONPOnce().catch(err=>{
    if(n >= MAX_ATTEMPTS) throw err;
    const delay = 400 * Math.pow(2, n-1);
    return new Promise(r=> setTimeout(r, delay)).then(()=> attempt(n+1));
  });
  return attempt(1);
}
function _fetchGVizJSONPOnce(){
  return new Promise((resolve, reject)=>{
    const oldGoogle = window.google;
    window.google = window.google || {};
    window.google.visualization = window.google.visualization || {};
    let done = false;

    window.google.visualization.Query = {
      setResponse: (payload)=>{
        try{
          if(!payload || !payload.table) throw new Error('GViz payload ว่าง');
          const { jewels: data, problems } = parseSheetTable(payload.table);
          if(problems.length) console.warn(`[sheet] พบ ${problems.length} จุดที่ควรตรวจในชีต:\n` + problems.join('\n'));
          done = true;
          resolve(data);
        }catch(err){
          done = true;
          reject(err);
        }finally{
          cleanup();
        }
      }
    };

    function cleanup(){
      if(script && script.parentNode) script.parentNode.removeChild(script);
      if(oldGoogle !== undefined) window.google = oldGoogle;
    }

    const script = document.createElement('script');
    script.src = GVIZ_JSONP_URL + '&rand=' + Date.now();
    script.onerror = ()=>{ if(!done){ done=true; cleanup(); reject(new Error('โหลดสคริปต์ GViz ไม่ได้')); } };
    document.head.appendChild(script);

    setTimeout(()=>{ if(!done){ done=true; cleanup(); reject(new Error('GViz timeout')); } }, 15000);
  });
}

function isLinkId(id){
  return typeof id === 'string' && id.trim().startsWith(LINK_PREFIX);
}

function computeJewelPool(){
  const types = readFilterState().jewelTypes;
  if(!isAllJewelTypes(types)){
    return jewels.filter(j => types.includes(j.type));
  }
  return jewels.slice();
}


let _activeCalcRun = 0;

function stopWorker(){
  if(worker){ worker.terminate(); worker = null; }
}

/** Start a new search run: stops any running worker so late results are ignored. */
function beginCalcRun(){
  _activeCalcRun++;
  stopWorker();
  return _activeCalcRun;
}

function finishCalcWithError(message){
  hideCalcOverlay();
  hideLoading();
  showErrorBanner(message);
}

/** Run the combination search (js/search-worker.js) and render the result. */
function startSearchWorker(job, runId){
  worker = new Worker('js/search-worker.js');
  worker.onmessage = (e)=>{
    if(runId !== _activeCalcRun) return;
    const msg = e.data;
    if(msg.type === 'progress'){
      __updateCalcETAFromProgress(msg.p);
    }else if(msg.type === 'result'){
      try{
        __completeCalcProgress();
        renderResults(msg.best);
        setTimeout(()=>hideLoading(), 180);
      }catch(err){
        console.error('renderResults error:', err);
        showErrorBanner('เกิดข้อผิดพลาดในการแสดงผลลัพธ์: ' + (err?.message || err));
      }finally{
        hideCalcOverlay();
        hideLoading();
        stopWorker();
      }
    }
  };
  worker.onerror = (err)=>{
    if(runId !== _activeCalcRun) return;
    console.error('worker error:', err);
    stopWorker();
    finishCalcWithError('เกิดข้อผิดพลาดระหว่างคำนวณ: ' + (err?.message || 'ไม่ทราบสาเหตุ'));
  };
  worker.postMessage(job);
}

function scrollToResultSection(){
  if (window.innerWidth >= 768) return;

  const resultEl = document.getElementById('resultTitle');
  const targetEl = resultEl?.closest('section') || resultEl;
  if (!targetEl) return;

  requestAnimationFrame(()=>{
    const headerHeight = document.querySelector('header')?.offsetHeight || 50;
    const top = targetEl.getBoundingClientRect().top + window.scrollY - headerHeight - 12;
    window.scrollTo({ top, behavior: 'smooth' });
  });
}


/* ====== คำนวณ ====== */

/** ข้อมูลสกิลจากแท็บ Abilities (undefined = ใช้ค่าเริ่มต้น) */
const abilityOf = (name)=> abilities.get(name);

/** จี้ [ลิงก์] ของตัวละคร: ดูคอลัมน์ AllowedChars ในชีตหลักก่อน แล้วค่อยใช้ชีตตัวละคร */
function findLinkJewelForChar(charName){
  if(!charName) return null;
  const byColumn = jewels.find(j => isLinkId(j.id) && String(j.allowedChars || '').trim() === charName);
  if(byColumn) return byColumn;
  const linkId = window.__charToLinkId?.[charName];
  return linkId ? (jewels.find(j => j.id === linkId) || null) : null;
}

function readTopK(){
  let topK = parseInt((topKInput?.value || '').trim(),10);
  if(isNaN(topK)) topK = DEFAULT_TOPK;
  if(topK < 3) topK = 3;
  if(topK > 50) topK = 50;
  if(topKInput) topKInput.value = String(topK);
  return topK;
}

async function calculate(){
  const runId = beginCalcRun();
  const desired = getDesired();
  if(!desired || desired.length < MIN_SELECTS){
    showToast(`กรุณาเลือกความสามารถอย่างน้อย ${MIN_SELECTS} อย่างก่อน`, 3000, 'warn');
    return;
  }

  scrollToResultSection();

  try{
    clearPinnedResults();
    if (!jewels || jewels.length === 0){
      showLoading('กำลังโหลดข้อมูลอัปเดตล่าสุด');
      startProgressSimulation(5, 92, 'กำลังโหลดข้อมูลอัปเดตล่าสุด...');
      jewels = await fetchGVizJSONP();
      stopProgressSimulation(true, 'โหลดข้อมูลสำเร็จ');
    }
    if(runId !== _activeCalcRun) return;

    jewelPool = computeJewelPool();
    const unwanted = Array.isArray(window._chipUnwanted) ? window._chipUnwanted.slice() : [];
    const charName = getCharSelectValue();
    let job;

    if(charName){
      // เลือกตัวละคร → ล็อกจี้ [ลิงก์] ของตัวละครนั้น 1 ช่อง แล้วหาอีก 3 ช่องจากจี้ที่ไม่ใช่ [ลิงก์]
      const fixedLink = findLinkJewelForChar(charName);
      if(!fixedLink){
        showToast(`ไม่พบจี้ [ลิงก์] สำหรับตัวละคร: ${charName}`, 3500, 'warn');
        return;
      }
      const others = compatibleWith(fixedLink, jewelPool.filter(j => !isLinkId(j.id)), abilityOf);
      const cand = buildCandidates(desired, others, unwanted, SPEED_CFG.FIXED_LINK_LIMIT, abilityOf)
        .concat(buildFillerCandidates(desired, others, unwanted, SPEED_CFG.FILLER_LIMIT, abilityOf));
      if(cand.length < 3){
        showToast('จี้ที่ใช้คำนวณ (นอกจากจี้ลิงก์) มีไม่พอ 3 ชิ้น', 3500, 'warn');
        return;
      }
      job = { desired, cand, fixed: jewelToCandidate(fixedLink, desired, unwanted, abilityOf) };
    }else{
      // ไม่เลือกตัวละคร → ตัดจี้ [ลิงก์] ทั้งหมดออก
      jewelPool = jewelPool.filter(j => !isLinkId(j.id));
      if(jewelPool.length < 4){
        const types = readFilterState().jewelTypes;
        const filterMsg = isAllJewelTypes(types) ? '' : `ภายใต้ประเภทจี้ ${jewelTypesLabel(types)}`;
        showToast(`จี้ที่ใช้คำนวณมีไม่พอ 4 ชิ้น ${filterMsg ? '('+filterMsg+')' : ''}`, 3500, 'warn');
        return;
      }
      const cand = buildCandidates(desired, jewelPool, unwanted, SPEED_CFG.CANDIDATE_LIMIT, abilityOf);
      if(cand.length < 4){
        showToast("จี้ที่เข้าข่ายน้อยเกินไปสำหรับเงื่อนไขที่ตั้งไว้", 3500, 'warn');
        return;
      }
      job = { desired, cand };
    }

    const topK = readTopK();
    if(resultTitle) resultTitle.textContent = `💎 เซ็ตจี้ที่ดีที่สุด Top ${topK}`;
    document.getElementById('result').innerHTML = '';
    showCalcOverlay('กำลังค้นหาเซ็ตจี้ที่ดีที่สุด...');
    __resetCalcETA();
    __startCalcCountdown(5);

    startSearchWorker({ ...job, topK }, runId);
    window._hasSearchedResults = true;
  }catch(err){
    hideLoading();
    hideCalcOverlay();
    showErrorBanner("เกิดข้อผิดพลาดในการดึง/ประมวลผลข้อมูล: " + (err?.message || err));
  }
}

function restoreEmptyState(){
  const container = document.getElementById('result');
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state" id="resultEmptyState">
      <div class="empty-state__icon">✨</div>
      <div class="empty-state__title">ยังไม่มีผลลัพธ์</div>
      <div class="empty-state__msg">เลือกความสามารถอย่างน้อย ${MIN_SELECTS} อย่าง แล้วกด "ค้นหาเซ็ตจี้"</div>

    </div>`;
  hideDonateCard();
  hideDonateSticky();
}

function invalidateResultsForCriteriaChange(){
  restoreEmptyState();
  hideDonateCard();
  hideDonateSticky();
  if(resultTitle) resultTitle.textContent = '💎 เซ็ตจี้ที่ดีที่สุด';
  ['shareBtn','shareBtn2'].forEach(id=>{ const b=document.getElementById(id); if(b) b.disabled=true; });
  _currentResultSnapshots.clear();
  _pinnedResults.clear();
  renderCompareTray();
}

function clearPinnedResults(){
  _pinnedResults.clear();
  document.querySelectorAll('.pin-result-btn.is-active').forEach(btn=>btn.classList.remove('is-active'));
  renderCompareTray();
}

function showCalcOverlay(msg){
  const ov = document.getElementById('resultLocalOverlay');
  const tx = document.getElementById('progressTextLocal');
  const bar = document.getElementById('progressBarLocal');
  if (bar){
    // reset (disable transition briefly so it snaps to 0)
    const prev = bar.style.transition;
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth; // force reflow
    bar.style.transition = prev || '';
  }
  if (tx) tx.innerHTML = (msg || 'กำลังค้นหา…').replace(/\n/g,'<br>');
  if (ov){ ov.style.display = 'flex'; ov.classList.add('show'); ov.setAttribute('aria-hidden','false'); }
}
function cancelCalculation(){
  // Stop any running worker and invalidate late results, then reset the view.
  beginCalcRun();
  hideCalcOverlay();
  hideLoading();
  restoreEmptyState();
  if(resultTitle) resultTitle.textContent = '💎 เซ็ตจี้ที่ดีที่สุด';
  ['shareBtn','shareBtn2'].forEach(id=>{ const b=document.getElementById(id); if(b) b.disabled=true; });
  if(typeof showToast === 'function') showToast('ยกเลิกการค้นหาแล้ว', 2000, 'info');
}
window.cancelCalculation = cancelCalculation;
document.getElementById('calcCancelBtn')?.addEventListener('click', cancelCalculation);

function hideCalcOverlay(){
  __stopCalcCountdown();

  const ov = document.getElementById('resultLocalOverlay');
  if (ov){
    ov.style.display = 'none';
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden','true');
  }
}
function setCalcProgress(pct, msg){
  const bar = document.getElementById('progressBarLocal');
  const tx = document.getElementById('progressTextLocal');
  if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (tx && msg) tx.innerHTML = msg; // allow <br>
}

let _lastDataLoadedAt = null;
let _currentResultSnapshots = new Map();
let _pinnedResults = new Map();

function createResultSnapshot({rank, result, group, notList, extra, extraUnwanted, total, matchedCount}){
  const names = group.map(j=>j?.id).filter(Boolean);
  return {
    key: (typeof makeResultKey === 'function') ? makeResultKey(names) : names.slice().sort().join('|'),
    rank,
    names,
    score: total,
    matchedCount,
    missing: notList.slice(),
    extra: extra.slice(),
    unwanted: extraUnwanted.slice(),
    filter: readFilterState(),
    createdAt: new Date().toISOString()
  };
}

function formatResultSummary(snapshot){
  const lines = [
    `เซ็ตจี้ ${snapshot.rank ? 'อันดับ ' + snapshot.rank : ''}`.trim(),
    `จี้: ${(snapshot.names || []).join(', ')}`,
    `ตรงเป๊ะ: ${snapshot.matchedCount ?? 0}`,
    `หายไป: ${(snapshot.missing || []).length ? snapshot.missing.join(', ') : 'ไม่มี'}`,
    `ไม่ต้องการ: ${(snapshot.unwanted || []).length ? snapshot.unwanted.join(', ') : 'ไม่มี'}`,
    `ได้เพิ่ม: ${(snapshot.extra || []).length ? snapshot.extra.join(', ') : 'ไม่มี'}`,
    `คะแนนความเทพ: ${snapshot.score} คะแนน`
  ];
  return lines.join('\n');
}

function buildGuidanceItems({shownCount, topK, isEmpty=false}){
  const items = [];
  const selectedCount = (typeof getDesired === 'function') ? getDesired().length : 0;
  const unwantedCount = Array.isArray(window._chipUnwanted) ? window._chipUnwanted.length : 0;
  if(!isAllJewelTypes(readFilterState().jewelTypes)) items.push('ลองเลือกประเภทจี้เพิ่ม หรือไม่เลือกเลย (= ทุกจี้) เพื่อให้มีจี้ตัวเลือกมากขึ้น');
  if(unwantedCount) items.push('ลองลดสกิลที่ไม่ต้องการบางสกิลออกไป เพื่อให้ค้นหาเซ็ตจี้ได้มากขึ้น');
  if(selectedCount > MIN_SELECTS) items.push('ลองลดจำนวนสกิลที่ต้องการ หรือเลือกเฉพาะสกิลสำคัญที่สุดก่อน');
  if(!isEmpty && shownCount < topK) items.push('ลองลดจำนวนเซ็ตที่ต้องการหรือแก้ไขสกิล เพื่อให้ค้นหาเซ็ตจี้ได้มากขึ้น');
  if(!items.length) items.push('ลองปรับเงื่อนไขแล้วค้นหาใหม่ เช่น เลือกสกิลที่ต้องการน้อยลง หรือไม่ต้องการบางสกิลน้อยลง เพื่อให้ได้ผลลัพธ์มากขึ้น');
  return items;
}

function createGuidanceHTML({title, shownCount, topK, isEmpty=false}){
  const items = buildGuidanceItems({shownCount, topK, isEmpty});
  return `<div class="result-guidance">
    <div class="result-guidance__title">${escapeHtmlText(title)}</div>
    <ul>${items.map(item=>`<li>${escapeHtmlText(item)}</li>`).join('')}</ul>
  </div>`;
}

function renderCompareTray(){
  const tray = document.getElementById('compareTray');
  if(!tray) return;
  const items = Array.from(_pinnedResults.values());
  if(!items.length){
    tray.classList.remove('show');
    tray.innerHTML = '';
    return;
  }
  tray.classList.add('show');
  tray.innerHTML = `
    <div class="compare-tray__head">
      <div>
        <div class="compare-tray__title"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707s.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146"/></svg> เซ็ตที่ปักไว้เปรียบเทียบ (${items.length})</div>
        <div class="compare-tray__sub">ดูจี้ 4 ชิ้นและตัวเลขสำคัญของแต่ละเซ็ตเทียบกัน</div>
      </div>
      <button type="button" class="compare-clear" id="compareClear">ล้างทั้งหมด</button>
    </div>
    <div class="compare-tray__items">
      ${items.map(item=>`
        <div class="compare-item">
          <div class="compare-item__top">
            <span class="compare-item__rank">เซ็ตที่ ${item.rank}</span>
            <button type="button" class="compare-remove" data-key="${escapeHtmlAttr(item.key)}" aria-label="เอาออก">×</button>
          </div>
          <div class="compare-jewels">
            ${(item.names || []).map(name=>`<div class="compare-jewel">${escapeHtmlText(name)}</div>`).join('')}
          </div>
          <div class="compare-metrics">
            <span class="compare-metric">คะแนน ${escapeHtmlText(item.score)}</span>
            <span class="compare-metric">ตรง ${item.matchedCount ?? 0}</span>
            <span class="compare-metric">หายไป ${(item.missing || []).length}</span>
            <span class="compare-metric">ไม่ต้องการ ${(item.unwanted || []).length}</span>
            <span class="compare-metric">ได้เพิ่ม ${(item.extra || []).length}</span>
          </div>
        </div>`).join('')}
    </div>`;
  document.getElementById('compareClear')?.addEventListener('click', ()=>{
    _pinnedResults.clear();
    document.querySelectorAll('.pin-result-btn.is-active').forEach(btn=>btn.classList.remove('is-active'));
    renderCompareTray();
  });
  tray.querySelectorAll('.compare-remove').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      _pinnedResults.delete(btn.dataset.key || '');
      document.querySelectorAll('.pin-result-btn.is-active').forEach(pin=>{
        const card = pin.closest('.result-card');
        const names = Array.from(card?.querySelectorAll('.jewel-name') || []).map(el=>el.textContent.trim()).filter(Boolean);
        if(names.join('|') === btn.dataset.key) pin.classList.remove('is-active');
      });
      renderCompareTray();
    });
  });
}

function togglePinnedResult(snapshot, btn){
  if(!snapshot?.key) return;
  if(_pinnedResults.has(snapshot.key)){
    _pinnedResults.delete(snapshot.key);
    btn?.classList.remove('is-active');
  }else{
    _pinnedResults.set(snapshot.key, snapshot);
    btn?.classList.add('is-active');
  }
  renderCompareTray();
  trackEvent('toggle_compare_pin', {
  result_rank: Number(snapshot.rank) || 0,
  result_key: snapshot.key || '',
  pinned_count: _pinnedResults.size
});
}

function copyText(text, successMessage){
  if(navigator.clipboard?.writeText){
    return navigator.clipboard.writeText(text)
      .then(()=>{
        showToast(successMessage || 'คัดลอกแล้ว', 3000, 'success');
      })
      .catch(()=>{
        showToast('ไม่สามารถคัดลอกอัตโนมัติได้', 3000, 'warn');
      });
  }
  showToast('เบราว์เซอร์นี้ไม่รองรับการคัดลอกอัตโนมัติ', 3000, 'warn');
  return Promise.resolve();
}

function trackEvent(eventName, params = {}) {
  if (!window.gtag) return;
  gtag('event', eventName, params);
}

function openDonateModal(source = 'unknown'){
  const modal = document.getElementById('donateModal');
  if(!modal) return;

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  syncBodyScrollLock();

  trackEvent('donate_modal_open', {
    source
  });
}

function closeDonateModal(){
  const modal = document.getElementById('donateModal');
  if(!modal) return;

  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  syncBodyScrollLock();
}

function showDonateCard(){
  const el = document.getElementById('donateResultCard');
  if(!el) return;
  el.hidden = false;
}

function hideDonateCard(){
  const el = document.getElementById('donateResultCard');
  if(!el) return;
  el.hidden = true;
}

let donateStickyTimer = null;
function showDonateSticky(){
  const el = document.getElementById('donateStickyBar');
  if(!el) return;

  if(donateStickyTimer){
    clearTimeout(donateStickyTimer);
    donateStickyTimer = null;
  }

  el.hidden = false;
  el.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(()=> el.classList.add('show'));

  donateStickyTimer = setTimeout(()=>{
    hideDonateSticky();
  }, 5000);
}

function hideDonateSticky(){
  const el = document.getElementById('donateStickyBar');
  if(!el) return;

  if(donateStickyTimer){
    clearTimeout(donateStickyTimer);
    donateStickyTimer = null;
  }

  el.classList.remove('show');
  el.setAttribute('aria-hidden', 'true');

  setTimeout(()=>{
    if(!el.classList.contains('show')) el.hidden = true;
  }, 280);
}

document.addEventListener('DOMContentLoaded', ()=>{
  hideDonateCard();
  hideDonateSticky();
});

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('donateResultBtn')?.addEventListener('click', ()=>{
    trackEvent('donate_cta_click', { placement: 'result_card' });
    openDonateModal('result_card');
  });

  document.getElementById('donateFooterBtn')?.addEventListener('click', ()=>{
    trackEvent('donate_cta_click', { placement: 'footer' });
    openDonateModal('footer');
  });

  document.getElementById('donateStickyBtn')?.addEventListener('click', ()=>{
    trackEvent('donate_cta_click', { placement: 'sticky_footer' });
    openDonateModal('sticky_footer');
  });

  document.getElementById('donateClose')?.addEventListener('click', closeDonateModal);

  document.getElementById('donateModal')?.addEventListener('click', (e)=>{
    if(e.target?.id === 'donateModal') closeDonateModal();
  });

  document.getElementById('donateDownloadBtn')?.addEventListener('click', ()=>{
    trackEvent('donate_qr_download_click', { placement: 'modal' });
  });

  initDonateOpenAppButton();
});

  function getMobileOS(){
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

function initDonateOpenAppButton(){
  const btn = document.getElementById('donateOpenAppBtn');
  if(!btn) return;

  const os = getMobileOS();
  if(os !== 'android' && os !== 'ios'){
    btn.hidden = true;
    return;
  }

  btn.hidden = false;

  btn.addEventListener('click', (e)=>{
    e.preventDefault();

    trackEvent('donate_open_app_click', {
      placement: 'modal',
      os
    });

    const FALLBACK_ANDROID = 'https://play.google.com/store/apps/details?id=th.co.truemoney.wallet';
    const FALLBACK_IOS = 'https://apps.apple.com/th/app/truemoney-wallet/id663885752';

    /**
     * IMPORTANT:
     * แทนค่า DEEP_LINK_* ด้วย official deep link / universal link ของ TrueMoney
     * ถ้ายังไม่มี ให้ fallback ไป store อย่างเดียว
     */
    const DEEP_LINK_ANDROID = 'https://tmn.app.link/?deeplink=ascendmoney://wallet.truemoney.co.th/app/';
    const DEEP_LINK_IOS = 'https://tmn.app.link/?deeplink=ascendmoney://wallet.truemoney.co.th/app/';

    const fallbackUrl = os === 'android' ? FALLBACK_ANDROID : FALLBACK_IOS;
    const deepLink = os === 'android' ? DEEP_LINK_ANDROID : DEEP_LINK_IOS;

    if(!deepLink){
      window.location.href = fallbackUrl;
      return;
    }

    const start = Date.now();
    window.location.href = deepLink;

    setTimeout(()=>{
  if(Date.now() - start < 1800){
    window.location.href = fallbackUrl;
  }
}, 1200);
  });
}


function trackSearchResults(searchTerm, resultCount, topK, extra = {}) {
  if (!window.gtag) return;
  gtag('event', 'search', {
    search_term: searchTerm || '(empty)',
    result_count: Number(resultCount) || 0,
    requested_top_k: Number(topK) || 0,
    ...extra
  });
}

function shareResultSnapshot(snapshot){
  const link = buildShareURL(snapshot.key, snapshot.filter || null, snapshot.names || []);

  trackEvent('share_result_click', {
    result_rank: Number(snapshot.rank) || 0,
    jewel_count: Array.isArray(snapshot.names) ? snapshot.names.length : 0
  });

  if(navigator.share){
    navigator.share({
      title: 'เซ็ตจี้ที่แนะนำ',
      text: 'กดเข้าไปดูเซ็ตจี้เกมเศรษฐีที่คัดมาได้เลย >>',
      url: link
    }).then(()=>{
      trackEvent('share_result_success', {
        method: 'native_share',
        result_rank: Number(snapshot.rank) || 0
      });
    }).catch(()=>{
      trackEvent('share_result_fallback', {
        method: 'clipboard',
        result_rank: Number(snapshot.rank) || 0
      });
      copyText(link, 'คัดลอกลิงก์แชร์เซ็ตนี้แล้ว');
    });
  }else{
    trackEvent('share_result_fallback', {
      method: 'clipboard_qr',
      result_rank: Number(snapshot.rank) || 0
    });
    copyText(link, 'คัดลอกลิงก์แชร์เซ็ตนี้แล้ว');
    showQRModal(link);
  }
}

function isSharedResultTarget(snapshot){
  if(!snapshot) return false;
  if(_pendingHighlightResultNames.length){
    return makeResultKey(snapshot.names || []) === makeResultKey(_pendingHighlightResultNames);
  }
  return !!(_pendingHighlightResultKey && snapshot.key === _pendingHighlightResultKey);
}

function updateExtraOverflowToggles(root=document){
  root.querySelectorAll('.row-extra--collapsible').forEach(row=>{
    const text = row.querySelector('.extra-text');
    if(!text) return;

    row.classList.remove('is-overflowing','expanded');
    row.setAttribute('aria-expanded','false');

    const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 18;
    const maxHeight = lineHeight + 1;
    const fullHeight = text.scrollHeight;
    if(fullHeight > maxHeight){
      row.classList.add('is-overflowing');
    }
  });
}

function renderResults(best, options){
  options = options || {};
  const sourceResults = Array.isArray(best) ? best : [];
  window._latestComputedResults = sourceResults;
  best = filterResultsByInventory(sourceResults);
  const container=document.getElementById('result'); container.innerHTML='';
  _currentResultSnapshots.clear();
  const desired = getDesired()||[];
  const topK = parseInt((document.getElementById('topK')?.value || '').trim(), 10) || DEFAULT_TOPK;
  const shownCount = Math.min(best.length, topK);

  if(!options.skipTracking){
    trackSearchResults(
      desired.join(', '),
      shownCount,
      topK,
      {
        selected_skill_count: desired.length,
        unwanted_skill_count: Array.isArray(window._chipUnwanted) ? window._chipUnwanted.length : 0,
        jewel_types: readFilterState().jewelTypes.join(',') || 'all',
        has_character: !!getCharSelectValue()
      }
    );
  }

  ['shareBtn','shareBtn2'].forEach(id=>{ const b=document.getElementById(id); if(b) b.disabled=(shownCount === 0); });
  syncInventoryResultFilterUI();
updateInventoryResultFiltersVisibility();

  if(resultTitle){
    resultTitle.textContent = shownCount < topK
      ? `💎 เซ็ตจี้ที่ดีที่สุด (พบ ${shownCount} จาก ${topK} เซ็ต)`
      : `💎 เซ็ตจี้ที่ดีที่สุด Top ${topK}`;
  }

  if(shownCount === 0){
    container.innerHTML = `
      <div class="empty-state" id="resultEmptyState">
        <div class="empty-state__icon">✨</div>
        <div class="empty-state__title">ไม่พบเซ็ตที่ตรงเงื่อนไข</div>
        <div class="empty-state__msg">${window._inventoryResultFilterMode === 'buildable' ? 'ยังไม่มีเซ็ตที่ประกอบได้ครบจากคลังจี้ตอนนี้' : window._inventoryResultFilterMode === 'missing1' ? 'ยังไม่มีเซ็ตที่ขาดเพียง 1 ชิ้นจากคลังจี้ตอนนี้' : 'ลองลดจำนวนสกิลที่ไม่ต้องการ หรือปรับเงื่อนไขแล้วค้นหาใหม่'}</div>
      </div>
      ${createGuidanceHTML({title:'ลองปรับเงื่อนไขตามนี้', shownCount, topK, isEmpty:true})}`;
    return;
  }

  const jewelMap = new Map((jewels || []).map(j=>[j.id,j]));
  if(shownCount < topK){
    container.insertAdjacentHTML('beforeend', createGuidanceHTML({
      title:`พบ ${shownCount} จาก ${topK} เซ็ต โปรดดูคำแนะนำด้านล่าง`,
      shownCount,
      topK
    }));
  }

  best.slice(0, topK).forEach((r,i)=>{
    const card=document.createElement('div'); card.className=`result-card rank-${i+1}`; card.style.animationDelay=`${i*0.06}s`;
    const group = r.ids.map(id => jewelMap.get(id)).filter(Boolean);

    const ownership = computeResultOwnership(r);
    const jewelCols = group.map(j=>{
      const tooltip = j.substats.map(s=>{
        const icon = desired.includes(s.name)?'✅':'✨';
        const maxStack = abilityOf(s.name)?.maxStack;
        return `${icon} ${s.name}: ${s.value}%${maxStack ? ` · สูงสุด ${maxStack} ขั้น` : ''}`;
      }).join('\n');
      const isLink = isLinkId(j.id);
      const isOwned = ownership.ownedIds.includes(j.id);
      const cls = 'jewel-column' + (isLink ? ' jewel-link' : '') + (isOwned ? ' is-owned' : ' is-missing');
      const charLabel = isLink ? (j.allowedChars || j.AllowedChars || '').toString().trim() : '';
      const badge = isLink ? `<span class="jewel-lock-badge">🔒 เฉพาะ${charLabel ? ' ' + escapeHtmlText(charLabel) : 'ตัวละคร'} 🔒</span>` : '';
      return `<div class="${cls}" data-tooltip="${escapeHtmlAttr(tooltip)}">${badge}<span class="jewel-name">${escapeHtmlText(j.id)}</span><span class="jewel-info" aria-hidden="true">ⓘ</span></div>`;
    }).filter(Boolean).join('');

    const notList = desired.filter((_,idx)=> r.notIdx.includes(idx));
    const allNames = new Set(); group.filter(Boolean).forEach(j=>j.substats.forEach(s=>allNames.add(s.name)));
    // แยก extra ออกจาก unwanted — recalculate ใน render เพื่อให้ทั้ง normal และ fixed-link path ถูกต้อง
    const unwantedSet = new Set(Array.isArray(window._chipUnwanted) ? window._chipUnwanted : []);
    const extra = [...allNames].filter(nm => !desired.includes(nm) && !unwantedSet.has(nm));
    const extraUnwanted = [...allNames].filter(nm => !desired.includes(nm) && unwantedSet.has(nm));
    const effectiveUnwantedCount = extraUnwanted.length;
    const matchedCount = desired.length - notList.length;

    const notBadge = notList.length > 0 ? `<span class="badge badge--not" title="จำนวนที่ยังไม่ตรงกับที่เลือก">🔴 หายไป ${notList.length}</span>` : '';
    const warnBadge = effectiveUnwantedCount > 0 ? `<span class="badge badge--warn" title="เซ็ตนี้มีสกิลที่ไม่ต้องการ ${effectiveUnwantedCount} รายการ">⚠️ ไม่ต้องการ ${effectiveUnwantedCount}</span>` : '';
    const badgesHTML = `
      <div class="badges" aria-label="สรุปความตรงใจ">
        <span class="badge badge--match" title="ความสามารถที่เลือกไว้ตรงครบ">✅ ตรงเป๊ะ ${matchedCount}</span>
        ${notBadge}
        ${warnBadge}
        ${extra.length > 0 ? `<span class="badge badge--extra badge--extra-sm" title="ความสามารถที่ได้เพิ่มจากเซ็ตนี้">+${extra.length}</span>` : ''}
      </div>`;

    const total = (r.totalValue ?? 0).toFixed(2).replace(/\.00$/,'');
    const extraSkillHTML = extra.map((nm, idx)=>`<button type="button" class="extra-skill" data-skill="${escapeHtmlAttr(nm)}">${escapeHtmlText(nm)}</button>${idx < extra.length - 1 ? ', ' : ''}`).join('');
    const snapshot = createResultSnapshot({
      rank: i + 1,
      result: r,
      group,
      notList,
      extra,
      extraUnwanted,
      total,
      matchedCount
    });
    _currentResultSnapshots.set(snapshot.key, snapshot);
    if(isSharedResultTarget(snapshot)){
      card.classList.add('result-card--highlight');
    }

    const notMatchHTML = notList.length ? `<div class="row-ability row-miss"><strong class="row-ability__label">หายไป:</strong><span class="row-ability__text">${notList.map(escapeHtmlText).join(', ')}</span></div>` : '';
    const extraHTML = extra.length ? `<div class="row-ability row-extra row-extra--collapsible"><div class="row-ability__head"><strong class="row-ability__label">ได้เพิ่ม:</strong><span class="row-ability__toggle" aria-hidden="true"></span></div><span class="row-ability__text extra-text">${extraSkillHTML}</span></div>` : '';
    const unwantedHTML = extraUnwanted.length ? `<div class="row-ability row-miss"><strong class="row-ability__label">ไม่ต้องการ:</strong><span class="row-ability__text">${extraUnwanted.map(escapeHtmlText).join(', ')}</span></div>` : '';

    const headerHTML = `
  <div class="card-head">
    <h3 aria-label="อันดับ ${i+1}"><span class="rank-full" aria-hidden="true">อันดับ ${i+1}</span><span class="rank-short" aria-hidden="true">#${i+1}</span></h3>
    ${badgesHTML}
  </div>
`;

card.innerHTML = `
  ${headerHTML}
  <div class="jewel-wrap"><div class="jewel-columns">${jewelCols}</div></div>
  <div class="card-info">
    ${notMatchHTML ? `<p>${notMatchHTML}</p>` : ''}
    ${unwantedHTML ? `<p>${unwantedHTML}</p>` : ''}
    ${extraHTML ? `<p>${extraHTML}</p>` : ''}
    <p><strong>▸ คะแนนความเทพ = </strong> ${total} คะแนน</p>
  </div>
`;

    const names = snapshot.names || [];
    const pinBtn = document.createElement('button');
    pinBtn.className = 'result-icon-btn pin-result-btn' + (_pinnedResults.has(snapshot.key) ? ' is-active' : '');
    pinBtn.type = 'button';
    pinBtn.title = 'ปักไว้เพื่อเทียบ';
    pinBtn.setAttribute('aria-label','ปักไว้เพื่อเทียบ');
    pinBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707s.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146"/></svg>';
    pinBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      togglePinnedResult(snapshot, pinBtn);
    });

    const actionWrap = document.createElement('div');
    actionWrap.className = 'result-action';
    actionWrap.innerHTML = `
      <button type="button" class="result-icon-btn result-menu-btn" aria-label="ตัวเลือกเซ็ตนี้" title="ตัวเลือกเซ็ตนี้">⋯</button>
      <div class="result-menu" role="menu">
        <button type="button" data-action="copy-names"><svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"> <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg><span>คัดลอกชื่อจี้</span></button>
        <button type="button" data-action="share-result"><svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5"/><path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z"/></svg><span>แชร์เซ็ตนี้</span></button>
        <button type="button" data-action="save-result"><svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.56.56 0 0 0-.163-.505L1.71 6.745l4.052-.576a.53.53 0 0 0 .393-.288L8 2.223l1.847 3.658a.53.53 0 0 0 .393.288l4.052.575-2.906 2.77a.56.56 0 0 0-.163.506l.694 3.957-3.686-1.894a.5.5 0 0 0-.461 0z"/></svg><span>บันทึกเซ็ตนี้</span></button>
      </div>`;
    actionWrap.querySelector('.result-menu-btn')?.addEventListener('click', (e)=>{
  e.stopPropagation();
  document.querySelectorAll('.result-action.open').forEach(el=>{ if(el !== actionWrap) el.classList.remove('open'); });
  actionWrap.classList.toggle('open');
});

actionWrap.querySelector('.result-menu')?.addEventListener('click', (e)=>{
  const menu = e.currentTarget;
  const btn = e.target.closest('[data-action]');
  if(!btn || !menu.contains(btn)) return;

  const action = btn.dataset.action;

  e.stopPropagation();
  actionWrap.classList.remove('open');

if(action === 'copy-names'){
  trackEvent('copy_jewel_names', {
    result_rank: Number(snapshot.rank) || 0,
    jewel_count: names.length
  });
  copyText(names.join(', '), 'คัดลอกชื่อจี้แล้ว');
}
  if(action === 'share-result') shareResultSnapshot(snapshot);
  if(action === 'save-result' && typeof saveResultSetSnapshot === 'function') saveResultSetSnapshot(snapshot);
});
    const head = card.querySelector('.card-head');
    const badgesEl = head?.querySelector('.badges');
    if(badgesEl){ badgesEl.append(pinBtn, actionWrap); }
    else if(head){ head.append(pinBtn, actionWrap); }
    else { card.append(pinBtn, actionWrap); }
    container.appendChild(card);
  });

  if(_pendingHighlightResultKey || _pendingHighlightResultNames.length){
    const highlighted = container.querySelector('.result-card--highlight');
    if(highlighted){
      setTimeout(()=>{
        highlighted.scrollIntoView({behavior:'smooth', block:'center'});
        showToast('เปิดเซ็ตจี้ที่แชร์ไว้แล้ว', 2400, 'success');
      }, 250);
    }else{
      showToast('ไม่พบเซ็ตที่แชร์ในผลลัพธ์ชุดนี้ อาจมีข้อมูลเปลี่ยนไป', 3600, 'warn');
    }
    _pendingHighlightResultKey = '';
    _pendingHighlightResultNames = [];
  }

  updateExtraOverflowToggles(container);

  // ถ้า Reduce Motion เปิดอยู่ ให้แน่ใจว่าการ์ดมองเห็น
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    document.querySelectorAll('.result-card').forEach(el => el.style.opacity = '1');
  }

  document.dispatchEvent(new CustomEvent('guidedSearchCompleted'));

  setTimeout(()=> updateExtraOverflowToggles(container), 0);
  showDonateSticky();
  showDonateCard();

  // auto-scroll ไปยัง section ผลลัพธ์บนมือถือเท่านั้น
  if (window.innerWidth < 768){
    const resultEl = document.getElementById('resultTitle');
    const targetEl = resultEl?.closest('section') || resultEl;
    if (targetEl){
      setTimeout(()=>{
        const headerHeight = document.querySelector('header')?.offsetHeight || 50;
        const top = targetEl.getBoundingClientRect().top + window.scrollY - headerHeight - 12;
        window.scrollTo({ top, behavior: 'smooth' });
      }, 100);
    }
  }
}

/* resetAll */
function resetAll(){
  trackEvent('reset_filters', {
  selected_skill_count: Array.isArray(window._chipSelected) ? window._chipSelected.length : 0,
  unwanted_skill_count: Array.isArray(window._chipUnwanted) ? window._chipUnwanted.length : 0
});
  // stop any in-flight search so a late worker result can't repaint the page
  beginCalcRun();
  hideCalcOverlay();
  window._hasSearchedResults = false;
window._inventoryResultFilterMode = 'all';

const inventoryFilterWrap = document.getElementById('inventoryResultFilters');
if(inventoryFilterWrap){
  inventoryFilterWrap.hidden = true;
}

syncInventoryResultFilterUI();

  // ล้าง chip state (includes unwanted)
  if (typeof window.clearChipState === 'function') window.clearChipState();

  // ล้าง unwanted search input
  const unwantedSearchEl = document.getElementById('chipUnwantedSearch');
  const unwantedSearchClearEl = document.getElementById('chipUnwantedSearchClear');
  if (unwantedSearchEl) { unwantedSearchEl.value = ''; }
  if (unwantedSearchClearEl) unwantedSearchClearEl.hidden = true;
  const unwantedAllWrap = document.getElementById('chipUnwantedAllWrap');
  if (unwantedAllWrap) unwantedAllWrap.hidden = true;
  if (typeof window.refreshUnwantedChips === 'function') window.refreshUnwantedChips();
  applyFilterState({ jewelTypes: [] });

  if (topKInput){
    topKInput.value = String(DEFAULT_TOPK);
  }
  document.querySelectorAll('.topk-preset').forEach(btn => {
  btn.classList.remove('active');
});

  // ล้าง chip search input
  const chipSearchEl = document.getElementById('chipSearch');
  const chipSearchClearEl = document.getElementById('chipSearchClear');
  if (chipSearchEl) { chipSearchEl.value = ''; if (typeof renderAll === 'function') renderAll(); }
  if (chipSearchClearEl) chipSearchClearEl.hidden = true;
  const chipAllWrap = document.getElementById('chipAllWrap');
  if (chipAllWrap) chipAllWrap.hidden = true;

  restoreEmptyState();
  hideDonateCard();
  if(resultTitle) resultTitle.textContent = '💎 เซ็ตจี้ที่ดีที่สุด';
  _currentResultSnapshots.clear();
  clearPinnedResults();

  // ล้างตัวเลือกตัวละครและ preview
  const charSel = document.getElementById('charSelect');
  if (charSel){
    if (charSel.tomselect) charSel.tomselect.clear(true);
    else charSel.value = '';
  }
  const cp = document.getElementById('charPreview');
  if (cp) cp.classList.remove('show');

  updateCalcAvailability();
  showToast('🧹 ล้างตัวเลือกและผลลัพธ์แล้ว', 2000);
}

/* แตะเพื่อแสดง tooltip ใน Toast บนอุปกรณ์สัมผัส */

// ประเภทจี้: กดเพื่อเลือก/ยกเลิก (เลือกได้หลายอัน)
jewelTypeButtons().forEach(btn => btn.addEventListener('click', ()=>{
  const types = readJewelTypesUI();
  const t = btn.dataset.type;
  setJewelTypesUI(types.includes(t) ? types.filter(x => x !== t) : types.concat(t));
  invalidateResultsForCriteriaChange();
}));

/** จำนวนจี้ของแต่ละประเภท (ไม่นับ [ลิงก์]) บนปุ่ม */
function renderJewelTypeCounts(){
  const counts = {};
  jewels.forEach(j => { counts[j.type] = (counts[j.type] || 0) + 1; });
  jewelTypeButtons().forEach(b => {
    const el = b.querySelector('.jewel-type__count');
    if(el) el.textContent = counts[b.dataset.type] ? `(${counts[b.dataset.type]})` : '';
  });
}

// ===== Keyword map: ability → [alias, alias, ...] =====
// ดึงจาก Sheet "Keywords" (gid ที่กำหนดใน KEYWORD_GID)
// ถ้าไม่มี sheet หรือ fetch ล้มเหลว → ใช้ map ว่าง (ค้นหาปกติยังทำงาน)
const KEYWORD_GID = '850304016'; // ← ใส่ gid ของ sheet "Keywords" ที่นี่ เช่น '123456789'

function normalizeSearchText(value){
  return String(value || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Load one extra tab of the sheet by name (e.g. 'Abilities') or gid via GViz JSONP.
 * Resolves to the GViz table, or null when the tab is missing / empty / unreachable.
 */
function fetchSheetTab({ sheet, gid }, timeoutMs = 8000){
  return new Promise((resolve)=>{
    const cbName = '__SheetTab_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    let sc = null;
    const finish = (table)=>{ clearTimeout(timer); delete window[cbName]; sc?.remove(); resolve(table); };
    const timer = setTimeout(()=> finish(null), timeoutMs);
    window[cbName] = (resp)=> finish(resp && resp.status !== 'error' && resp.table?.rows?.length ? resp.table : null);
    const which = sheet ? `sheet=${encodeURIComponent(sheet)}` : `gid=${encodeURIComponent(gid)}`;
    const tqx = encodeURIComponent(`out:json;responseHandler:${cbName}`);
    sc = document.createElement('script');
    sc.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${which}&headers=1&tqx=${tqx}&rand=${Date.now()}`;
    sc.onerror = ()=> finish(null);
    document.head.appendChild(sc);
  });
}

/** Abilities + Triggers tabs → `abilities`, `abilityTriggers`. Missing tabs just leave defaults. */
async function loadAbilityData(){
  const [abilityTable, triggerTable] = await Promise.all([
    fetchSheetTab({ sheet: 'Abilities' }),
    fetchSheetTab({ sheet: 'Triggers' })
  ]);
  const parsed = abilityTable ? parseAbilitiesTable(abilityTable) : { abilities: new Map(), problems: [] };
  abilityTriggers = triggerTable ? parseTriggersTable(triggerTable) : [];
  const problems = parsed.problems.concat(finalizeAbilities(parsed.abilities, jewels, abilityTriggers));
  abilities = parsed.abilities;
  if(!abilityTable) console.warn('[sheet] โหลดแท็บ Abilities ไม่ได้ — ใช้ค่าเริ่มต้นของทุกสกิล');
  if(problems.length) console.warn(`[sheet] Abilities: พบ ${problems.length} จุดที่ควรตรวจ:\n` + problems.join('\n'));
}

/** Merge search keywords from the Abilities tab into the Keywords-tab map (both stay supported). */
function mergeAbilityKeywords(map){
  abilities.forEach(a => {
    const kws = a.keywords.map(normalizeSearchText).filter(Boolean);
    if(!kws.length) return;
    map.set(a.name, Array.from(new Set([...(map.get(a.name) || []), ...kws])));
  });
  return map;
}

let _keywordFailed = false;
function fetchKeywordSheet(){
  if (!KEYWORD_GID) return Promise.resolve(new Map());
  return new Promise((resolve)=>{
    const cbName = '__KeywordsGViz_' + Date.now();
    const timeout = setTimeout(()=>{ delete window[cbName]; _keywordFailed = true; resolve(new Map()); }, 6000);
    window[cbName] = function(resp){
      clearTimeout(timeout);
      delete window[cbName];
      try{
        const table = resp && resp.table;
        if (!table){ _keywordFailed = true; resolve(new Map()); return; }
        const cols = (table.cols||[]).map(c=>(c.label||c.id||'').toString().trim());
        const map = new Map();
        (table.rows||[]).forEach(r=>{
          const cells = (r.c||[]);
          const ability = (cells[0]?.v ?? '').toString().trim();
          const raw     = (cells[1]?.v ?? '').toString().trim();
          if (!ability) return;

          const kws = raw
            .split(/[,，\n]/)
            .map(k => normalizeSearchText(k))
            .filter(Boolean);

          if (kws.length) map.set(ability, kws);
        });
        resolve(map);
      }catch(e){ _keywordFailed = true; resolve(new Map()); }
    };
    const tqx = encodeURIComponent(`out:json;responseHandler:${cbName}`);
    const src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${KEYWORD_GID}&headers=1&tqx=${tqx}&rand=${Date.now()}`;
    const sc = document.createElement('script'); sc.src = src;
    sc.onerror = ()=>{ clearTimeout(timeout); _keywordFailed = true; resolve(new Map()); };
    document.head.appendChild(sc);
  });
}

document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    showLoading('กำลังโหลดข้อมูลอัปเดตล่าสุด');
    startProgressSimulation(5, 92, 'กำลังโหลดข้อมูลอัปเดตล่าสุด...');
    jewels = await fetchGVizJSONP();

const [keywordMap] = await Promise.all([
  fetchKeywordSheet().catch(e => { console.warn('Keyword sheet load failed:', e); _keywordFailed = true; return new Map(); }),
  loadAbilityData()
]);
window._abilityKeywords = mergeAbilityKeywords(keywordMap);

stopProgressSimulation(true, 'โหลดข้อมูลสำเร็จ');

renderJewelTypeCounts();
const substats = [...new Set(jewels.flatMap(j=>j.substats.map(s=>s.name)))].sort();

    setProgress(100, 'กำลังเตรียมตัวเลือก...');
    await makeTomSelects(substats);

    setTimeout(()=>{
      hideLoading();
      showToast(substats.length ? 'โหลดข้อมูลอัปเดตล่าสุดเรียบร้อย เริ่มจัดเซ็ตจี้กันเลย!' :
                                 'โหลดข้อมูลได้ แต่ยังไม่พบรายการความสามารถในชีต', 2500);
    }, 180);

    bindShareButtons();       // ผูกอีเวนต์ปุ่มแชร์
    applyStateFromURL(); 

  }catch(err){
    stopProgressSimulation(false);
    hideLoading();
    console.warn('Fetch error:', err);
    showErrorBanner('ไม่สามารถโหลดข้อมูลได้: ' + (err?.message || err) + ' — ตรวจสิทธิ์แชร์ชีตเป็น "Anyone with the link – Viewer" และหัวคอลัมน์ให้ถูกต้อง');
    await makeTomSelects([]);
  }


  updateCalcAvailability();
});
