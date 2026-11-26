/* ===== UX v3: keyboard shortcuts, char preview ===== */
(function(){
  // Sync theme icon on load (theme applied from <head> script)
  (function(){
    var btn = document.getElementById('themeToggle');
    if(!btn) return;
    var SVG_MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clip-rule="evenodd"/></svg>';
    var SVG_SUN  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"/></svg>';
    var saved; try{ saved=localStorage.getItem('theme'); }catch(e){}
    if(saved==='dark'||saved==='light'){ document.documentElement.setAttribute('data-theme',saved); }
    function syncThemeToggleVisual(){
      btn.innerHTML = document.documentElement.getAttribute('data-theme')==='dark' ? SVG_SUN : SVG_MOON;
      var menuLabel = document.getElementById('menuThemeLabel');
      if(menuLabel){ menuLabel.textContent = document.documentElement.getAttribute('data-theme')==='dark' ? 'ใช้โหมดสว่าง ☀️' : 'ใช้โหมดมืด 🌙'; }
    }
    window.syncThemeToggleVisual = syncThemeToggleVisual;
    syncThemeToggleVisual();
    btn.addEventListener('click', function(){
  var next = document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  syncThemeToggleVisual();

  trackEvent('toggle_theme', {
    theme: next
  });

  try{ localStorage.setItem('theme', next); }catch(e){ if(typeof showToast==='function') showToast('ไม่สามารถบันทึกธีมได้', 2500, 'warn'); }
});
  })();

  // ---- Character preview ----
  function updateCharPreview(){
    const cp = document.getElementById('charPreview');
    if (!cp) return;
    const sel = document.getElementById('charSelect');
    const name = sel ? (sel.value || '') : '';
    const nameEl = cp.querySelector('.cp-name');
    const jewelEl = cp.querySelector('.cp-jewel');
    if (!name){
      cp.classList.remove('show');
      return;
    }
    const linkId = findLinkJewelForChar(name)?.id || window.__charToLinkId?.[name] || '';
    if (nameEl) nameEl.textContent = name;
    if (jewelEl) jewelEl.textContent = linkId || 'ตัวละครนี้ไม่มีจี้ลิงก์';
    cp.classList.add('show');
  }
  // hook via polling (TomSelect init is async)
  document.addEventListener('DOMContentLoaded', ()=>{
    let tries = 0;
    const iv = setInterval(()=>{
      const sel = document.getElementById('charSelect');
      if (sel && sel.tomselect){
        sel.tomselect.on('change', updateCharPreview);
        clearInterval(iv);
      } else if (sel){
        sel.addEventListener('change', updateCharPreview);
      }
      if (++tries > 40) clearInterval(iv);
    }, 250);
  });

  // ---- Keyboard shortcuts ----
  document.addEventListener('keydown', (e)=>{
    // Esc -> close QR modal
    if (e.key === 'Escape'){
      hideQRModal();
      closeDonateModal();
      return;
    }
    // Enter while focused on topK -> calculate
    if (e.key === 'Enter' && e.target && e.target.id === 'topK'){
      e.preventDefault();
      const btn = document.getElementById('calcBtn');
      if (btn && !btn.disabled) btn.click();
    }
  });
})();
