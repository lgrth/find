(function(){
  let _debTimer = null;
  function setHeaderOffset(){
    const h = document.querySelector('header');
    if(h) document.documentElement.style.setProperty('--header-h', Math.round(h.getBoundingClientRect().height) + 'px');
    const cta = document.querySelector('.cta-bar');
    if(cta) document.documentElement.style.setProperty('--cta-h', Math.round(cta.getBoundingClientRect().height) + 'px');
  }
  function debouncedSetHeaderOffset(){
    clearTimeout(_debTimer);
    _debTimer = setTimeout(setHeaderOffset, 100);
  }
  window.addEventListener('load', setHeaderOffset, {once:true});
  window.addEventListener('resize', debouncedSetHeaderOffset);
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(debouncedSetHeaderOffset); }
  setTimeout(setHeaderOffset, 250);
})();
