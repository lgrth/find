(function(){
  const hintEl = document.getElementById('tooltipHint');
  function updateHint(){
    if(window.matchMedia('(max-width:768px)').matches){
      hintEl.textContent = "ⓘ แตะที่ชื่อจี้ เพื่อดูความสามารถของจี้";
    } else {
      hintEl.textContent = "ⓘ ลากเม้าส์ไปชี้ที่ชื่อจี้ เพื่อดูความสามารถของจี้";
    }
  }
  window.addEventListener('resize', updateHint);
  document.addEventListener('DOMContentLoaded', updateHint);
  updateHint();
})();
