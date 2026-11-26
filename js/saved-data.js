/* ===== Favorite filter presets (localStorage) ===== */
const RESULT_SET_STORAGE_KEY = 'lgr_saved_result_sets_v1';

function readResultSetStore(){
  try{
    const raw = localStorage.getItem(RESULT_SET_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if(parsed && Array.isArray(parsed.items)) return parsed;
  }catch(e){}
  return { version: 1, items: [] };
}

function writeResultSetStore(store){
  try{
    localStorage.setItem(RESULT_SET_STORAGE_KEY, JSON.stringify(store));
    return true;
  }catch(e){
    showToast('ไม่สามารถบันทึกเซ็ตจี้ได้', 3000, 'warn');
    return false;
  }
}

const TRANSFER_FILE_APP = 'lgrth-find';
const TRANSFER_FILE_VERSION = 1;

const MAX_IMPORT_FILE_SIZE = 200 * 1024; // 200KB
const MAX_IMPORT_INVENTORY_ITEMS = 1500;
const MAX_IMPORT_FAVORITES = 150;
const MAX_IMPORT_RESULT_SETS = 150;
const MAX_SHARE_PACKED_LENGTH = 2500;
const MAX_SHARE_JSON_LENGTH = 12000;

let pendingImportPayload = null;

function sanitizeIsoDateString(value){
  const text = sanitizePlainString(value, 40);
  if(!text) return '';
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function sanitizePlainObject(value){
  if(!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function getFavoriteStoreForTransfer(){
  const store = typeof window.readFavoriteStoreForTransfer === 'function'
    ? window.readFavoriteStoreForTransfer()
    : { version: 1, presets: [] };

  return {
    version: Number(store?.version) || 1,
    presets: Array.isArray(store?.presets) ? store.presets : []
  };
}

function getInventoryStoreForTransfer(){
  const ids = Array.from(window._ownedJewelIds || readOwnedJewelIds?.() || []);
  return {
    version: 1,
    ids: ids.filter(Boolean)
  };
}

function buildTransferPayload(){
  return {
    app: TRANSFER_FILE_APP,
    version: TRANSFER_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    inventory: getInventoryStoreForTransfer(),
    favorites: getFavoriteStoreForTransfer(),
    resultSets: readResultSetStore()
  };
}

function downloadJSONFile(filename, data){
  const safeFilename = sanitizePlainString(filename || 'lgrfind-backup.json', 120)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-');

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = safeFilename.endsWith('.json') ? safeFilename : `${safeFilename}.json`;
  document.body.appendChild(a);
  a.click();
  // Defer cleanup: some browsers (Safari/Firefox) cancel the download if the
  // object URL is revoked in the same tick as the click.
  setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); }, 0);
}

function cryptoRandomId(prefix = 'id'){
  try{
    const arr = new Uint32Array(2);
    crypto.getRandomValues(arr);
    return `${prefix}_${arr[0].toString(36)}${arr[1].toString(36)}`;
  }catch(_){
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function normalizeFavoritePreset(item){
  const src = sanitizePlainObject(item);
  const state = sanitizePlainObject(src.state);
  // Older presets kept the fields at the top level, newer ones under .state.
  const filter = normalizeFilterState({
    selected: Array.isArray(src.selected) ? src.selected : state.selected,
    unwanted: Array.isArray(src.unwanted) ? src.unwanted : state.unwanted,
    topK: src.topK ?? state.topK,
    jewelTypes: src.jewelTypes ?? state.jewelTypes,
    darkOnly: src.darkOnly ?? state.darkOnly,
    char: src.char ?? state.char ?? ''
  });

  return {
    id: sanitizePlainString(src.id || cryptoRandomId('fav'), 80),
    name: sanitizePlainString(src.name || 'Filter ที่บันทึกไว้', 80),
    createdAt: sanitizeIsoDateString(src.createdAt) || new Date().toISOString(),
    ...filter,
    state: { ...filter }
  };
}

function normalizeResultSetItem(item){
  const src = sanitizePlainObject(item);
  const snapshot = sanitizePlainObject(src.snapshot);

  const names = sanitizeStringArray(
    Array.isArray(src.names) ? src.names : snapshot.names,
    4,
    160
  );

  const key = sanitizePlainString(src.key || snapshot.key || names.join('|'), 260);

  return {
    id: sanitizePlainString(src.id || cryptoRandomId('set'), 80),
    name: sanitizePlainString(src.name || 'เซ็ตจี้ที่บันทึกไว้', 100),
    key,
    createdAt: sanitizeIsoDateString(src.createdAt) || new Date().toISOString(),
    snapshot: {
      key,
      names,
      rank: clampNumber(snapshot.rank, 1, 999, 0),
      matchedCount: clampNumber(snapshot.matchedCount, 0, 99, 0),
      missingCount: clampNumber(snapshot.missingCount, 0, 99, 0),
      extraCount: clampNumber(snapshot.extraCount, 0, 999, 0),
      totalValue: Number.isFinite(Number(snapshot.totalValue)) ? Number(snapshot.totalValue) : 0
    }
  };
}

function normalizeTransferPayload(payload){
  if(!payload || typeof payload !== 'object' || Array.isArray(payload)){
    throw new Error('ไฟล์ไม่ถูกต้อง');
  }

  if(payload.app !== TRANSFER_FILE_APP){
    throw new Error('ไฟล์นี้ไม่ใช่ข้อมูลจากระบบนี้');
  }

  const inventory = sanitizePlainObject(payload.inventory);
  const favorites = sanitizePlainObject(payload.favorites);
  const resultSets = sanitizePlainObject(payload.resultSets);

  const safeInventoryIds = sanitizeStringArray(
    inventory.ids,
    MAX_IMPORT_INVENTORY_ITEMS,
    160
  );

  const safeFavorites = Array.isArray(favorites.presets)
    ? favorites.presets
        .slice(0, MAX_IMPORT_FAVORITES)
        .map(normalizeFavoritePreset)
        .filter(item => item.name || item.selected.length || item.state.selected.length)
    : [];

  const safeResultSets = Array.isArray(resultSets.items)
    ? resultSets.items
        .slice(0, MAX_IMPORT_RESULT_SETS)
        .map(normalizeResultSetItem)
        .filter(item => item.snapshot.names.length)
    : [];

  return {
    app: TRANSFER_FILE_APP,
    version: clampNumber(payload.version, 1, 99, 1),
    exportedAt: sanitizeIsoDateString(payload.exportedAt),
    inventory: {
      version: clampNumber(inventory.version, 1, 99, 1),
      ids: safeInventoryIds
    },
    favorites: {
      version: clampNumber(favorites.version, 1, 99, 1),
      presets: safeFavorites
    },
    resultSets: {
      version: clampNumber(resultSets.version, 1, 99, 1),
      items: safeResultSets
    }
  };
}

function mergeByKey(list, getKey, maxItems = 1000){
  const map = new Map();
  list.forEach(item=>{
    const key = sanitizePlainString(getKey(item), 1000);
    if(!key) return;
    map.set(key, item);
  });
  return Array.from(map.values()).slice(0, maxItems);
}

function makeResultSetMergeKey(item){
  return sanitizePlainString(item?.key || item?.snapshot?.key || item?.id || '', 1000);
}

function summarizeTransferPayload(payload){
  return {
    inventoryCount: payload.inventory.ids.length,
    favoriteCount: payload.favorites.presets.length,
    resultSetCount: payload.resultSets.items.length
  };
}

function exportAllUserData(){
  const payload = normalizeTransferPayload(buildTransferPayload());
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0'),
    '-',
    String(d.getHours()).padStart(2,'0'),
    String(d.getMinutes()).padStart(2,'0')
  ].join('');
  downloadJSONFile(`lgrfind-${stamp}.json`, payload);
  showToast('Export ข้อมูลเรียบร้อยแล้ว', 2200, 'success');
}

function applyImportedPayload(payload, mode){
  const previousOwnedIds = Array.from(window._ownedJewelIds || []);
  const previousFavStore = getFavoriteStoreForTransfer();
  const previousResultSetStore = readResultSetStore();

  const incoming = normalizeTransferPayload(payload);

  let nextOwnedIds;
  let nextFavStore;
  let nextResultSetStore;

  if(mode === 'replace'){
    nextOwnedIds = incoming.inventory.ids;
    nextFavStore = { version: 1, presets: incoming.favorites.presets.slice() };
    nextResultSetStore = { version: 1, items: incoming.resultSets.items.slice() };
  }else{
    nextOwnedIds = Array.from(new Set([
      ...previousOwnedIds,
      ...incoming.inventory.ids
    ]));

    nextFavStore = {
    version: 1,
    presets: mergeByKey(
      [...previousFavStore.presets, ...incoming.favorites.presets],
      item => item?.id || item?.name || JSON.stringify(item?.state || {}),
      MAX_IMPORT_FAVORITES
    )
  };

    nextResultSetStore = {
      version: 1,
      items: mergeByKey(
        [...previousResultSetStore.items, ...incoming.resultSets.items],
        makeResultSetMergeKey,
        MAX_IMPORT_RESULT_SETS
      )
    };
  }

  window._ownedJewelIds = new Set(nextOwnedIds);

  if(typeof saveOwnedJewelIds === 'function'){
    saveOwnedJewelIds();
  }else if(typeof writeOwnedJewelIds === 'function'){
    writeOwnedJewelIds(window._ownedJewelIds);
  }

  if(typeof window.writeFavoriteStoreForTransfer === 'function'){
    if(!window.writeFavoriteStoreForTransfer(nextFavStore)) return false;
  }

  if(!writeResultSetStore(nextResultSetStore)) return false;

  try{
  if(typeof renderInventoryLists === 'function') renderInventoryLists();
  if(typeof window.renderFavoritesForTransfer === 'function') window.renderFavoritesForTransfer();
  if(typeof renderSavedResultSets === 'function') renderSavedResultSets();
  if(typeof updateInventoryMenuMeta === 'function') updateInventoryMenuMeta();
  if(typeof refreshResultsForInventory === 'function') refreshResultsForInventory();
  if(typeof updateTransferSummaryUI === 'function') updateTransferSummaryUI();
}catch(err){
  console.error('[transfer][refresh after import]', err);
  showToast(`นำเข้าข้อมูลแล้ว แต่รีเฟรชหน้าจอไม่สำเร็จ: ${err?.message || err}`, 4200, 'warn');
  return false;
}

showToast(
  mode === 'replace' ? 'นำเข้าข้อมูลแบบแทนที่ทั้งหมดแล้ว' : 'นำเข้าข้อมูลแบบรวมกับข้อมูลเดิมแล้ว',
  5200,
  'success',
  {
    actionLabel: 'Undo',
    onAction: ()=>{
      try{
        window._ownedJewelIds = new Set(previousOwnedIds);

        if(typeof saveOwnedJewelIds === 'function'){
          saveOwnedJewelIds();
        }

        if(typeof window.writeFavoriteStoreForTransfer === 'function'){
          window.writeFavoriteStoreForTransfer(previousFavStore);
        }

        writeResultSetStore(previousResultSetStore);

        if(typeof renderInventoryLists === 'function') renderInventoryLists();
        if(typeof window.renderFavoritesForTransfer === 'function') window.renderFavoritesForTransfer();
        if(typeof renderSavedResultSets === 'function') renderSavedResultSets();
        if(typeof updateInventoryMenuMeta === 'function') updateInventoryMenuMeta();
        if(typeof refreshResultsForInventory === 'function') refreshResultsForInventory();
        if(typeof updateTransferSummaryUI === 'function') updateTransferSummaryUI();

        showToast('กู้คืนข้อมูลเดิมแล้ว', 2200, 'success');
      }catch(err){
        console.error('[transfer][undo import]', err);
        showToast(`กู้คืนข้อมูลไม่สำเร็จ: ${err?.message || err}`, 4200, 'error');
      }
    }
  }
);

  return true;
}

function updateTransferSummaryUI(){
  const inventoryCountEl = document.getElementById('transferInventoryCount');
  const favoriteCountEl = document.getElementById('transferFavoriteCount');
  const resultSetCountEl = document.getElementById('transferResultSetCount');

  const inventoryCount = Array.from(window._ownedJewelIds || []).length;
  const favoriteCount = getFavoriteStoreForTransfer().presets.length;
  const resultSetCount = readResultSetStore().items.length;

  if(inventoryCountEl) inventoryCountEl.textContent = `${inventoryCount} รายการ`;
  if(favoriteCountEl) favoriteCountEl.textContent = `${favoriteCount} รายการ`;
  if(resultSetCountEl) resultSetCountEl.textContent = `${resultSetCount} รายการ`;
}

function resetImportPreview(){
  pendingImportPayload = null;
  const fileInput = document.getElementById('importFileInput');
  const previewBox = document.getElementById('importPreviewBox');
  const previewMeta = document.getElementById('importPreviewMeta');
  const previewCounts = document.getElementById('importPreviewCounts');
  const mergeBtn = document.getElementById('importMergeBtn');
  const replaceBtn = document.getElementById('importReplaceBtn');

  if(fileInput) fileInput.value = '';
  if(previewBox) previewBox.classList.remove('show');
  if(previewMeta) previewMeta.textContent = '';
  if(previewCounts) previewCounts.textContent = '';
  if(mergeBtn) mergeBtn.disabled = true;
  if(replaceBtn) replaceBtn.disabled = true;
}

function showImportPreview(payload, filename){
  pendingImportPayload = normalizeTransferPayload(payload);
  const previewBox = document.getElementById('importPreviewBox');
  const previewMeta = document.getElementById('importPreviewMeta');
  const previewCounts = document.getElementById('importPreviewCounts');
  const mergeBtn = document.getElementById('importMergeBtn');
  const replaceBtn = document.getElementById('importReplaceBtn');

  const summary = summarizeTransferPayload(pendingImportPayload);

  if(previewBox) previewBox.classList.add('show');
  if(previewMeta){
    previewMeta.textContent = `ไฟล์: ${filename || 'backup.json'}${pendingImportPayload.exportedAt ? ` • ส่งออกเมื่อ ${new Date(pendingImportPayload.exportedAt).toLocaleString('th-TH')}` : ''}`;
  }
  if(previewCounts){
  previewCounts.textContent = '';

  [
    ['คลังจี้ของฉัน', summary.inventoryCount],
    ['Filter ที่บันทึกไว้', summary.favoriteCount],
    ['เซ็ตจี้ที่บันทึกไว้', summary.resultSetCount]
  ].forEach(([label, count])=>{
    const row = document.createElement('div');
    row.textContent = `${label}: ${count} รายการ`;
    previewCounts.appendChild(row);
  });
}
  if(mergeBtn) mergeBtn.disabled = false;
  if(replaceBtn) replaceBtn.disabled = false;
}

function resultSetDefaultName(snapshot){
  const first = (snapshot.names || [])[0] || 'เซ็ตจี้';
  return `อันดับ ${snapshot.rank || '-'} - `;
}

function saveResultSetSnapshot(snapshot, preferredName=''){
  if(!snapshot?.names?.length) return;
  const defaultName = preferredName || resultSetDefaultName(snapshot);
  const name = prompt('ตั้งชื่อเซ็ตจี้ที่ต้องการบันทึก', defaultName);
  if(name === null) return;
  const finalName = name.trim();
  if(!finalName){
    showToast('ใส่ชื่อเซ็ตจี้ก่อนบันทึก', 2600, 'warn');
    return;
  }
  const store = readResultSetStore();
  const now = new Date().toISOString();
  const existing = store.items.find(item=>item.key === snapshot.key);
  if(existing){
    existing.snapshot = snapshot;
    existing.name = finalName;
    existing.updatedAt = now;
  }else{
    store.items.unshift({
      id: 'result_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8),
      key: snapshot.key,
      name: finalName,
      snapshot,
      createdAt: now,
      updatedAt: now
    });
  }
  if(writeResultSetStore(store)){
    renderSavedResultSets();
    showToast('บันทึกเซ็ตจี้แล้ว', 2000, 'success');
    trackEvent('save_result_set_success', {result_rank: Number(snapshot.rank) || 0,jewel_count: Array.isArray(snapshot.names) ? snapshot.names.length : 0});
  }
}

function renameSavedResultSet(id){
  const store = readResultSetStore();
  const item = store.items.find(x=>x.id === id);
  if(!item) return;

  const currentName = item.name || resultSetDefaultName(item.snapshot || {});
  const nextName = prompt('เปลี่ยนชื่อเซ็ตจี้', currentName);
  if(nextName === null) return;

  const finalName = nextName.trim();
  if(!finalName){
    showToast('ใส่ชื่อเซ็ตจี้ก่อนบันทึก', 2600, 'warn');
    return;
  }

  item.name = finalName;
  item.updatedAt = new Date().toISOString();

  if(writeResultSetStore(store)){
    renderSavedResultSets();
    showToast('เปลี่ยนชื่อเซ็ตจี้แล้ว', 1800, 'success');
  }
}

function deleteSavedResultSet(id){
  const store = readResultSetStore();
  const previousStore = JSON.parse(JSON.stringify(store));
  const item = store.items.find(x=>x.id === id);
  if(!item) return;
  if(!confirm(`ลบเซ็ตจี้ "${item.name}"?`)) return;

  store.items = store.items.filter(x=>x.id !== id);

  if(writeResultSetStore(store)){
    renderSavedResultSets();
    showToast(`ลบเซ็ตจี้ "${item.name}" แล้ว`, 5200, 'info', {
      actionLabel: 'Undo',
      onAction: ()=>{
        if(writeResultSetStore(previousStore)){
          renderSavedResultSets();
          showToast('กู้คืนเซ็ตจี้แล้ว', 1800, 'success');
        }
      }
    });
  }
}

function clearAllSavedResultSets(){
  const store = readResultSetStore();
  const count = store.items.length;

  if(!count){
    showToast('ยังไม่มีเซ็ตจี้ให้ลบ', 1800, 'info');
    return;
  }

  const previousStore = JSON.parse(JSON.stringify(store));
  const ok = confirm(`ลบเซ็ตจี้ที่บันทึกไว้ทั้งหมด ${count} เซ็ต?\n\nโดยจะลบทั้งหมด ไม่ใช่เฉพาะผลค้นหาที่แสดงอยู่`);
  if(!ok) return;

  if(writeResultSetStore({ version: 1, items: [] })){
    const search = document.getElementById('savedResultSearchInput');
    if(search){
      search.value = '';
      search.dispatchEvent(new Event('input'));
    }

    renderSavedResultSets();
    showToast(`ลบเซ็ตจี้ทั้งหมด ${count} เซ็ตแล้ว`, 5200, 'info', {
      actionLabel: 'Undo',
      onAction: ()=>{
        if(writeResultSetStore(previousStore)){
          renderSavedResultSets();
          showToast('กู้คืนเซ็ตจี้ทั้งหมดแล้ว', 1800, 'success');
        }
      }
    });
  }
}

function renderSavedResultSets(){
  const list = document.getElementById('savedResultList');
  if(!list) return;
  const store = readResultSetStore();
  const clearAllBtn = document.getElementById('savedResultClearAll');
  if(clearAllBtn) clearAllBtn.disabled = store.items.length === 0;

  const q = (document.getElementById('savedResultSearchInput')?.value || '').trim().toLowerCase();
  const items = q
    ? store.items.filter(item=>`${item.name || ''} ${(item.snapshot?.names || []).join(' ')}`.toLowerCase().includes(q))
    : store.items;
  const countEl = document.getElementById('favCount');
  if(countEl && document.getElementById('favResultTab')?.classList.contains('active')){
    countEl.textContent = q ? `(${items.length}/${store.items.length})` : `(${store.items.length})`;
  }
  list.innerHTML = '';
  if(!store.items.length){
    const empty = document.createElement('div');
    empty.className = 'fav-empty';
    empty.textContent = 'ยังไม่มีเซ็ตจี้ที่บันทึกไว้';
    list.appendChild(empty);
    return;
  }
  if(!items.length){
    const empty = document.createElement('div');
    empty.className = 'fav-empty';
    empty.textContent = 'ไม่พบเซ็ตจี้ที่ตรงกับคำค้นหา';
    list.appendChild(empty);
    return;
  }
  items.forEach(item=>{
    const snapshot = item.snapshot || {};
    const row = document.createElement('div');
    row.className = 'fav-item';
    const name = document.createElement('div');
    name.className = 'fav-item__name';
    name.textContent = item.name || resultSetDefaultName(snapshot);
    const jewels = document.createElement('div');
    jewels.className = 'saved-result-jewels';
    (snapshot.names || []).forEach(jewelName=>{
      const jewel = document.createElement('div');
      jewel.className = 'saved-result-jewel';
      jewel.textContent = jewelName;
      jewels.appendChild(jewel);
    });
    // const metrics = document.createElement('div');
    // metrics.className = 'saved-result-metrics';
    // [
    //   `คะแนน ${snapshot.score || '-'}`,
    //   `ตรงเป๊ะ ${snapshot.matchedCount ?? 0}`,
    //   `หายไป ${(snapshot.missing || []).length}`,
    //   `ไม่ต้องการ ${(snapshot.unwanted || []).length}`,
    //   `ได้เพิ่ม ${(snapshot.extra || []).length}`
    // ].forEach(text=>{
    //   const metric = document.createElement('span');
    //   metric.className = 'saved-result-metric';
    //   metric.textContent = text;
    //   metrics.appendChild(metric);
    // });
    const actions = document.createElement('div');
    actions.className = 'fav-actions';

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'fav-btn fav-btn--primary';
    shareBtn.textContent = 'แชร์เซ็ตจี้';
    shareBtn.addEventListener('click', ()=> shareResultSnapshot(snapshot));

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'fav-btn fav-btn--ghost';
    renameBtn.textContent = 'เปลี่ยนชื่อ';
    renameBtn.addEventListener('click', ()=> renameSavedResultSet(item.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'fav-btn fav-btn--danger';
    deleteBtn.textContent = 'ลบ';
    deleteBtn.addEventListener('click', ()=> deleteSavedResultSet(item.id));

    actions.append(shareBtn, renameBtn, deleteBtn);
    row.append(name, jewels, actions);
    list.appendChild(row);
  });
}

(function(){
  const STORAGE_KEY = 'lgr_filter_favorites_v1';
  let editingPresetId = null;

  function readStore(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if(parsed && Array.isArray(parsed.presets)) return parsed;
    }catch(e){}
    return { version: 1, presets: [] };
  }

  function writeStore(store){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    }catch(e){
      showToast('ไม่สามารถบันทึกชุด Filter ได้', 3000, 'warn');
      return false;
    }
  }
  window.readFavoriteStoreForTransfer = readStore;
window.writeFavoriteStoreForTransfer = writeStore;
window.FAVORITE_STORAGE_KEY_FOR_TRANSFER = STORAGE_KEY;

  function createFavButton(label, variant, onClick){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `fav-btn fav-btn--${variant}`;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function abilityExists(name){
    try{
      return requirementExists(name);
    }catch(e){
      return true;
    }
  }

  function charExists(charName){
    const el = document.getElementById('charSelect');
    if(!charName || !el) return false;
    if(el.tomselect) return !!el.tomselect.options[charName];
    return Array.from(el.options || []).some(o => o.value === charName);
  }

  function isResultTabActive(){
    return document.getElementById('favResultTab')?.classList.contains('active');
  }

  function bindFavoriteSearchClear(inputId, clearId, renderFn){
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearId);
  if(!input || !clearBtn) return;

  const sync = ()=>{
    clearBtn.hidden = !input.value.trim();
  };

  input.addEventListener('input', ()=>{
    sync();
    renderFn();
  });

  clearBtn.addEventListener('click', ()=>{
    input.value = '';
    sync();
    renderFn();
    input.focus();
  });

  sync();
}

  function switchFavoriteTab(tab){
    const isResult = tab === 'result';
    const filterTab = document.getElementById('favFilterTab');
    const resultTab = document.getElementById('favResultTab');
    const filterPanel = document.getElementById('favFilterPanel');
    const resultPanel = document.getElementById('favResultPanel');
    filterTab?.classList.toggle('active', !isResult);
    resultTab?.classList.toggle('active', isResult);
    filterTab?.setAttribute('aria-selected', isResult ? 'false' : 'true');
    resultTab?.setAttribute('aria-selected', isResult ? 'true' : 'false');
    if(filterPanel) filterPanel.hidden = isResult;
    if(resultPanel) resultPanel.hidden = !isResult;
    closeSavePanel();
    if(isResult) renderSavedResultSets();
    else renderFavorites();
  }

  function renderFavorites(){
    const list = document.getElementById('favList');
    if(!list) return;
    const store = readStore();
    const clearAllBtn = document.getElementById('favClearAll');
    if(clearAllBtn) clearAllBtn.disabled = store.presets.length === 0;
    const q = (document.getElementById('favSearchInput')?.value || '').trim().toLowerCase();
    const presets = q
      ? store.presets.filter(p=>{
          const hay = `${p.name || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : store.presets;
    const countEl = document.getElementById('favCount');
    if(countEl && !isResultTabActive()){
      countEl.textContent = q ? `(${presets.length}/${store.presets.length})` : `(${store.presets.length})`;
    }
    list.innerHTML = '';

    if(!store.presets.length){
      const empty = document.createElement('div');
      empty.className = 'fav-empty';
      empty.textContent = 'ยังไม่มีชุด Filter การค้นหาที่บันทึกไว้';
      list.appendChild(empty);
      return;
    }

    if(!presets.length){
      const empty = document.createElement('div');
      empty.className = 'fav-empty';
      empty.textContent = 'ไม่พบชุด Filter ที่ตรงกับคำค้นหา';
      list.appendChild(empty);
      return;
    }

    presets.forEach(preset=>{
      const item = document.createElement('div');
      item.className = 'fav-item';

      const name = document.createElement('div');
      name.className = 'fav-item__name';
      name.textContent = preset.name;

      const meta = document.createElement('div');
      meta.className = 'fav-item__meta';
      meta.textContent = summarizeFilterState(preset.state || {});

      const actions = document.createElement('div');
      actions.className = 'fav-actions';

      const useBtn = createFavButton('ใช้ Filter นี้', 'primary', ()=> applyFavorite(preset.id));
      const renameBtn = createFavButton('เปลี่ยนชื่อ', 'ghost', ()=> openSavePanel(preset.id));
      const deleteBtn = createFavButton('ลบ', 'danger', ()=> deleteFavorite(preset.id));

      actions.append(useBtn, renameBtn, deleteBtn);
      item.append(name, meta, actions);
      list.appendChild(item);
    });
  }
  window.renderFavoritesForTransfer = renderFavorites;

  function openFavModal(){
    const modal = document.getElementById('favModal');
    if(!modal) return;
    switchFavoriteTab('filter');
    renderFavorites();
    renderSavedResultSets();
    closeSavePanel();
    updateTransferSummaryUI();
    setDialogVisible(modal, true);
  }

  function closeFavModal(){
    const modal = document.getElementById('favModal');
    if(!modal) return;
    setDialogVisible(modal, false);
    closeSavePanel();
  }

  function openSavePanel(presetId=null){
    const panel = document.getElementById('favSavePanel');
    const input = document.getElementById('favNameInput');
    const summary = document.getElementById('favSaveSummary');
    const saveBtn = document.getElementById('favConfirmSave');
    if(!panel || !input || !summary || !saveBtn) return;

    editingPresetId = presetId;
    const store = readStore();
    const preset = presetId ? store.presets.find(p=>p.id===presetId) : null;
    const state = preset ? preset.state : readFilterState();

    if(!preset && !hasMeaningfulFilter(state)){
      showToast('ยังไม่มี Filter ให้บันทึก', 2800, 'warn');
      return;
    }

    input.value = preset ? preset.name : '';
    summary.textContent = 'สรุป: ' + summarizeFilterState(state);
    saveBtn.textContent = preset ? 'บันทึกชื่อ' : 'บันทึก';
    panel.classList.add('show');
    setTimeout(()=> input.focus(), 0);
  }

  function closeSavePanel(){
    const panel = document.getElementById('favSavePanel');
    const input = document.getElementById('favNameInput');
    const summary = document.getElementById('favSaveSummary');
    const saveBtn = document.getElementById('favConfirmSave');
    editingPresetId = null;
    if(panel) panel.classList.remove('show');
    if(input) input.value = '';
    if(summary) summary.textContent = '';
    if(saveBtn) saveBtn.textContent = 'บันทึก';
  }

  function saveFavorite(){
  const input = document.getElementById('favNameInput');
  const name = (input?.value || '').trim();
  if(!name){
    showToast('ใส่ชื่อชุด Filter ก่อนบันทึก', 2800, 'warn');
    input?.focus();
    return;
  }

  const store = readStore();
  const previousStore = JSON.parse(JSON.stringify(store));
  const now = new Date().toISOString();

  if(editingPresetId){
    const preset = store.presets.find(p=>p.id===editingPresetId);
    if(!preset) return;
    const duplicate = store.presets.find(p=>p.id!==editingPresetId && p.name === name);
    if(duplicate && !confirm(`มีชุดชื่อ "${name}" อยู่แล้ว ต้องการใช้ชื่อนี้ซ้ำไหม?`)) return;

    preset.name = name;
    preset.updatedAt = now;

    if(writeStore(store)){
      closeSavePanel();
      renderFavorites();
      showToast('บันทึกชื่อชุด Filter แล้ว', 5200, 'success', {
        actionLabel: 'Undo',
        onAction: ()=>{
          if(writeStore(previousStore)){
            renderFavorites();
            closeSavePanel();
            showToast('ยกเลิกการเปลี่ยนชื่อแล้ว', 1800, 'info');
          }
        }
      });
      trackEvent('save_filter_success', {
    selected_skill_count: Array.isArray(window._chipSelected) ? window._chipSelected.length : 0,
    unwanted_skill_count: Array.isArray(window._chipUnwanted) ? window._chipUnwanted.length : 0,
    has_character: !!getCharSelectValue()
  });
    }
    return;
  }

  const state = readFilterState();
  if(!hasMeaningfulFilter(state)){
    showToast('ยังไม่มี Filter ให้บันทึก', 2800, 'warn');
    return;
  }

  const sameName = store.presets.find(p=>p.name === name);
  if(sameName){
    if(!confirm(`มีชุดชื่อ "${name}" อยู่แล้ว ต้องการบันทึกทับไหม?`)) return;
    sameName.state = state;
    sameName.updatedAt = now;
  }else{
    store.presets.unshift({
      id: 'preset_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8),
      name,
      state,
      createdAt: now,
      updatedAt: now
    });
  }

  if(writeStore(store)){
    closeSavePanel();
    renderFavorites();
    showToast('บันทึกชุด Filter แล้ว', 5200, 'success', {
      actionLabel: 'Undo',
      onAction: ()=>{
        if(writeStore(previousStore)){
          renderFavorites();
          closeSavePanel();
          showToast('ยกเลิกการบันทึกแล้ว', 1800, 'info');
        }
      }
    });
  }
}

  function applyFavorite(id){
    const store = readStore();
    const preset = store.presets.find(p=>p.id===id);
    if(!preset || !preset.state) return;
    const state = preset.state;

    const missing = [];
    const validSelected = Array.from(state.selected || []).filter(name=>{
      const ok = abilityExists(name);
      if(!ok) missing.push(name);
      return ok;
    });
    const validUnwanted = Array.from(state.unwanted || []).filter(name=>{
      const ok = abilityExists(name);
      if(!ok) missing.push(name);
      return ok;
    }).filter(name=>!validSelected.includes(name));

    const char = (state.char || '').trim();
    const missingChar = (char && !charExists(char)) ? char : '';
    applyFilterState({
      selected: validSelected,
      unwanted: validUnwanted,
      jewelTypes: normalizeFilterState(state).jewelTypes,
      topK: state.topK || DEFAULT_TOPK,
      char: missingChar ? '' : char
    });

    if(typeof updateCharPreview === 'function') updateCharPreview();
    if(typeof invalidateResultsForCriteriaChange === 'function') invalidateResultsForCriteriaChange();
    if(typeof updateCalcAvailability === 'function') updateCalcAvailability();

    closeFavModal();
    if(missing.length || missingChar){
      const parts = [];
      if(missing.length) parts.push(`ข้าม ${missing.length} สกิลที่ไม่พบ`);
      if(missingChar) parts.push(`ไม่พบตัวละคร "${missingChar}"`);
      showToast('ใช้ชุด Filter แล้ว แต่' + parts.join(' และ '), 4000, 'warn');
    }else{
      showToast('ใช้ชุด Filter แล้ว กดค้นหาเพื่อดูผลลัพธ์', 3000, 'success');
    }
  }

function deleteFavorite(id){
  const store = readStore();
  const previousStore = JSON.parse(JSON.stringify(store));
  const preset = store.presets.find(p=>p.id===id);
  if(!preset) return;
  if(!confirm(`ลบชุด "${preset.name}"?`)) return;

  store.presets = store.presets.filter(p=>p.id!==id);

  if(writeStore(store)){
    renderFavorites();
    closeSavePanel();
    showToast(`ลบชุด "${preset.name}" แล้ว`, 5200, 'info', {
      actionLabel: 'Undo',
      onAction: ()=>{
        if(writeStore(previousStore)){
          renderFavorites();
          showToast('กู้คืนชุด Filter แล้ว', 1800, 'success');
        }
      }
    });
  }
}

  function clearAllFavorites(){
    const store = readStore();
    const count = store.presets.length;
    if(!count){
      showToast('ยังไม่มีชุด Filter ให้ลบ', 1800, 'info');
      return;
    }
    const ok = confirm(`ลบชุด Filter ที่บันทึกไว้ทั้งหมด ${count} ชุด?\n\nโดยจะลบชุดทั้งหมด ไม่ใช่เฉพาะผลค้นหาที่แสดงอยู่ และย้อนกลับไม่ได้`);
    if(!ok) return;
    if(writeStore({ version: 1, presets: [] })){
      const search = document.getElementById('favSearchInput');
      if(search){
        search.value = '';
        search.dispatchEvent(new Event('input'));
      }
      closeSavePanel();
      renderFavorites();
      showToast(`ลบชุด Filter ทั้งหมด ${count} ชุดแล้ว`, 5200, 'info', {
        actionLabel: 'Undo',
        onAction: ()=>{
          const previousStore = JSON.parse(JSON.stringify(store));
          if(writeStore(previousStore)){
            renderFavorites();
            closeSavePanel();
            showToast('กู้คืนชุด Filter ทั้งหมดแล้ว', 1800, 'success');
          }
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
        const brandTitle = document.getElementById('brandTitle');
    if(brandTitle){
      brandTitle.addEventListener('click', goToHomePage);
      brandTitle.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          goToHomePage();
        }
      });
    }
    document.getElementById('favoriteBtn')?.addEventListener('click', ()=>{trackEvent('open_favorites', {source: 'favorite_button'});openFavModal();});
    document.getElementById('favClose')?.addEventListener('click', closeFavModal);
    document.getElementById('favModal')?.addEventListener('click', e=>{ if(e.target?.id === 'favModal') closeFavModal(); });
    document.getElementById('favSaveCurrent')?.addEventListener('click', ()=> openSavePanel());

    bindFavoriteSearchClear('favSearchInput', 'favSearchClear', renderFavorites);
    bindFavoriteSearchClear('savedResultSearchInput', 'savedResultSearchClear', renderSavedResultSets);

    document.getElementById('favFilterTab')?.addEventListener('click', ()=> switchFavoriteTab('filter'));
    document.getElementById('favResultTab')?.addEventListener('click', ()=> switchFavoriteTab('result'));
    document.getElementById('favClearAll')?.addEventListener('click', clearAllFavorites);
    document.getElementById('savedResultClearAll')?.addEventListener('click', clearAllSavedResultSets);
    document.getElementById('favCancelSave')?.addEventListener('click', closeSavePanel);
    document.getElementById('favConfirmSave')?.addEventListener('click', saveFavorite);
    document.getElementById('favNameInput')?.addEventListener('keydown', e=>{
      if(e.key === 'Enter'){ e.preventDefault(); saveFavorite(); }
      if(e.key === 'Escape'){ closeSavePanel(); }
    });
  });
})();

function goToHomePage(){
  const baseUrl = window.location.origin + window.location.pathname;

  if(window.location.search || window.location.hash){
    window.location.assign(baseUrl);
    return;
  }

  window.location.reload();
}
