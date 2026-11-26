/* ===== Search core — pure functions, no DOM =====
 * Loaded three ways, all sharing this one file:
 *   1. as a classic <script> in index.html (main thread: candidate building)
 *   2. via importScripts() inside js/search-worker.js (the combination search)
 *   3. via require() in Node tests (module.exports at the bottom)
 */

const SPEED_CFG = { CANDIDATE_LIMIT: 120, FIXED_LINK_LIMIT: 200, FILLER_LIMIT: 30, PER_MASK: 6 };

function toNumber(val){
  if(typeof val === 'number') return val;
  const s = String(val ?? '').replace(/[, ]+/g,'').replace('%','');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function popcount(x){ let c=0; while(x){c+=x&1;x>>>=1;} return c; }

function compareCandidates(a,b){
  return (popcount(b.mask)-popcount(a.mask)) ||
         ((a.unwantedCount||0)-(b.unwantedCount||0)) ||
         ((b.extraCount||0)-(a.extraCount||0)) ||
         (b.score-a.score);
}

/** Describe one pendant relative to the wanted skills: bit i of `mask` = has desired[i]. */
function jewelToCandidate(j, desired, unwanted=[]){
  const bitIndex = new Map(desired.map((n,i)=>[n,i]));
  const unwantedSet = new Set(unwanted);
  let mask=0, score=0, otherNames=[], unwantedCount=0, extraCount=0;
  for(const s of j.substats){
    const idx=bitIndex.get(s.name);
    if(idx!==undefined){ mask|=(1<<idx); score+=toNumber(s.value); }
    else{
      otherNames.push(s.name);
      if(unwantedSet.has(s.name)) unwantedCount++;
      else extraCount++;
    }
  }
  return { id:j.id, mask, score, otherNames, unwantedCount, extraCount, allNames: j.substats.map(s=>s.name) };
}

function buildCandidates(desired, sourceJewels, unwanted=[], limit=SPEED_CFG.CANDIDATE_LIMIT){
  const all = sourceJewels.map(j=>{
    return jewelToCandidate(j, desired, unwanted);
  }).filter(m=>m.mask!==0)
    .sort(compareCandidates);

  // Collapse near-duplicate jewels that cover the exact same desired-skill mask:
  // keep only the few best representatives per mask. `all` is already sorted by
  // compareCandidates — (popcount desc, unwanted asc, extra desc, score desc) —
  // and within a single mask popcount is constant, so the first PER_MASK entries
  // seen for each mask are precisely its best representatives. This shrinks the
  // pool from ~800 to ~150 with no observed change to the top-K results, turning
  // the worker's O(n^4) search from minutes into well under a second.
  const perMask = SPEED_CFG.PER_MASK || 6;
  const maskSeen = new Map();
  const pruned = [];
  for(const c of all){
    const seen = maskSeen.get(c.mask) || 0;
    if(seen >= perMask) continue;
    maskSeen.set(c.mask, seen + 1);
    pruned.push(c);
  }

  // Guarantee at least one candidate per desired-skill bit before truncation
  const guaranteedIds = new Set();
  const guaranteed = [];
  for(let bit=0; bit<desired.length; bit++){
    const bitMask = 1<<bit;
    const best = pruned.find(c=>(c.mask&bitMask)!==0);
    if(best && !guaranteedIds.has(best.id)){ guaranteedIds.add(best.id); guaranteed.push(best); }
  }
  const slots = Math.max(0, limit - guaranteed.length);
  const rest = pruned.filter(c=>!guaranteedIds.has(c.id)).slice(0, slots);
  // re-sort หลัง merge เพื่อให้ suffixOr pruning ทำงานถูกต้อง
  return [...guaranteed, ...rest].sort(compareCandidates);
}

/**
 * "Filler" pendants: ones with none of the wanted skills. They are needed when a
 * locked [ลิงก์] pendant already covers most wanted skills — otherwise the open
 * slots could only take pendants that add a wanted skill, and there may not be
 * enough of those that don't repeat a skill. Best first (compareCandidates).
 */
function buildFillerCandidates(desired, sourceJewels, unwanted=[], limit=SPEED_CFG.FILLER_LIMIT){
  return sourceJewels.map(j=>jewelToCandidate(j, desired, unwanted))
    .filter(c=>c.mask===0)
    .sort(compareCandidates)
    .slice(0, limit);
}

/** Jewels that share no skill name with `fixed` (only those can sit next to it in a set). */
function compatibleWith(fixed, sourceJewels){
  const names = new Set(fixed.substats.map(s=>s.name));
  return sourceJewels.filter(j=>j.id!==fixed.id && !j.substats.some(s=>names.has(s.name)));
}

/**
 * Find the top-K 4-pendant sets. Two pendants in a set may not share any skill name.
 * With `fixed`, that candidate is always slot 1 and only 3 more are chosen from `cand`.
 * Result order: fewer missing → fewer unwanted → more extras → higher value.
 */
function searchCombos({ desired, cand, topK, fixed = null, onProgress = null }){
  const is3 = !!fixed;
  const n = cand.length;
  const desiredMaskAll = (1 << desired.length) - 1;
  // Progress is driven by the outermost loop index so it advances monotonically.
  const outerN = is3 ? (n-2) : (n-3);
  const emitOuter = (a)=>{ if(onProgress) onProgress(outerN>0 ? Math.min(99, Math.round(a/outerN*100)) : 99); };

  function cmp(a,b){
    return (a.notMiss-b.notMiss)||(a.unwantedCount-b.unwantedCount)||(b.extraCount-a.extraCount)||(b.totalValue-a.totalValue);
  }
  // binary-insert keeps best[] sorted in O(topK) per insert
  const best = [];
  function pushTop(item){
    let lo=0,hi=best.length;
    while(lo<hi){ const mid=(lo+hi)>>1; if(cmp(item,best[mid])<0) hi=mid; else lo=mid+1; }
    best.splice(lo,0,item);
    if(best.length>topK) best.pop();
  }

  function makeResult(charms){
    let mask=0,tv=0,uw=0,extraCount=0;
    const ids=[],extraSeen={};
    for(let i=0;i<charms.length;i++){
      const ch=charms[i];
      mask|=ch.mask; tv+=ch.score; uw+=(ch.unwantedCount||0); ids.push(ch.id);
      for(let k=0;k<ch.otherNames.length;k++){
        const nm=ch.otherNames[k]; if(!extraSeen[nm]){ extraSeen[nm]=1; extraCount++; }
      }
    }
    const notMask=desiredMaskAll&(~mask), notIdx=[];
    let notMiss=0;
    for(let i=0;i<desired.length;i++){ if((notMask>>i)&1){notMiss++;notIdx.push(i);} }
    return {ids:ids,notMiss:notMiss,notIdx:notIdx,totalValue:tv,extraCount:extraCount,unwantedCount:uw};
  }

  const namesets=cand.map(c=>new Set(c.allNames));
  const sharesName = (s, ...others)=>{ for(const nm of s){ for(const o of others){ if(o.has(nm)) return true; } } return false; };

  if(is3){
    const fixedSet=new Set(fixed.allNames);
    for(let a=0;a<n-2;a++){
      emitOuter(a);
      const sA=namesets[a];
      if(sharesName(sA, fixedSet)) continue;
      for(let b=a+1;b<n-1;b++){
        const sB=namesets[b];
        if(sharesName(sB, fixedSet, sA)) continue;
        for(let c=b+1;c<n;c++){
          const sC=namesets[c];
          if(sharesName(sC, fixedSet, sA, sB)) continue;
          pushTop(makeResult([fixed,cand[a],cand[b],cand[c]]));
        }
      }
    }
    return best;
  }

  // suffixOr[i] = every desired skill reachable from cand[i..]; prunes branches
  // that can no longer beat the current K-th best on missing count.
  const suffixOr=new Array(n+1); suffixOr[n]=0;
  for(let i=n-1;i>=0;i--) suffixOr[i]=suffixOr[i+1]|cand[i].mask;
  const cannotBeat = (maskSoFar, from)=>
    best.length===topK && popcount(desiredMaskAll&(~(maskSoFar|suffixOr[from])))>best[best.length-1].notMiss;

  for(let a=0;a<n-3;a++){
    emitOuter(a);
    if(cannotBeat(cand[a].mask, a+1)) continue;
    const sA=namesets[a];
    for(let b=a+1;b<n-2;b++){
      const sB=namesets[b];
      if(sharesName(sB, sA)) continue;
      const maskAB=cand[a].mask|cand[b].mask;
      if(cannotBeat(maskAB, b+1)) continue;
      for(let c=b+1;c<n-1;c++){
        const sC=namesets[c];
        if(sharesName(sC, sA, sB)) continue;
        const maskABC=maskAB|cand[c].mask;
        if(cannotBeat(maskABC, c+1)) continue;
        for(let d=c+1;d<n;d++){
          if(sharesName(namesets[d], sA, sB, sC)) continue;
          pushTop(makeResult([cand[a],cand[b],cand[c],cand[d]]));
        }
      }
    }
  }
  return best;
}

if (typeof module === 'object' && module.exports){
  module.exports = { SPEED_CFG, toNumber, popcount, compareCandidates, jewelToCandidate, buildCandidates, buildFillerCandidates, compatibleWith, searchCombos };
}
