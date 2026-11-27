(function(){
  function isHeaderMenuOpen(){ return !!document.getElementById('headerMenu')?.classList.contains('show'); }
  function dispatchHeaderMenuState(){ document.dispatchEvent(new CustomEvent('headerMenuStateChange', { detail: { open: isHeaderMenuOpen() } })); }
  function openHeaderMenu(){ const menu=document.getElementById('headerMenu'); const backdrop=document.getElementById('headerMenuBackdrop'); const btn=document.getElementById('menuBtn'); if(!menu||!backdrop||!btn) return; menu.hidden=false; backdrop.hidden=false; menu.classList.add('show'); backdrop.classList.add('show'); menu.setAttribute('aria-hidden','false'); btn.setAttribute('aria-expanded','true'); dispatchHeaderMenuState(); }
  function closeHeaderMenu(){ const menu=document.getElementById('headerMenu'); const backdrop=document.getElementById('headerMenuBackdrop'); const btn=document.getElementById('menuBtn'); if(!menu||!backdrop||!btn) return; menu.classList.remove('show'); backdrop.classList.remove('show'); menu.setAttribute('aria-hidden','true'); menu.hidden=true; backdrop.hidden=true; btn.setAttribute('aria-expanded','false'); dispatchHeaderMenuState(); }
  function toggleHeaderMenu(){ if(isHeaderMenuOpen()) closeHeaderMenu(); else openHeaderMenu(); }
  function openInventoryModal(){ const modal=document.getElementById('inventoryModal'); if(!modal) return; renderInventoryLists(); setDialogVisible(modal, true); setTimeout(()=>document.getElementById('inventorySearchInput')?.focus(),0); if(typeof trackEvent==='function') trackEvent('inventory_open',{owned_count:getOwnedCount()}); }
  function closeInventoryModal(){ const modal=document.getElementById('inventoryModal'); if(!modal) return; setDialogVisible(modal, false); }
  window.openHeaderMenu=openHeaderMenu; window.closeHeaderMenu=closeHeaderMenu; window.isHeaderMenuOpen=isHeaderMenuOpen; window.openInventoryModal=openInventoryModal; window.closeInventoryModal=closeInventoryModal;
  function openTransferModal(){
  const modal = document.getElementById('transferModal');
  if(!modal) return;
  updateTransferSummaryUI();
  resetImportPreview();
  setDialogVisible(modal, true);
}
function closeTransferModal(){
  const modal = document.getElementById('transferModal');
  if(!modal) return;
  setDialogVisible(modal, false);
}
window.openTransferModal = openTransferModal;
window.closeTransferModal = closeTransferModal;

  document.addEventListener('DOMContentLoaded',()=>{ window._ownedJewelIds=readOwnedJewelIds(); updateInventoryMenuMeta(); syncInventoryResultFilterUI();
    document.getElementById('menuBtn')?.addEventListener('click',(e)=>{ e.stopPropagation(); toggleHeaderMenu(); });
    document.getElementById('headerMenuBackdrop')?.addEventListener('click', closeHeaderMenu);
    document.addEventListener('click',(e)=>{ if(!isHeaderMenuOpen()) return; const menu=document.getElementById('headerMenu'); const btn=document.getElementById('menuBtn'); if(menu?.contains(e.target) || btn?.contains(e.target)) return; closeHeaderMenu(); });
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && isHeaderMenuOpen()) closeHeaderMenu(); });
    document.getElementById('menuInventoryBtn')?.addEventListener('click',()=>{ closeHeaderMenu(); openInventoryModal(); });
    document.getElementById('menuFavoritesBtn')?.addEventListener('click',()=>{ closeHeaderMenu(); document.getElementById('favoriteBtn')?.click(); });
    document.getElementById('menuTransferBtn')?.addEventListener('click',()=>{closeHeaderMenu();openTransferModal();});
    document.getElementById('menuTutorialBtn')?.addEventListener('click',()=>{ closeHeaderMenu(); document.getElementById('helpBtn')?.click(); });
    document.getElementById('menuThemeBtn')?.addEventListener('click',()=>{ document.getElementById('themeToggle')?.click(); closeHeaderMenu(); });
    document.getElementById('menuFeedbackBtn')?.addEventListener('click',()=>{ closeHeaderMenu(); document.getElementById('fbBtn')?.click(); });
    document.getElementById('menuDonateBtn')?.addEventListener('click',()=>{ closeHeaderMenu(); if(typeof openDonateModal === 'function') openDonateModal('header_menu'); });
    document.getElementById('inventoryClose')?.addEventListener('click', closeInventoryModal);
    document.getElementById('inventoryModal')?.addEventListener('click',(e)=>{ if(e.target?.id==='inventoryModal') closeInventoryModal(); });
    document.getElementById('inventorySelectAll')?.addEventListener('click',()=>{
  const visibleJewelIds = getInventoryVisibleNames();

  if(!visibleJewelIds.length){
    showToast('ไม่พบจี้จากคำค้นหานี้ให้เลือก', 1800, 'info');
    return;
  }

  const previousOwnedIds = Array.from(window._ownedJewelIds || []);
  const previousOwnedSet = new Set(previousOwnedIds);

  visibleJewelIds.forEach(id => {
    window._ownedJewelIds.add(id);
  });

  const addedCount = visibleJewelIds.filter(id => !previousOwnedSet.has(id)).length;

  if(addedCount === 0){
    showToast(`จี้จากผลค้นหานี้ถูกเลือกไว้ครบแล้ว (${visibleJewelIds.length} ชิ้น)`, 2200, 'info');
    return;
  }

  saveOwnedJewelIds();
  renderInventoryLists();
  refreshResultsForInventory();
  updateTransferSummaryUI();

  showToast(`เลือกจี้จากผลค้นหาแล้ว ${addedCount} ชิ้น`, 4200, 'success', {
    actionLabel: 'Undo',
    onAction: () => {
      window._ownedJewelIds = new Set(previousOwnedIds);
      saveOwnedJewelIds();
      renderInventoryLists();
      refreshResultsForInventory();
      updateTransferSummaryUI();
      showToast('ย้อนกลับการเลือกจากผลค้นหาแล้ว', 2200, 'success');
    }
  });
});
    document.getElementById('inventoryClearAll')?.addEventListener('click',()=>{ if(!getOwnedCount()){ showToast('ยังไม่มีจี้ในคลังให้ล้าง',1800,'info'); return; } if(!confirm('ล้างจี้ที่มีอยู่ทั้งหมดในคลัง?')) return; const previousOwnedIds = Array.from(window._ownedJewelIds || []); window._ownedJewelIds=new Set(); saveOwnedJewelIds(); renderInventoryLists(); refreshResultsForInventory(); updateTransferSummaryUI(); showToast('ล้างคลังจี้แล้ว',4200,'success',{ actionLabel:'Undo', onAction:()=>{ window._ownedJewelIds = new Set(previousOwnedIds); saveOwnedJewelIds(); renderInventoryLists(); refreshResultsForInventory(); updateTransferSummaryUI(); showToast('กู้คืนคลังจี้แล้ว',2200,'success'); } }); });
    document.getElementById('inventorySearchInput')?.addEventListener('input',(e)=>{ const clearBtn=document.getElementById('inventorySearchClear'); if(clearBtn) clearBtn.hidden=!e.target.value; renderInventoryLists(); });
    document.getElementById('inventorySearchClear')?.addEventListener('click',()=>{ const input=document.getElementById('inventorySearchInput'); const clearBtn=document.getElementById('inventorySearchClear'); if(input) input.value=''; if(clearBtn) clearBtn.hidden=true; renderInventoryLists(); input?.focus(); });
    document.getElementById('inventoryOwnedList')?.addEventListener('click',(e)=>{ const btn=e.target.closest('[data-jewel-id]'); if(btn) toggleOwnedJewel(btn.dataset.jewelId); });
    document.getElementById('inventoryAllList')?.addEventListener('click',(e)=>{ const btn=e.target.closest('[data-jewel-id]'); if(btn) toggleOwnedJewel(btn.dataset.jewelId); });
    document.getElementById('inventoryResultFilters')?.addEventListener('click',(e)=>{ const btn=e.target.closest('.inventory-result-filter'); if(!btn) return; window._inventoryResultFilterMode=btn.dataset.filter||'all'; syncInventoryResultFilterUI(); if(Array.isArray(window._latestComputedResults) && window._latestComputedResults.length && typeof window.renderResults==='function'){ window.renderResults(window._latestComputedResults,{skipTracking:true}); } });
    document.getElementById('transferClose')?.addEventListener('click', closeTransferModal);
document.getElementById('transferModal')?.addEventListener('click',(e)=>{
  if(e.target?.id === 'transferModal') closeTransferModal();
});

document.getElementById('exportAllBtn')?.addEventListener('click', exportAllUserData);

document.getElementById('importPickBtn')?.addEventListener('click', ()=>{
  document.getElementById('importFileInput')?.click();
});

document.getElementById('importFileInput')?.addEventListener('change', async (e)=>{
  const file = e.target?.files?.[0];
  if(!file){
    resetImportPreview();
    return;
  }

  try{
    const filename = sanitizePlainString(file.name || 'backup.json', 120).toLowerCase();

    if(!filename.endsWith('.json')){
      throw new Error('รองรับเฉพาะไฟล์ .json');
    }

    if(file.size > MAX_IMPORT_FILE_SIZE){
      throw new Error('ไฟล์ใหญ่เกินไป');
    }

    const text = await file.text();

    if(text.length > MAX_IMPORT_FILE_SIZE * 2){
      throw new Error('ไฟล์ใหญ่เกินไป');
    }

    const rawPayload = JSON.parse(text);
    const payload = normalizeTransferPayload(rawPayload);

    showImportPreview(payload, file.name);
    showToast('อ่านไฟล์สำเร็จ เลือกรูปแบบการนำเข้าได้เลย', 2200, 'success');
  }catch(err){
    console.error('[transfer][read import]', err);
    resetImportPreview();
    showToast(`ไฟล์ JSON ไม่ถูกต้องหรือไม่รองรับ: ${err?.message || err}`, 3600, 'error');
  }
});

document.getElementById('importMergeBtn')?.addEventListener('click', ()=>{
  try{
    if(!pendingImportPayload){
      showToast('กรุณาเลือกไฟล์ก่อน', 1800, 'warn');
      return;
    }
    const ok = confirm('นำเข้าข้อมูลแบบรวมกับข้อมูลเดิม?');
    if(!ok) return;

    if(applyImportedPayload(pendingImportPayload, 'merge')){
      updateTransferSummaryUI();
    }
  }catch(err){
    console.error('[transfer][merge import]', err);
    showToast(`Import ไม่สำเร็จ: ${err?.message || err}`, 4200, 'error');
  }
});

document.getElementById('importReplaceBtn')?.addEventListener('click', ()=>{
  try{
    if(!pendingImportPayload){
      showToast('กรุณาเลือกไฟล์ก่อน', 1800, 'warn');
      return;
    }
    const ok = confirm('นำเข้าข้อมูลแบบแทนที่ทั้งหมด?\n\nข้อมูลเดิมในเครื่องนี้จะถูกแทนที่ทั้งหมด');
    if(!ok) return;

    if(applyImportedPayload(pendingImportPayload, 'replace')){
      updateTransferSummaryUI();
    }
  }catch(err){
    console.error('[transfer][replace import]', err);
    showToast(`Import ไม่สำเร็จ: ${err?.message || err}`, 4200, 'error');
  }
});
  });
})();
