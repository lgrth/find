/* ===== UX v4: Chip picker — เป็นเจ้าของ state ผ่าน window._chipSelected ===== */
(function(){
  let ALL_ABILITIES = [];
  // source of truth — array ของชื่อความสามารถที่เลือก (สูงสุด MAX_SELECTS)
  window._chipSelected = [];

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function notify(){
    // แจ้ง main script ว่า state เปลี่ยน
    if (typeof updateCalcAvailability === 'function') updateCalcAvailability();
  }

  function addAbility(name){
    const sel = window._chipSelected;
    const max = (typeof MAX_SELECTS !== 'undefined') ? MAX_SELECTS : 14;
    if (sel.includes(name) || sel.length >= max) return false;
    sel.push(name);
    // auto-remove from unwanted if overlapping
    const uidx = window._chipUnwanted.indexOf(name);
    if(uidx !== -1){ window._chipUnwanted.splice(uidx, 1); refreshUnwantedChips(); }
    return true;
  }

  function removeAbility(name){
    const idx = window._chipSelected.indexOf(name);
    if (idx === -1) return false;
    window._chipSelected.splice(idx, 1);
    return true;
  }

  function renderSelected(){
  const wrap = document.getElementById('chipSelected');
  if (!wrap) return;

  wrap.innerHTML = '';

  if (!window._chipSelected.length){
    wrap.classList.add('is-hidden');
    return;
  }

  wrap.classList.remove('is-hidden');

  window._chipSelected.forEach(name => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip is-selected chip-entering';
    b.innerHTML = `<span>${escapeHtml(name)}</span><span class="chip-x" aria-hidden="true">×</span>`;
    b.title = 'คลิกเพื่อเอาออก';
    b.addEventListener('click', ()=>{
      removeAbility(name);
      refreshChips();
      notify();
    });
    wrap.appendChild(b);
    requestAnimationFrame(()=> requestAnimationFrame(()=> b.classList.remove('chip-entering')));
  });
}

  function renderAll(){
    const wrap = document.getElementById('chipAll');
    const allWrap = document.getElementById('chipAllWrap');
    if (!wrap) return;
    const q = normalizeSearchText(document.getElementById('chipSearch')?.value || '');
    // แสดง "ทั้งหมด" เฉพาะตอนมีคำค้นหา
    if (allWrap){
      if (q) allWrap.removeAttribute('hidden'); else allWrap.setAttribute('hidden','');
    }
    wrap.innerHTML = '';
    if (!q) return;
    const max = (typeof MAX_SELECTS !== 'undefined') ? MAX_SELECTS : 14;
    const atMax = window._chipSelected.length >= max;
    ALL_ABILITIES.forEach(name => {
      const normalizedName = normalizeSearchText(name);
      const keywords = window._abilityKeywords?.get(name) || [];

      const nameMatch = normalizedName.includes(q);
      const kwMatch = keywords.some(k => k.includes(q) || q.includes(k));

      if (!nameMatch && !kwMatch) return;
      const isSel = window._chipSelected.includes(name);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (isSel ? ' is-selected' : '') + ((!isSel && atMax) ? ' is-disabled' : '');
      b.textContent = name;
      b.title = isSel ? 'คลิกเพื่อเอาออก' : (atMax ? 'ครบ ' + max + ' ความสามารถแล้ว' : 'คลิกเพื่อเพิ่ม');
      if (!isSel && atMax) b.setAttribute('aria-disabled','true');
      b.addEventListener('click', ()=>{
        if (b.classList.contains('is-disabled')) return;
        if (isSel) removeAbility(name); else addAbility(name);
        refreshChips();
        notify();
      });
      wrap.appendChild(b);
    });
  }

  function refreshChips(){ renderSelected(); renderAll(); }

  window.buildChipPicker = function(options){
  ALL_ABILITIES = Array.from(options || []).sort();

  if (typeof setAbilityList === 'function'){
    setAbilityList(ALL_ABILITIES);
  }

  refreshChips();
};
  window.refreshChipPicker = refreshChips;

  // expose setChipState for applyStateFromURL
  window.setChipState = function(arr){
    window._chipSelected = Array.from(arr || []).slice(0, (typeof MAX_SELECTS !== 'undefined') ? MAX_SELECTS : 14);
    refreshChips();
    notify();
  };
  window.clearChipState = function(){
    window._chipSelected = [];
    window._chipUnwanted = [];
    refreshChips();
    refreshUnwantedChips();
    notify();
  };

  // ── Unwanted skills state ──
  window._chipUnwanted = [];

  function addUnwanted(name){
    if(window._chipUnwanted.includes(name)) return false;
    if(window._chipSelected.includes(name)) return false; // cannot overlap
    window._chipUnwanted.push(name);
    return true;
  }
  function removeUnwanted(name){
    const idx = window._chipUnwanted.indexOf(name);
    if(idx===-1) return false;
    window._chipUnwanted.splice(idx,1);
    return true;
  }
  function setUnwantedBodyOpen(isOpen){
    const body = document.getElementById('chipUnwantedBody');
    const btn = document.getElementById('chipUnwantedToggle');
    if(!body || !btn) return;
    body.classList.toggle('open', !!isOpen);
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.textContent = isOpen ? '▲ ซ่อน' : '▼ แสดง';
  }
  function renderUnwantedSelected(){
  const wrap = document.getElementById('chipUnwanted');
  if(!wrap) return;

  wrap.innerHTML = '';

  if(!window._chipUnwanted.length){
    wrap.classList.add('is-hidden');
    return;
  }

  wrap.classList.remove('is-hidden');
  setUnwantedBodyOpen(true);

  window._chipUnwanted.forEach(name=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip is-unwanted chip-entering';
    b.innerHTML = `<span>${escapeHtml(name)}</span><span class="chip-x" aria-hidden="true">×</span>`;
    b.title = 'คลิกเพื่อเอาออก';
    b.addEventListener('click', ()=>{
      removeUnwanted(name);
      refreshUnwantedChips();
    });
    wrap.appendChild(b);
    requestAnimationFrame(()=> requestAnimationFrame(()=> b.classList.remove('chip-entering')));
  });
}
  function renderUnwantedAll(){
    const wrap=document.getElementById('chipUnwantedAll');
    const allWrap=document.getElementById('chipUnwantedAllWrap');
    if(!wrap) return;
    const q = normalizeSearchText(document.getElementById('chipUnwantedSearch')?.value || '');
    if(allWrap){ if(q) allWrap.removeAttribute('hidden'); else allWrap.setAttribute('hidden',''); }
    wrap.innerHTML='';
    if(!q) return;
    ALL_ABILITIES.forEach(name=>{
      const normalizedName = normalizeSearchText(name);
const keywords = window._abilityKeywords?.get(name) || [];
const nameMatch = normalizedName.includes(q);
const kwMatch = keywords.some(k => k.includes(q) || q.includes(k));

if(!nameMatch && !kwMatch) return;
      if(window._chipSelected.includes(name)) return; // skip already-wanted
      const isSel=window._chipUnwanted.includes(name);
      const b=document.createElement('button');
      b.type='button'; b.className='chip'+(isSel?' is-unwanted':'');
      b.textContent=name;
      b.title=isSel?'คลิกเพื่อเอาออก':'คลิกเพื่อเพิ่มในรายการไม่ต้องการ';
      b.addEventListener('click',()=>{
        if(isSel) removeUnwanted(name); else addUnwanted(name);
        refreshUnwantedChips();
      });
      wrap.appendChild(b);
    });
  }
  function refreshUnwantedChips(){ renderUnwantedSelected(); renderUnwantedAll(); }
  window.refreshUnwantedChips = refreshUnwantedChips;
  window.setUnwantedState = function(arr){
    window._chipUnwanted = Array.from(arr||[]).filter(n=>!window._chipSelected.includes(n));
    refreshUnwantedChips();
  };

  document.addEventListener('DOMContentLoaded', ()=>{

  // === topK preset buttons ===
  (function(){
    const topKHidden = document.getElementById('topK');
    const topKHelp = document.getElementById('topKHelp');
    function setTopK(val){
      if(topKHidden){ topKHidden.value = val; topKHidden.classList.remove('is-invalid'); }
      document.querySelectorAll('.topk-preset').forEach(b => b.classList.toggle('active', b.dataset.val === String(val)));
      if(topKHelp) topKHelp.textContent = 'อยู่ในช่วง 3–50 พร้อมคำนวณ';
      if (typeof invalidateResultsForCriteriaChange === 'function') invalidateResultsForCriteriaChange();
    }
    document.querySelectorAll('.topk-preset').forEach(btn => btn.addEventListener('click', () => setTopK(btn.dataset.val)));
    if(topKHidden){ topKHidden.addEventListener('change', () => setTopK(topKHidden.value)); }
  })();

  const s = document.getElementById('chipSearch');
  const clr = document.getElementById('chipSearchClear');

  const us = document.getElementById('chipUnwantedSearch');
  const uclr = document.getElementById('chipUnwantedSearchClear');

  function resetSearchInputs(){
    if (s){
      s.value = '';
      if (clr) clr.hidden = true;
    }
    if (us){
      us.value = '';
      if (uclr) uclr.hidden = true;
    }
    renderAll();
    renderUnwantedAll();
  }

  // ล้างค่าทันทีตอนโหลดหน้า
  resetSearchInputs();

  // กัน browser restore ค่ากลับมาจาก bfcache / session restore
  window.addEventListener('pageshow', resetSearchInputs);

  if (s){
    s.addEventListener('input', ()=>{
      if(clr) clr.hidden = s.value === '';
      renderAll();
    });
  }
  if(clr){
    clr.addEventListener('click', ()=>{
      s.value = '';
      clr.hidden = true;
      s.focus();
      renderAll();
    });
  }

  // Unwanted search
  if(us){
    us.addEventListener('input', ()=>{
      if(uclr) uclr.hidden = us.value === '';
      renderUnwantedAll();
    });
  }
  if(uclr){
    uclr.addEventListener('click', ()=>{
      us.value = '';
      uclr.hidden = true;
      us.focus();
      renderUnwantedAll();
    });
  }
    // Toggle open/close
    document.getElementById('chipUnwantedHeader')?.addEventListener('click',()=>{
      const body=document.getElementById('chipUnwantedBody');
      const btn=document.getElementById('chipUnwantedToggle');
      if(!body||!btn) return;
      const open=body.classList.toggle('open');
      btn.textContent=open?'▲ ซ่อน':'▼ แสดง';
      btn.setAttribute('aria-expanded',String(open));
    });
  });
})();
