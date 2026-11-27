(function(){
  let _debTimer = null;
  function setHeaderOffset(){
    const h = document.querySelector('header');
    if(h) document.documentElement.style.setProperty('--header-h', Math.round(h.getBoundingClientRect().height) + 'px');
    const cta = document.querySelector('.cta-bar');
    if(cta) document.documentElement.style.setProperty('--cta-h', Math.round(cta.getBoundingClientRect().height) + 'px');
    setStickyPanelTop();
  }

  /* Desktop: the filter panel follows the page. When it is taller than the window its
   * top goes negative, so it scrolls until its bottom shows and then stays there.      */
  const panel = document.querySelector('main > section:first-of-type');
  function setStickyPanelTop(){
    if(!panel) return;
    const header = document.querySelector('header');
    const gap = 16;
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const top = Math.min(headerH + gap, window.innerHeight - panel.offsetHeight - gap);
    panel.style.setProperty('--sticky-top', Math.round(top) + 'px');
  }

  function debouncedSetHeaderOffset(){
    clearTimeout(_debTimer);
    _debTimer = setTimeout(setHeaderOffset, 100);
  }
  window.addEventListener('load', setHeaderOffset, {once:true});
  window.addEventListener('resize', debouncedSetHeaderOffset);
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(debouncedSetHeaderOffset); }
  if(panel && window.ResizeObserver){ new ResizeObserver(setStickyPanelTop).observe(panel); }
  setTimeout(setHeaderOffset, 250);
})();
