/* Web Worker: runs the combination search off the main thread.
 * Message in:  { desired, cand, topK, fixed? }
 * Messages out: { type:'progress', p } … then { type:'result', best } */
importScripts('search-core.js');

self.onmessage = function(e){
  const d = e.data;
  const best = searchCombos({
    desired: d.desired,
    cand: d.cand,
    topK: d.topK,
    fixed: d.fixed || null,
    onProgress: (p)=> self.postMessage({ type: 'progress', p })
  });
  self.postMessage({ type: 'result', best });
};
