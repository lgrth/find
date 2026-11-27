// รายการความสามารถทั้งหมด (เซ็ตหลัง loadData) — ใช้สำหรับ URL encoding/decoding
let _abilityList = [];
let _abilityListReady = false;
let _pendingURLStateApply = false;
let _urlStateApplied = false;
let _pendingHighlightResultKey = '';
let _pendingHighlightResultNames = [];
function setAbilityList(arr){
  _abilityList = Array.from(arr || []);
  _abilityListReady = true;
  if (_pendingURLStateApply){
    _pendingURLStateApply = false;
    setTimeout(()=> applyStateFromURL(), 0);
  }
}

const SHARE_STATE_VERSION = 2;

function toAbilityIndices(list){
  if (!_abilityList.length || !Array.isArray(list)) return [];
  return list
    .map(name => _abilityList.indexOf(name))
    .filter(idx => idx >= 0);
}

function fromAbilityIndices(list){
  if (!_abilityList.length || !Array.isArray(list)) return [];
  return list
    .map(idx => _abilityList[Number(idx)])
    .filter(Boolean);
}

function canonicalResultNames(names){
  return Array.from(names || [])
    .map(name => String(name || '').trim())
    .filter(Boolean)
    .sort((a,b)=>a.localeCompare(b, 'th'));
}

function makeResultKey(names){
  return canonicalResultNames(names).join('|');
}

function buildLegacyShareURL(url, resultKey='', filterState=null, resultNames=[]){
  const f = filterState || readFilterState();
  const params = url.searchParams;
  const desired = Array.isArray(f.selected) ? f.selected : [];

  if (_abilityList.length){
    const indices = toAbilityIndices(desired);
    if (indices.length) params.set('s', indices.join(','));
  } else {
    desired.forEach(v => params.append('sel', v));
  }

  const topKValue = f.topK != null ? String(f.topK) : '';
  if (topKValue && topKValue !== '10') params.set('k', topKValue);
  const ty = jewelTypesToBits(f.jewelTypes);
  if (ty) params.set('ty', String(ty));

  const unwantedSels = Array.isArray(f.unwanted) ? f.unwanted : [];
  if (_abilityList.length && unwantedSels.length){
    const uIdx = toAbilityIndices(unwantedSels);
    if (uIdx.length) params.set('u', uIdx.join(','));
  }

  if (f.char) params.set('char', String(f.char));

  if (resultKey) params.set('r', resultKey);
  const targetNames = canonicalResultNames(resultNames);
  if (targetNames.length) params.set('rn', targetNames.join('||'));
  url.search = params.toString();
  return url.toString();
}

function buildShareURL(resultKey='', filterState=null, resultNames=[]){
  const url = new URL(location.href);
  url.search = '';

  const state = filterStateToShareParams(filterState || readFilterState());
  const cleanResultKey = sanitizePlainString(resultKey || '', 260);
  const cleanResultNames = canonicalResultNames(resultNames).slice(0, 4);
  if (cleanResultKey) state.r = cleanResultKey;
  // เก็บชื่อจี้เฉพาะตอนแชร์เซ็ตจี้เท่านั้น
  if (cleanResultKey && cleanResultNames.length) state.t = cleanResultNames;

  if (typeof LZString?.compressToEncodedURIComponent === 'function'){
    try{
      const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(state));
      if (compressed){
        url.searchParams.set('d', compressed);
        return url.toString();
      }
    }catch(err){
      console.warn('Compressed share URL build failed, fallback to legacy URL.', err);
    }
  }

  // fallback เผื่อ lib โหลดไม่ทัน / error
  return buildLegacyShareURL(url, resultKey, filterState, resultNames);
}

function parseCompressedStateFromURL(){
  const params = new URLSearchParams(location.search);
  const packed = params.get('d');
  if (!packed || typeof LZString?.decompressFromEncodedURIComponent !== 'function') return null;

  if(packed.length > MAX_SHARE_PACKED_LENGTH){
    console.warn('Compressed share URL ignored: packed state is too large.');
    return null;
  }

  try{
    const json = LZString.decompressFromEncodedURIComponent(packed);
    if (!json) return null;

    if(json.length > MAX_SHARE_JSON_LENGTH){
      console.warn('Compressed share URL ignored: decompressed state is too large.');
      return null;
    }

    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const resultKey = parsed.r != null ? sanitizePlainString(parsed.r, 260) : '';
    return {
      filter: shareParamsToFilterState(parsed),
      // Auto-run only when a specific result set was shared; a plain filter link
      // just fills the form and lets the user press search themselves.
      auto: resultKey ? '1' : '',
      resultKey: resultKey,
      resultNames: Array.isArray(parsed.t) ? canonicalResultNames(parsed.t).slice(0, 4) : []
    };
  }catch(err){
    console.warn('Compressed share URL parse failed, fallback to legacy params.', err);
    return null;
  }
}

function parseLegacyStateFromURL(){
  const params = new URLSearchParams(location.search);

  let sels = [];
  const sParam = params.get('s');

  if (sParam && _abilityList.length){
    sels = sParam
      .split(',')
      .map(n => _abilityList[parseInt(n, 10)])
      .filter(Boolean);
  } else {
    sels = params.getAll('sel');
  }

  const uParam = params.get('u');
  const unwanted = (uParam && _abilityList.length)
    ? uParam.split(',').map(n => _abilityList[parseInt(n, 10)]).filter(Boolean)
    : [];

  return {
    filter: {
      selected: sanitizeStringArray(sels, MAX_SELECTS, 120),
      unwanted: sanitizeStringArray(unwanted, MAX_SELECTS, 120),
      topK: params.get('k') ? String(clampNumber(params.get('k'), 3, 50, 10)) : '',
      jewelTypes: params.get('ty') ? bitsToJewelTypes(params.get('ty'))
        : ((params.get('d') || params.get('dark')) === '1' ? ['dark'] : []),
      char: sanitizePlainString(params.get('char') || '', 120)
    },
    auto: params.get('r') ? '1' : '',
    resultKey: sanitizePlainString(params.get('r') || '', 260),
    resultNames: params.get('rn') ? canonicalResultNames(params.get('rn').split('||')).slice(0, 4) : []
  };
}

async function applyStateFromURL(){
  if (_urlStateApplied) return;
  if (!_abilityListReady){
    _pendingURLStateApply = true;
    return;
  }
  const state = parseCompressedStateFromURL() || parseLegacyStateFromURL();
  const f = state.filter;
  _urlStateApplied = true;

  // Pendant types are always taken from the link; topK and character only when present.
  applyFilterState({
    jewelTypes: f.jewelTypes,
    selected: f.selected,
    unwanted: f.unwanted,
    ...(f.topK ? { topK: f.topK } : {}),
    ...(f.char ? { char: f.char } : {})
  });
  _pendingHighlightResultKey = state.resultKey || '';
  _pendingHighlightResultNames = canonicalResultNames(state.resultNames || []);

  updateCalcAvailability();

  if (state.auto === '1' && getDesired().length >= MIN_SELECTS){
    if(f.char){
      let guard = 0;
      while(!window.__charSheetReady && guard < 40){
        await new Promise(r => setTimeout(r, 100));
        guard++;
      }
    }else{
      await new Promise(r => setTimeout(r, 100));
    }
    calculate();
  }
}


function bindShareButtons(){
  if (window.__shareButtonsBound) return;
  window.__shareButtonsBound = true;

  const onShare = ()=>{
    let link = '';

    try{
      link = buildShareURL();
    }catch(err){
      console.error('Share URL build failed:', err);
      trackEvent('share_filters_error', {
        reason: 'build_share_url_failed'
      });
      showToast('ไม่สามารถสร้างลิงก์แชร์ได้ กรุณาลองใหม่อีกครั้ง', 3000, 'error');
      return;
    }

    if(!link){
      trackEvent('share_filters_error', {
        reason: 'empty_share_url'
      });
      showToast('ไม่สามารถสร้างลิงก์แชร์ได้ กรุณาลองใหม่อีกครั้ง', 3000, 'error');
      return;
    }

    trackEvent('share_filters_click', {
      selected_skill_count: (getDesired() || []).length,
      unwanted_skill_count: Array.isArray(window._chipUnwanted) ? window._chipUnwanted.length : 0
    });

    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(link).then(()=>{
        trackEvent('share_filters_success', {
          method: 'clipboard'
        });
        showToast('คัดลอกลิงก์แชร์แล้ว', 2000, 'success');
        showQRModal(link);
      }).catch(()=>{
        trackEvent('share_filters_fallback', {
          method: 'qr_only'
        });
        showQRModal(link);
      });
      return;
    }

    trackEvent('share_filters_fallback', {
      method: 'qr_only_no_clipboard'
    });
    showQRModal(link);
  };

  document.getElementById('shareBtn')?.addEventListener('click', onShare);
  document.getElementById('shareBtn2')?.addEventListener('click', onShare);
}

// Single source of truth for the body scroll-lock across every blocking modal.
const MODAL_OPEN_SELECTOR = '.fav-modal.show, .qr-modal.show, .donate-modal.show, .fb-modal.show, .fb-confirm.show';
function syncBodyScrollLock(){
  document.body.style.overflow = document.querySelector(MODAL_OPEN_SELECTOR) ? 'hidden' : '';
}

function setDialogVisible(dialog, visible){
  if(!dialog) return;

  // Abort any pending close-cleanup from a previous toggle (prevents a stale
  // hide from clobbering a dialog that was just re-opened).
  if(dialog.__closeCleanup){ dialog.__closeCleanup(); dialog.__closeCleanup = null; }

  if(visible){
    dialog.classList.remove('hiding');
    dialog.hidden = false;
    dialog.classList.add('show');
    dialog.setAttribute('aria-hidden', 'false');
    syncBodyScrollLock();
    return;
  }

  dialog.classList.remove('show');
  dialog.classList.add('hiding');
  dialog.setAttribute('aria-hidden', 'true');
  // The dialog no longer counts as open, so recompute the lock right away
  // instead of waiting for an animation that may never fire.
  syncBodyScrollLock();

  let timer = null;
  let cleared = false;
  const finish = (e) => {
    // Ignore animationend bubbling up from child elements.
    if(e && e.target !== dialog) return;
    if(cleared) return;
    cleared = true;
    clearTimeout(timer);
    dialog.removeEventListener('animationend', finish);
    dialog.__closeCleanup = null;
    dialog.classList.remove('hiding');
    dialog.hidden = true;
    syncBodyScrollLock();
  };
  // Whichever comes first: the close animation ending, or a fixed fallback so a
  // modal with no `.hiding` animation still gets cleaned up (bug: stuck scroll).
  timer = setTimeout(finish, 600);
  dialog.addEventListener('animationend', finish);
  dialog.__closeCleanup = () => { cleared = true; clearTimeout(timer); dialog.removeEventListener('animationend', finish); };
}

function showQRModal(url){
  trackEvent('open_qr_modal');
  const modal = document.getElementById('qrModal');
  const canvas = document.getElementById('qrCanvas');
  const urlEl = document.getElementById('qrUrl');
  if (!modal || !canvas) return;
  canvas.innerHTML = '';
  if (urlEl) urlEl.textContent = url;
  try{
    if (typeof QRCode === 'function'){
      new QRCode(canvas, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    } else {
      const img = document.createElement('img');
      img.alt = 'QR';
      img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(url);
      canvas.appendChild(img);
    }
  }catch(e){
    canvas.textContent = 'ไม่สามารถสร้าง QR ได้';
  }
  setDialogVisible(modal, true);
}
function hideQRModal(){
  const modal = document.getElementById('qrModal');
  setDialogVisible(modal, false);
}

let _activeSkillActionName = '';
function getSkillActionMenu(){
  let menu = document.getElementById('skillActionMenu');
  if(menu) return menu;
  menu = document.createElement('div');
  menu.id = 'skillActionMenu';
  menu.className = 'skill-action-menu';
  menu.innerHTML = `
    <div class="skill-action-menu__title"></div>
    <button type="button" data-skill-action="want"><svg width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
      <span>เพิ่มเป็นสกิลที่ต้องการ</span></button>
    <button type="button" data-skill-action="unwant"><svg width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/></svg>
      <span>ไม่เอาสกิลนี้ (สกิลที่ไม่ต้องการ)</span></button>`;
  menu.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-skill-action]');
  if(!btn || !menu.contains(btn) || !_activeSkillActionName) return;
  applySkillAction(_activeSkillActionName, btn.dataset.skillAction);
  });
  document.body.appendChild(menu);
  return menu;
}

function showSkillActionMenu(skillName, sourceEl){
  const menu = getSkillActionMenu();
  _activeSkillActionName = skillName;
  menu.querySelector('.skill-action-menu__title').textContent = skillName;
  document.querySelectorAll('.extra-skill.is-menu-open').forEach(el=>el.classList.remove('is-menu-open'));
  sourceEl.classList.add('is-menu-open');
  const rect = sourceEl.getBoundingClientRect();
  menu.classList.add('show');
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - menuRect.width - 8, Math.max(8, rect.left));
  const top = Math.min(window.innerHeight - menuRect.height - 8, rect.bottom + 6);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function hideSkillActionMenu(){
  const menu = document.getElementById('skillActionMenu');
  if(menu) menu.classList.remove('show');
  document.querySelectorAll('.extra-skill.is-menu-open').forEach(el=>el.classList.remove('is-menu-open'));
  _activeSkillActionName = '';
}

function applySkillAction(skillName, action){
  if(action === 'want'){
    const current = Array.isArray(window._chipSelected) ? window._chipSelected.slice() : [];
    if(current.includes(skillName)){
      showToast('สกิลนี้อยู่ในรายการที่ต้องการแล้ว', 2000, 'info');
      hideSkillActionMenu();
      return;
    }
    if(current.length >= MAX_SELECTS){
      showToast(`เลือกสกิลที่ต้องการได้สูงสุด ${MAX_SELECTS} สกิล`, 2800, 'warn');
      hideSkillActionMenu();
      return;
    }
    if(typeof window.setChipState === 'function') window.setChipState(current.concat(skillName));
    if(typeof window.setUnwantedState === 'function'){
      const nextUnwanted = (window._chipUnwanted || []).filter(n=>n !== skillName);
      window.setUnwantedState(nextUnwanted);
    }
    updateCalcAvailability();
    showToast('เพิ่มไปยังสกิลที่ต้องการแล้ว', 2500, 'success');
     hideSkillActionMenu();
     return;
  }
  if(action === 'unwant'){
    if((window._chipSelected || []).includes(skillName)){
      const nextSelected = (window._chipSelected || []).filter(n=>n !== skillName);
      if(typeof window.setChipState === 'function') window.setChipState(nextSelected);
      const nextUnwanted = Array.from(new Set([...(window._chipUnwanted || []), skillName]));
      if(typeof window.setUnwantedState === 'function') window.setUnwantedState(nextUnwanted);
      updateCalcAvailability();
      showToast('ย้ายไปยังสกิลที่ไม่ต้องการแล้ว', 2500, 'success');
      hideSkillActionMenu();
      return;
    }
    const current = Array.isArray(window._chipUnwanted) ? window._chipUnwanted.slice() : [];
    if(current.includes(skillName)){
      showToast('สกิลนี้อยู่ในรายการที่ไม่ต้องการแล้ว', 2000, 'warn');
      hideSkillActionMenu();
      return;
    }
    if(!current.includes(skillName) && typeof window.setUnwantedState === 'function') window.setUnwantedState(current.concat(skillName));
    updateCalcAvailability();
    showToast('เพิ่มไปยังสกิลที่ไม่ต้องการแล้ว', 2500, 'success');
  }
  hideSkillActionMenu();
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('qrClose')?.addEventListener('click', hideQRModal);
  document.getElementById('qrModal')?.addEventListener('click', (e)=>{
    if (e.target?.id === 'qrModal') hideQRModal();
  });
  document.getElementById('result')?.addEventListener('click', (e)=>{
    const skillBtn = e.target.closest('.extra-skill');
    if(skillBtn){
      e.preventDefault();
      e.stopPropagation();
      showSkillActionMenu(skillBtn.dataset.skill || skillBtn.textContent.trim(), skillBtn);
      return;
    }
  });
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('.result-action')) document.querySelectorAll('.result-action.open').forEach(el=>el.classList.remove('open'));
    if(!e.target.closest('.skill-action-menu') && !e.target.closest('.extra-skill')) hideSkillActionMenu();
  });
});

document.addEventListener('DOMContentLoaded', ()=>{
  bindShareButtons();
  applyStateFromURL();
});
