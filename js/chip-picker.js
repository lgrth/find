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

  function toast(msg){ if (typeof showToast === 'function') showToast(msg, 2800, 'warn'); }

  function addAbility(name){
    const max = (typeof MAX_SELECTS !== 'undefined') ? MAX_SELECTS : 14;
    if (window._chipSelected.includes(name)) return false;
    const coveredBy = window._chipSelected.find(r => isGroupRequirement(r) && requirementsOverlap(r, name));
    if (coveredBy){ toast(`"${name}" อยู่ใน ${requirementLabel(coveredBy)} ที่เลือกไว้แล้ว`); return false; }
    // D5: picking a whole group absorbs its skills that were picked one by one
    const next = isGroupRequirement(name) ? window._chipSelected.filter(r => !requirementsOverlap(name, r)) : window._chipSelected.slice();
    const merged = window._chipSelected.length - next.length;
    if (next.length >= max) return false;
    next.push(name);
    window._chipSelected = next;
    const unwanted = window._chipUnwanted.filter(u => !requirementsOverlap(u, name));
    if (unwanted.length !== window._chipUnwanted.length){ window._chipUnwanted = unwanted; refreshUnwantedChips(); }
    if (merged) toast(`รวม ${merged} สกิลเป็น "${requirementLabel(name)}" แล้ว`);
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
    b.className = 'chip is-selected chip-entering' + (isGroupRequirement(name) ? ' chip--group' : '');
    b.innerHTML = `<span>${escapeHtml(requirementLabel(name))}</span><span class="chip-x" aria-hidden="true">×</span>`;
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

  // Group tab currently open under the search box ('' = none)
  let activeGroup = '';

  function matchesQuery(name, q){
    if (!q) return true;
    const keywords = window._abilityKeywords?.get(name) || [];
    return normalizeSearchText(name).includes(q) || keywords.some(k => k.includes(q) || q.includes(k));
  }

  /** Whole-group chips to offer: the open tab's group, or groups whose name matches the search. */
  function groupChoices(q, group){
    return abilityGroupList().filter(g => g.pickable &&
      (group ? g.group === group : (q && normalizeSearchText(g.group).includes(q))));
  }

  function makeGroupChip(g, isSel, disabled, title){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip chip--group' + (isSel ? ' is-selected' : '') + (disabled ? ' is-disabled' : '');
    b.textContent = `🗂 ${g.group} ทุกแบบ (${g.count})`;
    b.title = title;
    if (disabled) b.setAttribute('aria-disabled','true');
    return b;
  }

  function renderAll(){
    const wrap = document.getElementById('chipAll');
    const allWrap = document.getElementById('chipAllWrap');
    const title = document.getElementById('chipAllTitle');
    if (!wrap) return;
    const q = normalizeSearchText(document.getElementById('chipSearch')?.value || '');
    // Typing searches every skill; the group tabs (and an open tab) step aside meanwhile.
    const group = q ? '' : activeGroup;
    const tabs = document.getElementById('chipGroupTabsWrap');
    if (tabs) tabs.hidden = !!q;
    const open = !!(q || group);
    if (allWrap){
      if (open) allWrap.removeAttribute('hidden'); else allWrap.setAttribute('hidden','');
    }
    if (title) title.textContent = group ? `กลุ่ม ${activeGroup} — คลิกเพื่อเพิ่ม/เอาออก` : 'ผลการค้นหา — คลิกเพื่อเพิ่ม/เอาออก';
    wrap.innerHTML = '';
    if (!open) return;
    const max = (typeof MAX_SELECTS !== 'undefined') ? MAX_SELECTS : 14;
    const atMax = window._chipSelected.length >= max;

    groupChoices(q, group).forEach(g => {
      const req = groupRequirement(g.group);
      const isSel = window._chipSelected.includes(req);
      const disabled = !isSel && atMax;
      const b = makeGroupChip(g, isSel, disabled, isSel ? 'คลิกเพื่อเอาออก' : (disabled ? 'ครบ ' + max + ' ความสามารถแล้ว' : `เลือกทั้งกลุ่ม: สกิลไหนในกลุ่ม ${g.group} ก็ได้ (นับ 1 ช่อง)`));
      b.addEventListener('click', ()=>{
        if (b.classList.contains('is-disabled')) return;
        if (isSel) removeAbility(req); else addAbility(req);
        refreshChips();
        notify();
      });
      wrap.appendChild(b);
    });

    const names = group ? ALL_ABILITIES.filter(n => abilityOf(n)?.group === group) : ALL_ABILITIES;
    names.forEach(name => {
      if (!matchesQuery(name, q)) return;
      const isSel = window._chipSelected.includes(name);
      const coveredBy = !isSel && window._chipSelected.find(r => isGroupRequirement(r) && requirementsOverlap(r, name));
      const disabled = !isSel && (atMax || !!coveredBy);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (isSel ? ' is-selected' : '') + (disabled ? ' is-disabled' : '') + (coveredBy ? ' is-covered' : '');
      b.textContent = name;
      b.title = isSel ? 'คลิกเพื่อเอาออก' : coveredBy ? `รวมอยู่ใน ${requirementLabel(coveredBy)} แล้ว` : (atMax ? 'ครบ ' + max + ' ความสามารถแล้ว' : 'คลิกเพื่อเพิ่ม');
      if (disabled) b.setAttribute('aria-disabled','true');
      b.addEventListener('click', ()=>{
        if (b.classList.contains('is-disabled')) return;
        if (isSel) removeAbility(name); else addAbility(name);
        refreshChips();
        notify();
      });
      wrap.appendChild(b);
    });
  }

  /** Row of group tabs under the search box; clicking one lists that group's skills. */
  function renderGroupTabs(){
    const wrap = document.getElementById('chipGroupTabs');
    if (!wrap) return;
    const groups = abilityGroupList();
    if (activeGroup && !groups.some(g => g.group === activeGroup)) activeGroup = '';
    wrap.innerHTML = '';
    wrap.hidden = groups.length < 2;
    groups.forEach(g => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-group-tab' + (g.group === activeGroup ? ' active' : '');
      b.dataset.group = g.group;
      b.setAttribute('aria-pressed', g.group === activeGroup ? 'true' : 'false');
      b.textContent = `${g.group} (${g.count})`;
      b.addEventListener('click', ()=>{
        activeGroup = activeGroup === g.group ? '' : g.group;
        renderGroupTabs();
        renderAll();
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

  renderGroupTabs();
  refreshChips();
};
  window.refreshChipPicker = refreshChips;

  // expose setChipState for applyStateFromURL
  window.setChipState = function(arr){
    window._chipSelected = mergeRequirements(Array.from(arr || [])).slice(0, (typeof MAX_SELECTS !== 'undefined') ? MAX_SELECTS : 14);
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
    const wanted = window._chipSelected.find(r => requirementsOverlap(r, name));
    if(wanted){ toast(`ซ้ำกับสกิลที่ต้องการ: ${requirementLabel(wanted)}`); return false; } // cannot overlap
    const coveredBy = window._chipUnwanted.find(r => isGroupRequirement(r) && requirementsOverlap(r, name));
    if(coveredBy){ toast(`"${name}" อยู่ใน ${requirementLabel(coveredBy)} แล้ว`); return false; }
    // D5 + D7: a whole unwanted group absorbs its skills listed one by one
    window._chipUnwanted = isGroupRequirement(name) ? window._chipUnwanted.filter(u => !requirementsOverlap(name, u)) : window._chipUnwanted;
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
    b.className = 'chip is-unwanted chip-entering' + (isGroupRequirement(name) ? ' chip--group' : '');
    b.innerHTML = `<span>${escapeHtml(requirementLabel(name))}</span><span class="chip-x" aria-hidden="true">×</span>`;
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
    const overlapsWanted = (req)=> window._chipSelected.some(r => requirementsOverlap(r, req));
    abilityGroupList().filter(g => g.pickable && normalizeSearchText(g.group).includes(q)).forEach(g=>{
      const req = groupRequirement(g.group);
      if(overlapsWanted(req)) return; // a wanted skill is in this group
      const isSel = window._chipUnwanted.includes(req);
      const b = makeGroupChip(g, false, false, isSel ? 'คลิกเพื่อเอาออก' : `ไม่ต้องการทุกสกิลในกลุ่ม ${g.group}`);
      if(isSel) b.classList.add('is-unwanted');
      b.addEventListener('click',()=>{
        if(isSel) removeUnwanted(req); else addUnwanted(req);
        refreshUnwantedChips();
      });
      wrap.appendChild(b);
    });
    ALL_ABILITIES.forEach(name=>{
      if(!matchesQuery(name, q)) return;
      if(overlapsWanted(name)) return; // skip already-wanted
      const isSel=window._chipUnwanted.includes(name);
      const coveredBy = !isSel && window._chipUnwanted.find(r => isGroupRequirement(r) && requirementsOverlap(r, name));
      const b=document.createElement('button');
      b.type='button'; b.className='chip'+(isSel?' is-unwanted':'')+(coveredBy?' is-disabled is-covered':'');
      b.textContent=name;
      b.title=isSel?'คลิกเพื่อเอาออก':coveredBy?`รวมอยู่ใน ${requirementLabel(coveredBy)} แล้ว`:'คลิกเพื่อเพิ่มในรายการไม่ต้องการ';
      b.addEventListener('click',()=>{
        if(coveredBy) return;
        if(isSel) removeUnwanted(name); else addUnwanted(name);
        refreshUnwantedChips();
      });
      wrap.appendChild(b);
    });
  }
  function refreshUnwantedChips(){ renderUnwantedSelected(); renderUnwantedAll(); }
  window.refreshUnwantedChips = refreshUnwantedChips;
  window.setUnwantedState = function(arr){
    window._chipUnwanted = mergeRequirements(Array.from(arr||[])).filter(n=>!window._chipSelected.some(r=>requirementsOverlap(r, n)));
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
