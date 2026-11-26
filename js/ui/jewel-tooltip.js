(function(){
  const tip = document.createElement('div');
  tip.className = 'jewel-tooltip';
  document.body.appendChild(tip);

  function showTip(el){
    const txt = el.getAttribute('data-tooltip');
    if(!txt) return;
    tip.textContent = txt;
    tip.classList.add('show');
    positionTip(el);
  }
  function hideTip(){ tip.classList.remove('show'); }

  function positionTip(el){
    const r = el.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const tipRect = tip.getBoundingClientRect();
    let cx = r.left + r.width/2;
    let x = Math.min(Math.max(cx, 8 + tipRect.width/2), vw - 8 - tipRect.width/2);
    let yAbove = r.top - tipRect.height - 8;
    let y = yAbove >= 8 ? yAbove : (r.bottom + 8);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  // Event delegation — ผูก listener ครั้งเดียวบน document แทน per-element
  // แก้ปัญหา listener สะสมทุกครั้งที่ renderResults() สร้างการ์ดใหม่

  // Mouse
  document.addEventListener('mouseover', e=>{
    const el=e.target.closest('.jewel-column[data-tooltip]');
    if(el) showTip(el);
  });
  document.addEventListener('mouseout', e=>{
    const el=e.target.closest('.jewel-column[data-tooltip]');
    if(el && !el.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener('mousemove', e=>{
    if(!tip.classList.contains('show')) return;
    const el=e.target.closest('.jewel-column[data-tooltip]');
    if(el) positionTip(el);
  });

  // Touch — long-press delegation (state รวมไว้ที่ module level)
  const LONG_PRESS_MS=450, MOVE_TOL=10;
  let lpTimer=null, longPressed=false, didMove=false, startX=0, startY=0, activeEl=null;
  function clearLP(){ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } }

  document.addEventListener('touchstart', e=>{
    const el=e.target.closest('.jewel-column[data-tooltip]');
    if(!el||e.touches.length!==1) return;
    const t=e.touches[0];
    activeEl=el; startX=t.clientX; startY=t.clientY;
    longPressed=false; didMove=false; clearLP();
    lpTimer=setTimeout(()=>{ longPressed=true; showTip(el); positionTip(el); },LONG_PRESS_MS);
  },{passive:true});

  document.addEventListener('touchmove', e=>{
    if(!activeEl) return;
    const t=e.touches[0];
    if(Math.abs(t.clientX-startX)>MOVE_TOL||Math.abs(t.clientY-startY)>MOVE_TOL){ didMove=true; clearLP(); }
  },{passive:true});

  document.addEventListener('touchend', ()=>{
    if(!activeEl) return;
    const el=activeEl; activeEl=null; clearLP();
    if(longPressed){ setTimeout(hideTip,1800); }
    else if(!didMove){
      if(tip.classList.contains('show')) hideTip();
      else { showTip(el); positionTip(el); setTimeout(hideTip,2500); }
    }
  },{passive:true});

  document.addEventListener('touchcancel',()=>{ clearLP(); hideTip(); activeEl=null; },{passive:true});

  // Keyboard
  document.addEventListener('focusin', e=>{
    const el=e.target.closest('.jewel-column[data-tooltip]');
    if(el){ if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0'); showTip(el); }
  });
  document.addEventListener('focusout', e=>{
    if(e.target.closest('.jewel-column[data-tooltip]')) hideTip();
  });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') hideTip(); });
})();
