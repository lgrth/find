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

  function matchesQuery(name, q){
    if (!q) return true;
    const keywords = window._abilityKeywords?.get(name) || [];
    return normalizeSearchText(name).includes(q) || keywords.some(k => k.includes(q) || q.includes(k));
  }

  const maxSelects = ()=> (typeof MAX_SELECTS !== 'undefined') ? MAX_SELECTS : 14;

  /* ---- one skill chip / one "+ ทุกแบบ" button, for the wanted or the unwanted list ---- */

  function wantedSkillChip(name){
    const max = maxSelects();
    const atMax = window._chipSelected.length >= max;
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
      if (disabled) return;
      if (isSel) removeAbility(name); else addAbility(name);
      refreshChips();
      notify();
    });
    return b;
  }

  function unwantedSkillChip(name){
    if (window._chipSelected.some(r => requirementsOverlap(r, name))) return null; // already wanted
    const isSel = window._chipUnwanted.includes(name);
    const coveredBy = !isSel && window._chipUnwanted.find(r => isGroupRequirement(r) && requirementsOverlap(r, name));
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (isSel ? ' is-unwanted' : '') + (coveredBy ? ' is-disabled is-covered' : '');
    b.textContent = name;
    b.title = isSel ? 'คลิกเพื่อเอาออก' : coveredBy ? `รวมอยู่ใน ${requirementLabel(coveredBy)} แล้ว` : 'คลิกเพื่อเพิ่มในรายการไม่ต้องการ';
    b.addEventListener('click', ()=>{
      if (coveredBy) return;
      if (isSel) removeUnwanted(name); else addUnwanted(name);
      refreshUnwantedChips();
    });
    return b;
  }

  /** "+ ทุกแบบ" button of a group header; null when the group cannot be picked whole. */
  function groupAllButton(g, mode){
    if (!g.pickable) return null;
    const req = groupRequirement(g.group);
    const list = mode === 'unwanted' ? window._chipUnwanted : window._chipSelected;
    if (mode === 'unwanted' && window._chipSelected.some(r => requirementsOverlap(r, req))) return null;
    const isSel = list.includes(req);
    const disabled = mode === 'wanted' && !isSel && window._chipSelected.length >= maxSelects();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-group-all' + (isSel ? (mode === 'unwanted' ? ' is-unwanted' : ' is-selected') : '') + (disabled ? ' is-disabled' : '');
    b.dataset.group = g.group;
    b.textContent = isSel ? '✓ ทุกแบบ' : '+ ทุกแบบ';
    b.setAttribute('aria-pressed', isSel ? 'true' : 'false');
    b.title = isSel ? 'คลิกเพื่อเอาออก'
      : disabled ? 'ครบ ' + maxSelects() + ' ความสามารถแล้ว'
      : mode === 'unwanted' ? `ไม่ต้องการทุกสกิลในกลุ่ม ${g.group}`
      : `เลือกทั้งกลุ่ม: สกิลไหนในกลุ่ม ${g.group} ก็ได้ (นับ 1 ช่อง)`;
    b.addEventListener('click', ()=>{
      if (disabled) return;
      if (mode === 'unwanted'){
        if (isSel) removeUnwanted(req); else addUnwanted(req);
        refreshUnwantedChips();
      } else {
        if (isSel) removeAbility(req); else addAbility(req);
        refreshChips();
        notify();
      }
    });
    return b;
  }

  /** Search results split under one heading per group (B). A group whose name matches shows all its skills. */
  function renderGroupedResults(wrap, q, mode){
    wrap.innerHTML = '';
    const makeChip = mode === 'unwanted' ? unwantedSkillChip : wantedSkillChip;
    let shown = 0;
    abilityGroupList().forEach(g => {
      const groupHit = g.group !== OTHER_GROUP && normalizeSearchText(g.group).includes(q);
      const chips = ALL_ABILITIES
        .filter(n => abilityOf(n)?.group === g.group && (groupHit || matchesQuery(n, q)))
        .map(makeChip).filter(Boolean);
      const allBtn = groupHit || chips.length ? groupAllButton(g, mode) : null;
      if (!chips.length && !allBtn) return;
      const sec = document.createElement('div');
      sec.className = 'chip-group-section';
      const head = document.createElement('div');
      head.className = 'chip-group-head';
      const title = document.createElement('span');
      title.className = 'chip-group-head__title';
      title.textContent = g.group === OTHER_GROUP ? g.group : `${g.group} · ${g.count}`;
      head.appendChild(title);
      if (allBtn) head.appendChild(allBtn);
      const list = document.createElement('div');
      list.className = 'chip-list chip-list--all';
      chips.forEach(c => list.appendChild(c));
      sec.append(head, list);
      wrap.appendChild(sec);
      shown += chips.length + (allBtn ? 1 : 0);
    });
    if (!shown) wrap.innerHTML = '<div class="chip-group-empty">ไม่พบสกิลที่ตรงกับคำค้น</div>';
  }

  function renderAll(){
    const wrap = document.getElementById('chipAll');
    const allWrap = document.getElementById('chipAllWrap');
    if (!wrap) return;
    const q = normalizeSearchText(document.getElementById('chipSearch')?.value || '');
    // While typing, the "browse by group" list steps aside (A ↔ B)
    const browse = document.getElementById('chipGroupBrowse');
    if (browse) browse.hidden = !!q || abilityGroupList().length < 2;
    if (allWrap){
      if (q) allWrap.removeAttribute('hidden'); else allWrap.setAttribute('hidden','');
    }
    if (!q){ wrap.innerHTML = ''; renderGroupBrowser(); return; }
    renderGroupedResults(wrap, q, 'wanted');
  }

  /* ---- "📂 เลือกจากกลุ่ม": folded list of groups, one open at a time (A) ---- */
  let browserOpen = false;
  let openGroup = '';

  function renderGroupBrowser(){
    const toggle = document.getElementById('chipGroupToggle');
    const list = document.getElementById('chipGroupList');
    if (!toggle || !list) return;
    const groups = abilityGroupList();
    if (openGroup && !groups.some(g => g.group === openGroup)) openGroup = '';
    toggle.setAttribute('aria-expanded', browserOpen ? 'true' : 'false');
    toggle.querySelector('.chip-group-toggle__count').textContent = `(${groups.length} กลุ่ม)`;
    toggle.querySelector('.chip-group-toggle__arrow').textContent = browserOpen ? '▲' : '▼';
    list.hidden = !browserOpen;
    list.innerHTML = '';
    if (!browserOpen) return;
    groups.forEach(g => {
      const isOpen = g.group === openGroup;
      const whole = window._chipSelected.includes(groupRequirement(g.group));
      const picked = whole ? 0 : window._chipSelected.filter(r => !isGroupRequirement(r) && abilityOf(r)?.group === g.group).length;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'chip-group-row' + (isOpen ? ' is-open' : '');
      row.dataset.group = g.group;
      row.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      row.innerHTML = `<span class="chip-group-row__name">${escapeHtml(g.group)} <small>${g.count}</small>`
        + (whole ? ' <span class="chip-group-row__mark">● ทุกแบบ</span>' : picked ? ` <span class="chip-group-row__mark">● ${picked}</span>` : '')
        + `</span><span class="chip-group-row__arrow" aria-hidden="true">${isOpen ? '⌄' : '›'}</span>`;
      row.addEventListener('click', ()=>{
        openGroup = isOpen ? '' : g.group;
        renderGroupBrowser();
      });
      list.appendChild(row);
      if (!isOpen) return;
      const panel = document.createElement('div');
      panel.className = 'chip-group-panel';
      const allBtn = groupAllButton(g, 'wanted');
      if (allBtn){ const head = document.createElement('div'); head.className = 'chip-group-head chip-group-head--panel'; head.appendChild(allBtn); panel.appendChild(head); }
      const chips = document.createElement('div');
      chips.className = 'chip-list chip-list--all';
      ALL_ABILITIES.filter(n => abilityOf(n)?.group === g.group).forEach(n => chips.appendChild(wantedSkillChip(n)));
      panel.appendChild(chips);
      list.appendChild(panel);
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
    if(!q){ wrap.innerHTML=''; return; }
    renderGroupedResults(wrap, q, 'unwanted');
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

  document.getElementById('chipGroupToggle')?.addEventListener('click', ()=>{
    browserOpen = !browserOpen;
    renderGroupBrowser();
  });

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
