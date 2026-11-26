/** === Feedback widget JS (isolated) === **/
const FEEDBACK_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwR1Y0RUrv-RsdjPhAtY-V_rXOmwE_9DkDTVUqq9htj8igeQvKU3Wl_F0uzp_HZRHiPiA/exec'; // <== ใส่ /exec ของคุณ

(function(){
  try{
    const $btn   = document.getElementById('fbBtn');
    const $modal = document.getElementById('fbModal');
    const $form  = document.getElementById('fbForm');
    const $note  = document.getElementById('fbNote'); // ยังเก็บไว้ แต่จะไม่ใช้แสดงผลหลักแล้ว
    if (!$btn || !$modal || !$form) return;

    $btn.style.pointerEvents = 'auto';
    $btn.style.zIndex = '999';

    const $spinner  = $form.querySelector('.fb-spinner');
    const $submit   = $form.querySelector('button[type="submit"]');
    const $closeEls = $modal.querySelectorAll('[data-fb-close]');

    function open(){
  trackEvent('open_feedback_form', {
    source: 'fb_button'
  });
  setDialogVisible($modal, true);
}
    function close(){ setDialogVisible($modal, false); if($note) $note.textContent=''; }

    $btn.addEventListener('click', open);
    $closeEls.forEach(el=> el.addEventListener('click', close));

  
    // -----------------------------------

    function getPageContext(){
      try{
        const f = readFilterState();
        return {
          pageURL: location.href,
          userAgent: navigator.userAgent,
          selectedAbilities: f.selected.join(', '),
          topK: f.topK ? Number(f.topK) : '',
          darkOnly: f.darkOnly
        };
      }catch(_){
        return { pageURL: location.href, userAgent: navigator.userAgent };
      }
    }


  // ===== Confirm helpers =====
  const $fbConfirm = document.getElementById('fbConfirm');
  const $fbConfirmOk = document.getElementById('fbConfirmOk');

  function openFbConfirm(){
    return new Promise((resolve)=>{
      if(!$fbConfirm){ return resolve(true); }
      setDialogVisible($fbConfirm, true);

      const cancelEls = $fbConfirm.querySelectorAll('[data-fbcancel]');
      const onCancel = ()=>{ cleanup(); resolve(false); };
      const onOk = ()=>{ cleanup(); resolve(true); };

      cancelEls.forEach(el=> el.addEventListener('click', onCancel, { once:true }));
      $fbConfirmOk && $fbConfirmOk.addEventListener('click', onOk, { once:true });

      function cleanup(){
        setDialogVisible($fbConfirm, false);
      }
    });
  }


    // === แก้ส่วน submit: เพิ่ม loading + toast ===
        $form.addEventListener('submit', async (ev)=>{
  ev.preventDefault();

  const ok = await openFbConfirm();
  if(!ok) return;

  if ($note) $note.textContent = '';

  const fd = new FormData($form);
  const ctx = getPageContext();
  fd.set('pageURL', ctx.pageURL || location.href);
  fd.set('userAgent', ctx.userAgent || navigator.userAgent);
  if (ctx.selectedAbilities != null) fd.set('selectedAbilities', String(ctx.selectedAbilities));
  if (ctx.topK != null) fd.set('topK', String(ctx.topK));
  if (ctx.darkOnly != null) fd.set('darkOnly', String(ctx.darkOnly));

  const msg = (fd.get('message') || '').toString().trim();
  if (!msg){
    trackEvent('submit_feedback_validation_error', {field: 'message'});
    showToast('กรุณากรอกข้อความก่อนส่ง', 2600, 'error');
    return;
  }

  if ($submit) $submit.disabled = true;
  if ($spinner) $spinner.hidden = false;

  showToast('กำลังส่งความคิดเห็น...', 10000, 'info', { closable:false });

  try{
    await fetch(FEEDBACK_WEBAPP_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: fd
    });
    trackEvent('submit_feedback_success', {
  category: (fd.get('category') || '').toString(),
  has_contact: !!(fd.get('contact') || '').toString().trim(),
  message_length: ((fd.get('message') || '').toString().trim()).length
});
    $form.reset();
    close();
    showToast('ส่งเรียบร้อย ขอบคุณมาก!', 2200, 'success');
  }catch(err){
    trackEvent('submit_feedback_error', {category: (fd.get('category') || '').toString()});
    showToast('ส่งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 2600, 'error');
  }finally{
    if ($submit) $submit.disabled = false;
    if ($spinner) $spinner.hidden = true;
  }
});
  }catch(e){
    console.error('[fb-widget]', e);
  }
})();
