// --- Tutorial bottom sheet + Guided first-run tutorial ---
(function(){
  const TUTORIAL_KEY = 'tutorial_autoshown_once_v1';
  const sheet = document.getElementById('tutorialSheet');
  const dialog = sheet?.querySelector('.tutorial-sheet__dialog');

  const guidedRoot = document.getElementById('guidedTour');
  const guidedSpotlight = document.getElementById('guidedSpotlight');
  const guidedCard = document.getElementById('guidedCard');
  const guidedTitle = document.getElementById('guidedTitle');
  const guidedDesc = document.getElementById('guidedDesc');
  const guidedStatus = document.getElementById('guidedStatus');
  const guidedEyebrow = document.getElementById('guidedEyebrow');
  const guidedBackBtn = document.getElementById('guidedBackBtn');
const guidedNextBtn = document.getElementById('guidedNextBtn');
const guidedSkipBtn = document.getElementById('guidedSkipBtn');
const guidedStepSkipBtn = document.getElementById('guidedStepSkipBtn');

const helpChoiceModal = document.getElementById('helpChoiceModal');
const helpChoiceSummary = document.getElementById('helpChoiceSummary');
const helpChoiceGuided = document.getElementById('helpChoiceGuided');
const helpChoiceClose = document.getElementById('helpChoiceClose');

  const IDLE_GUIDE_MS = 30000;
  const IDLE_TUTORIAL_MS = 120000;

  const chipSearchBox = document.querySelector('#chipSearch')?.closest('.chip-search-box');
  const calcBtn = document.getElementById('calcBtn');
  const calcBtn2 = document.getElementById('calcBtn2');

  let idleGuideTimer = null;
  let idleTimer = null;
  let pendingAutoShow = false;

  let guidedActive = false;
  let guidedIndex = 0;
  let guidedStartedAtLeastOnce = false;
  let actionSearchPickedDuringStep = false;
  let actionUnwantedOpenedDuringStep = false;
  let actionTopKPickedDuringStep = false;
  let waitingSearchResult = false;
  let lastHighlightedEl = null;

  function showSheet(){
    if(!sheet) return;
    sheet.classList.remove('hiding');
    sheet.classList.add('show');
    sheet.setAttribute('aria-hidden','false');
  }

  function hideSheet(){
    if(!sheet) return;
    if (sheet.classList.contains('hiding')) return;

    sheet.classList.remove('show');
    sheet.classList.add('hiding');
    sheet.setAttribute('aria-hidden','true');

    setTimeout(()=>{
      sheet.classList.remove('hiding');
    }, 500);

    resetIdleTutorialTimer();
  }

  function showHelpChoice(){
  if(!helpChoiceModal) return;
  helpChoiceModal.classList.add('show');
  helpChoiceModal.setAttribute('aria-hidden', 'false');
}

function hideHelpChoice(){
  if(!helpChoiceModal) return;
  helpChoiceModal.classList.remove('show');
  helpChoiceModal.setAttribute('aria-hidden', 'true');
}

  function getVisibleCalcButton(){
    return (calcBtn2 && calcBtn2.offsetParent !== null) ? calcBtn2 :
           (calcBtn && calcBtn.offsetParent !== null) ? calcBtn :
           (calcBtn2 || calcBtn);
  }

  function playIdleGuide(){
    if (sheet?.classList.contains('show')) return;
    if (guidedActive) return;

    const desiredCount = Array.isArray(window._chipSelected) ? window._chipSelected.length : 0;
    const targetEl = desiredCount < 4 ? chipSearchBox : getVisibleCalcButton();
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    chipSearchBox?.classList.remove('is-idle-guide');
    calcBtn?.classList.remove('is-idle-guide');
    calcBtn2?.classList.remove('is-idle-guide');

    void targetEl.offsetWidth;
    targetEl.classList.add('is-idle-guide');
  }

  function stopIdleGuide(){
    chipSearchBox?.classList.remove('is-idle-guide');
    calcBtn?.classList.remove('is-idle-guide');
    calcBtn2?.classList.remove('is-idle-guide');
  }

  function startIdleGuideTimer(){
    clearTimeout(idleGuideTimer);
    idleGuideTimer = setTimeout(()=>{
      playIdleGuide();
    }, IDLE_GUIDE_MS);
  }

  function resetIdleGuideTimer(){
    clearTimeout(idleGuideTimer);
    stopIdleGuide();
    startIdleGuideTimer();
  }

  function startIdleTutorialTimer(){
    clearTimeout(idleTimer);
    idleTimer = setTimeout(()=>{
      if (!sheet?.classList.contains('show') && !guidedActive) {
        showSheet();
      }
    }, IDLE_TUTORIAL_MS);
  }

  function resetIdleTutorialTimer(){
    clearTimeout(idleTimer);
    clearTimeout(idleGuideTimer);
    startIdleGuideTimer();
    startIdleTutorialTimer();
  }

  function markAutoShown(){
    localStorage.setItem(TUTORIAL_KEY, '1');
  }

  function shouldAutoShow(){
    return localStorage.getItem(TUTORIAL_KEY) !== '1';
  }

  function getTargetRect(el){
    const rect = el.getBoundingClientRect();
    const pad = 8;
    return {
      top: Math.max(8, rect.top - pad),
      left: Math.max(8, rect.left - pad),
      width: Math.min(window.innerWidth - 16, rect.width + pad * 2),
      height: rect.height + pad * 2,
      bottom: rect.bottom + pad
    };
  }

  function clearTargetHighlight(){
    if (lastHighlightedEl){
      lastHighlightedEl.classList.remove('guided-tour__target-ring');
      lastHighlightedEl = null;
    }
  }

  function applyTargetHighlight(el){
    clearTargetHighlight();
    if (!el) return;
    el.classList.add('guided-tour__target-ring');
    lastHighlightedEl = el;
  }

  function moveSpotlightAndCard(el){
  if (!el || !guidedSpotlight || !guidedCard) return;

  const rect = getTargetRect(el);
  guidedSpotlight.style.top = rect.top + 'px';
  guidedSpotlight.style.left = rect.left + 'px';
  guidedSpotlight.style.width = rect.width + 'px';
  guidedSpotlight.style.height = rect.height + 'px';

  const steps = getSteps();
  const step = steps[guidedIndex] || {};
  const placeBelow = ['result', 'favorite', 'menu', 'inventory'].includes(step.id);

  const cardWidth = Math.min(360, window.innerWidth - 24);
  const gap = 14;
  const viewportPad = 12;
  const cardHeight = guidedCard.offsetHeight || 220;

  let cardLeft = rect.left;
  if (cardLeft + cardWidth > window.innerWidth - viewportPad){
    cardLeft = window.innerWidth - cardWidth - viewportPad;
  }
  if (cardLeft < viewportPad) cardLeft = viewportPad;

  let cardTop;

  if (placeBelow){
    // Step 6-7: วางด้านล่าง spotlight เป็นค่า default
    cardTop = rect.bottom + gap;

    // ถ้าด้านล่างล้นจอ ค่อยดันขึ้นเท่าที่จำเป็น
    if (cardTop + cardHeight > window.innerHeight - viewportPad){
      cardTop = Math.max(viewportPad, window.innerHeight - cardHeight - viewportPad);
    }
  } else {
    // Step 1-5: วางด้านบน spotlight เป็นค่า default
    cardTop = rect.top - cardHeight - gap;

    // ถ้าด้านบนไม่พอ ค่อยชิดบนสุดของ viewport
    if (cardTop < viewportPad){
      cardTop = viewportPad;
    }

    // กันกรณี step ช่องค้นหาสกิลไม่ให้ card ลงไปทับผลลัพธ์เลือกสกิล
    const chipResultWrap = document.getElementById('chipAllWrap');
    const chipResultList = document.getElementById('chipAll');
    const isSearchStepTarget =
      el.id === 'chipSearch' ||
      el.id === 'chipSearchBox' ||
      el.closest?.('#chipSearchBox');

    if (isSearchStepTarget && chipResultWrap && !chipResultWrap.hidden && chipResultList){
      const chipRect = chipResultList.getBoundingClientRect();
      const cardBottom = cardTop + cardHeight;
      const overlapsChipList = cardTop < chipRect.bottom && cardBottom > chipRect.top;

      if (overlapsChipList){
        cardTop = Math.max(viewportPad, chipRect.top - cardHeight - gap);
      }
    }
  }

  guidedCard.style.top = cardTop + 'px';
  guidedCard.style.left = cardLeft + 'px';
}

  function scrollTargetIntoView(el){
  if (!el) return;

  const headerOffset = 90;
  const viewportPad = 12;
  const cardHeight = guidedCard?.offsetHeight || 220;
  const gap = 14;

  // เผื่อพื้นที่ด้านบนสำหรับ card ตั้งแต่แรก
  const desiredTopOffset = headerOffset + cardHeight + gap + viewportPad;

  const rect = el.getBoundingClientRect();
  const targetTop = window.scrollY + rect.top - desiredTopOffset;

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: 'smooth'
  });
}

  function getCharValue(){
  const sel = document.getElementById('charSelect');
  if (!sel) return '';

  const value = sel.tomselect
    ? (sel.tomselect.getValue() || '')
    : (sel.value || '');

  return String(value).trim();
}

  function getTopKValue(){
    const input = document.getElementById('topK');
    return (input?.value || '').trim();
  }

  function isWantedStepReady(){
    return Array.isArray(window._chipSelected) && window._chipSelected.length >= 4;
  }

  function isUnwantedStepReady(){
    return !!document.getElementById('chipUnwantedBody')?.classList.contains('open');
  }

  function isCharacterStepReady(){
    return !!getCharValue();
  }

  function isTopKStepReady(){
    return !!actionTopKPickedDuringStep;
  }

  function isMenuStepReady(){
    return !!window.isHeaderMenuOpen?.();
  }

  function isInventoryStepReady(){
    return !!window.isHeaderMenuOpen?.() && !!document.getElementById('menuInventoryBtn');
  }

  function getSteps(){
  return [
    {
      id: 'wanted',
      eyebrow: 'Step 1/6 • จำเป็น',
      title: 'เลือกสกิลที่ต้องการอย่างน้อย 4 สกิล',
      desc: 'พิมพ์ค้นหาสกิลในช่องนี้ แล้วกดเลือกสกิลที่ต้องการจากผลลัพธ์ด้านล่าง (เช่น หมวก, ป้องกัน)',
      target: () => document.getElementById('chipSearchBox') || document.getElementById('chipSearch'),
      ready: () => isWantedStepReady(),
      statusWaiting: `เลือกแล้ว ${Array.isArray(window._chipSelected) ? window._chipSelected.length : 0}/4 อัน — ต้องเลือกอย่างน้อย 4 สกิล`,
      statusReady: 'สกิลที่ต้องการขั้นต่ำ 4 สกิลแล้ว ไปต่อได้',
      optional: false,
      nextLabel: 'ถัดไป'
    },
    {
      id: 'unwanted',
      eyebrow: 'Step 2/6 • ไม่จำเป็น',
      title: 'แตะแถว “สกิลที่ไม่ต้องการ”',
      desc: 'แตะแถวนี้เพื่อเปิดช่องค้นหาสกิลที่ไม่อยากได้ ยังไม่ต้องเลือกสกิลก็ได้ แค่ให้เห็นว่าฟีเจอร์นี้อยู่ตรงไหน',
      target: () => document.getElementById('chipUnwantedHeader'),
      ready: () => isUnwantedStepReady() || actionUnwantedOpenedDuringStep,
      statusWaiting: 'กำลังรอให้คุณกดเปิดหัวข้อนี้',
      statusReady: 'แสดงส่วนสกิลที่ไม่ต้องการแล้ว ไปต่อได้',
      optional: true,
      nextLabel: 'ถัดไป'
    },
    {
      id: 'character',
      eyebrow: 'Step 3/6 • ไม่จำเป็น',
      title: 'ลองเลือกตัวละครได้จากตรงนี้',
      desc: 'ถ้าเลือกตัวละคร ระบบจะล็อกจี้ [ลิงก์] ให้อัตโนมัติ 1 ช่อง ขั้นตอนนี้ไม่บังคับ จะกดปุ่ม “ข้ามขั้นนี้” ก็ได้',
      target: () => document.querySelector('#charSelect + .ts-wrapper') || document.getElementById('charSelect'),
      ready: () => isCharacterStepReady(),
      statusWaiting: 'ยังไม่เลือกตัวละคร — จะข้ามขั้นนี้ก็ได้',
      statusReady: 'เลือกตัวละครแล้ว',
      optional: true,
      nextLabel: 'ถัดไป'
    },
    {
      id: 'search',
      eyebrow: 'Step 4/6 • จำเป็น',
      title: 'กดค้นหาเซ็ตจี้จริง',
      desc: 'ตอนนี้ลองกดปุ่มนี้ได้เลย ระบบจะเริ่มค้นหาเซ็ตจี้จากสิ่งที่คุณเลือกไว้ และจะไปขั้นถัดไปเมื่อผลลัพธ์ขึ้นแล้ว',
      target: () => getVisibleCalcButton(),
      ready: () => false,
      statusWaiting: 'กำลังรอให้คุณกดปุ่ม “ค้นหาเซ็ตจี้”',
      statusReady: 'กำลังรอผลลัพธ์...',
      optional: false,
      nextLabel: 'ถัดไป',
      manualAdvance: true
    },
    {
      id: 'result',
      eyebrow: 'Step 5/6',
      title: 'ผลลัพธ์จะขึ้นตรงนี้',
      desc: 'เซ็ตที่ต่างกันแค่จี้ชิ้นเดียวจะรวมอยู่ในการ์ดเดียว กด “⇄ อีก N แบบ” เพื่อสลับ แตะชื่อจี้เพื่อดูว่าจี้นั้นให้สกิลอะไร และเปลี่ยนจำนวนเซ็ตได้ที่ “แสดง Top 10” มุมขวา',
      target: () => document.getElementById('resultTitle') || document.getElementById('result'),
      ready: () => true,
      statusWaiting: 'นี่คือพื้นที่แสดงผลลัพธ์หลักของเว็บ',
      statusReady: 'เห็นจุดแสดงผลลัพธ์แล้ว ไปต่อได้',
      optional: false,
      nextLabel: 'ถัดไป'
    },
    {
      id: 'menu',
      eyebrow: 'Step 6/6',
      title: 'เมนูรวมเครื่องมือเพิ่มเติม',
      desc: 'กดปุ่มนี้เพื่อเปิดเมนู ซึ่งรวมคลังจี้ของฉัน, เซ็ตที่บันทึกไว้, วิธีใช้งาน และการเปลี่ยนธีม',
      target: () => document.getElementById('menuBtn'),
      ready: () => isMenuStepReady(),
      statusWaiting: 'กำลังรอให้คุณกดเปิดเมนู',
      statusReady: 'เปิดเมนูแล้ว ไปต่อได้เลย',
      optional: true,
      nextLabel: 'จบการแนะนำ'
    }
  ];
}

  function updateGuidedButtons(step){
  if (!guidedBackBtn || !guidedNextBtn || !guidedStepSkipBtn) return;

  guidedBackBtn.disabled = guidedIndex === 0;

  const canSkipStep = step.id === 'character';
  guidedStepSkipBtn.hidden = !canSkipStep;

  if (step.id === 'search'){
    guidedNextBtn.disabled = true;
    guidedNextBtn.textContent = 'รอกดค้นหา';
    return;
  }

  const ready = !!step.ready();

  if (canSkipStep){
    guidedNextBtn.disabled = !ready;
    guidedNextBtn.textContent = ready ? (step.nextLabel || 'ถัดไป') : 'เลือกแล้วค่อยไปต่อ';
    return;
  }

  guidedNextBtn.disabled = !ready;
  guidedNextBtn.textContent = step.nextLabel || 'ถัดไป';
}

  function updateGuidedStatus(step){
    if (!guidedStatus) return;
    const ready = !!step.ready();

    guidedStatus.classList.remove('is-ready','is-waiting');
    guidedStatus.classList.add(ready ? 'is-ready' : 'is-waiting');

    if (step.id === 'character' && !ready){
      guidedStatus.textContent = step.statusWaiting;
      return;
    }

    if (step.id === 'search' && waitingSearchResult){
      guidedStatus.classList.remove('is-ready','is-waiting');
      guidedStatus.classList.add('is-ready');
      guidedStatus.textContent = 'กดค้นหาแล้ว กำลังรอผลลัพธ์ขึ้น...';
      return;
    }

    guidedStatus.textContent = ready ? step.statusReady : step.statusWaiting;
  }

  function renderGuidedStep(){
    if (!guidedActive) return;

    const steps = getSteps();
    const step = steps[guidedIndex];
    if (!step) return;

    const target = step.target();
    if (!target){
      if (guidedIndex < steps.length - 1){
        guidedIndex += 1;
        renderGuidedStep();
      }
      return;
    }

    guidedEyebrow.textContent = step.eyebrow;
    guidedTitle.textContent = step.title;
    guidedDesc.textContent = step.desc;

    applyTargetHighlight(target);
    scrollTargetIntoView(target);

    setTimeout(()=>{
      if (!guidedActive) return;
      moveSpotlightAndCard(target);
    }, 260);

    updateGuidedStatus(step);
    updateGuidedButtons(step);
  }

  function openGuided(){
    if (!guidedRoot) return;
    guidedActive = true;
    guidedRoot.classList.add('show');
    guidedRoot.setAttribute('aria-hidden', 'false');
    stopIdleGuide();
    clearTimeout(idleGuideTimer);
    clearTimeout(idleTimer);
  }

  function closeGuided(options = {}){
    guidedActive = false;
    waitingSearchResult = false;
    guidedRoot?.classList.remove('show');
    guidedRoot?.setAttribute('aria-hidden', 'true');
    clearTargetHighlight();

    if (options.markDone){
      markAutoShown();
    }

    resetIdleTutorialTimer();
  }

  function startGuidedTutorial(){
    const steps = getSteps();
    if (!steps.length) return;

    guidedStartedAtLeastOnce = true;
    actionSearchPickedDuringStep = false;
    actionUnwantedOpenedDuringStep = false;
    actionTopKPickedDuringStep = false;
    waitingSearchResult = false;

    guidedIndex = 0;
    openGuided();
    renderGuidedStep();

    if (typeof trackEvent === 'function'){
      trackEvent('guided_tutorial_start', {
        source: 'first_visit'
      });
    }
  }

  function finishGuidedTutorial(){
    closeGuided({ markDone: true });

    if (typeof showToast === 'function'){
      showToast('พร้อมแล้ว ลองใช้งานต่อได้เลย', 2200, 'success');
    }

    if (typeof trackEvent === 'function'){
      trackEvent('guided_tutorial_complete', {
        completed: true
      });
    }
  }

  function skipGuidedTutorial(){
    closeGuided({ markDone: true });

    if (typeof trackEvent === 'function'){
      trackEvent('guided_tutorial_skip', {
        step_index: guidedIndex + 1
      });
    }
  }

  function goNext(){
  const steps = getSteps();
  const step = steps[guidedIndex];
  if (!step) return;

  if (guidedIndex >= steps.length - 1){
    finishGuidedTutorial();
    return;
  }

  guidedIndex += 1;
  renderGuidedStep();
}

  function goBack(){
    if (guidedIndex <= 0) return;
    guidedIndex -= 1;
    waitingSearchResult = false;
    renderGuidedStep();
  }

  function skipCurrentStep(){
  const steps = getSteps();
  const step = steps[guidedIndex];
  if (!step) return;

  if (step.id !== 'character') return;

  if (guidedIndex >= steps.length - 1){
    finishGuidedTutorial();
    return;
  }

  guidedIndex += 1;
  renderGuidedStep();
}

  function onWantedSelectionChanged(){
    if (!guidedActive) return;
    const step = getSteps()[guidedIndex];
    if (!step || step.id !== 'wanted') return;
    updateGuidedStatus(step);
    updateGuidedButtons(step);
  }

  function onUnwantedPanelOpened(){
    if (!guidedActive) return;
    actionUnwantedOpenedDuringStep = true;
    const step = getSteps()[guidedIndex];
    if (!step || step.id !== 'unwanted') return;
    updateGuidedStatus(step);
    updateGuidedButtons(step);
  }

  function onTopKPicked(){
    if (!guidedActive) return;
    actionTopKPickedDuringStep = true;
    const step = getSteps()[guidedIndex];
    if (!step || step.id !== 'topk') return;
    updateGuidedStatus(step);
    updateGuidedButtons(step);
  }

  function onCharacterPicked(){
  if (!guidedActive) return;
  const step = getSteps()[guidedIndex];
  if (!step || step.id !== 'character') return;

  updateGuidedStatus(step);
  updateGuidedButtons(step);
}

  function onSearchClicked(){
    if (!guidedActive) return;
    const step = getSteps()[guidedIndex];
    if (!step || step.id !== 'search') return;

    waitingSearchResult = true;
    updateGuidedStatus(step);
  }

  function onSearchCompleted(){
    if (!guidedActive) return;
    const step = getSteps()[guidedIndex];
    if (!step || step.id !== 'search') return;

    waitingSearchResult = false;
    guidedIndex += 1;
    renderGuidedStep();
  }

  function showAutoTutorialOnce(){
    if (!shouldAutoShow()) return;
    startGuidedTutorial();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    document.getElementById('tutorialClose')?.addEventListener('click', ()=> hideSheet());
    document.getElementById('tutorialGuidedLink')?.addEventListener('click', ()=>{
  hideSheet();
  startGuidedTutorial();

  if (typeof trackEvent === 'function'){
    trackEvent('open_tutorial_guided', {
      source: 'tutorial_sheet'
    });
  }
});
    sheet?.addEventListener('click', (e)=>{ if(e.target === sheet) hideSheet(); });

    let touchStartY = 0;
    dialog?.addEventListener('touchstart', (e)=>{ touchStartY = e.touches[0].clientY; }, {passive:true});
    dialog?.addEventListener('touchend', (e)=>{
      if(e.changedTouches[0].clientY - touchStartY > 80) hideSheet();
    }, {passive:true});

    guidedBackBtn?.addEventListener('click', goBack);
    guidedNextBtn?.addEventListener('click', goNext);
    guidedSkipBtn?.addEventListener('click', skipGuidedTutorial);
    guidedStepSkipBtn?.addEventListener('click', skipCurrentStep);

    helpChoiceSummary?.addEventListener('click', ()=>{
  hideHelpChoice();
  showSheet();

  if (typeof trackEvent === 'function'){
    trackEvent('open_tutorial_summary', {
      source: 'help_choice'
    });
  }
});

helpChoiceGuided?.addEventListener('click', ()=>{
  hideHelpChoice();
  startGuidedTutorial();

  if (typeof trackEvent === 'function'){
    trackEvent('open_tutorial_guided', {
      source: 'help_choice'
    });
  }
});

helpChoiceClose?.addEventListener('click', ()=>{
  hideHelpChoice();
});

helpChoiceModal?.addEventListener('click', (e)=>{
  if(e.target === helpChoiceModal){
    hideHelpChoice();
  }
});

    document.addEventListener('queueFirstVisitTutorial', ()=>{
      pendingAutoShow = true;
    });

    document.addEventListener('sheetLoadSuccessToastShown', ()=>{
      if (pendingAutoShow) {
        pendingAutoShow = false;
        setTimeout(()=>{
          showAutoTutorialOnce();
          resetIdleTutorialTimer();
        }, 2600);
        return;
      }

      resetIdleTutorialTimer();
    });

    const idleEvents = ['pointerdown','touchstart','keydown','input','change','focusin','wheel'];
    idleEvents.forEach((eventName)=>{
      document.addEventListener(eventName, () => {
        if (!guidedActive){
          stopIdleGuide();
          resetIdleTutorialTimer();
        }
      }, { passive: true });
    });

    setTimeout(()=>{
      resetIdleTutorialTimer();
    }, 3500);

    document.getElementById('helpBtn')?.addEventListener('click', ()=>{
  if (typeof trackEvent === 'function'){
    trackEvent('open_tutorial_menu', {
      source: 'help_button'
    });
  }
  showSheet();
});

    document.getElementById('chipSearch')?.addEventListener('input', ()=>{
  onWantedSelectionChanged();

  if (guidedActive){
    const step = getSteps()[guidedIndex];
    const target = step?.target?.();
    if (target){
      setTimeout(()=> moveSpotlightAndCard(target), 30);
    }
  }

  if (guidedActive){
    const step = getSteps()[guidedIndex];
    const target = step?.target?.();
    if (target){
      setTimeout(()=> moveSpotlightAndCard(target), 30);
    }
  }
});

const bindCharacterStepListener = () => {
  const sel = document.getElementById('charSelect');
  if (!sel) return false;

  if (sel.tomselect) {
    if (!sel.tomselect.__guidedCharacterBound) {
      sel.tomselect.on('change', () => {
        onCharacterPicked();
      });
      sel.tomselect.__guidedCharacterBound = true;
    }
    return true;
  }

  if (!sel.__guidedCharacterBound) {
    sel.addEventListener('change', () => {
      onCharacterPicked();
    });
    sel.__guidedCharacterBound = true;
  }
  return true;
};

bindCharacterStepListener();

let bindCharacterStepTry = 0;
const bindCharacterStepInterval = setInterval(() => {
  bindCharacterStepTry++;
  if (bindCharacterStepListener() || bindCharacterStepTry > 40) {
    clearInterval(bindCharacterStepInterval);
  }
}, 250);

    document.getElementById('chipUnwantedHeader')?.addEventListener('click', ()=>{
      onUnwantedPanelOpened();
    });


    getVisibleCalcButton()?.addEventListener('click', ()=>{
      onSearchClicked();
    });

    document.getElementById('calcBtn')?.addEventListener('click', ()=>{
      onSearchClicked();
    });

    document.getElementById('calcBtn2')?.addEventListener('click', ()=>{
      onSearchClicked();
    });

    document.addEventListener('guidedSearchCompleted', ()=>{
      onSearchCompleted();
    });

    document.addEventListener('headerMenuStateChange', ()=>{
      if (guidedActive){
        renderGuidedStep();
      }
    });

    window.addEventListener('resize', ()=>{
      if (guidedActive){
        renderGuidedStep();
      }
    });

    window.addEventListener('scroll', ()=>{
      if (guidedActive){
        const steps = getSteps();
        const step = steps[guidedIndex];
        const target = step?.target?.();
        if (target){
          moveSpotlightAndCard(target);
        }
      }
    }, { passive: true });

    document.addEventListener('click', ()=>{
      onWantedSelectionChanged();
    }, { passive: true });

    document.addEventListener('keydown', (e)=>{
      if (!guidedActive) return;
      if (e.key === 'Escape'){
        skipGuidedTutorial();
      }
    });
  });

  // expose for future use if needed
  window.startGuidedTutorial = startGuidedTutorial;
})();
