/* Hover tooltip for a pendant in the result cards (mouse only).
 * Tap / click / keyboard open the inline skill list instead (see renderResults in main.js). */
(function(){
  const tip = document.createElement('div');
  tip.className = 'jewel-tooltip';
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);

  const canHover = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : { matches: true };
  const SEL = '.jewel-column[data-tooltip]';

  function showTip(el){
    const txt = el.getAttribute('data-tooltip');
    if(!txt || el.classList.contains('is-open')) return;
    tip.textContent = txt;
    tip.classList.add('show');
    positionTip(el);
  }
  function hideTip(){ tip.classList.remove('show'); }

  function positionTip(el){
    const r = el.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const tipRect = tip.getBoundingClientRect();
    const cx = r.left + r.width/2;
    const x = Math.min(Math.max(cx, 8 + tipRect.width/2), vw - 8 - tipRect.width/2);
    const yAbove = r.top - tipRect.height - 8;
    const y = yAbove >= 8 ? yAbove : (r.bottom + 8);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  // Event delegation — one listener on document, cards are re-rendered often
  document.addEventListener('mouseover', e=>{
    if(!canHover.matches) return;
    const el = e.target.closest(SEL);
    if(el) showTip(el);
  });
  document.addEventListener('mouseout', e=>{
    const el = e.target.closest(SEL);
    if(el && !el.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener('click', e=>{ if(e.target.closest(SEL)) hideTip(); });
  document.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') hideTip(); });
})();
