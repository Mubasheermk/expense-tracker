/* Mock Firebase for the browser tests.
 * Replaces the real Firebase compat SDK with an in-memory Firestore (live listeners, batches,
 * FieldValue.increment / arrayUnion / delete), a signed-in user and a no-op App Check, then
 * seeds sample data relative to today. Exposes window.__store (path -> document) and
 * window.__emit() so tests can inspect and change data. Never talks to the real project.
 */
(function(){
  // Minimal in-memory Firestore with live listeners, enough to exercise the app
  const store = {};             // path -> data
  const listeners = [];         // {prefix, single, cb}
  window.__store = store;
  window.__emit = () => emit();
  const emit = () => listeners.forEach(l => setTimeout(() => l.fire(), 0));
  const resolve = v => typeof v === 'object' && v && v.__ts ? new Date().toISOString() : v;
  const clean = o => Object.fromEntries(Object.entries(o).map(([k,v]) => [k, resolve(v)]));
  const merge = (a,b) => { const r={...a}; for(const [k,v] of Object.entries(b)){ if(v && v.__del) delete r[k]; else if(v && v.__inc!==undefined) r[k]=(r[k]||0)+v.__inc; else if(v && v.__union) r[k]=[...new Set([...(r[k]||[]), ...v.__union])]; else r[k]=resolve(v);} return r; };
  let auto = 0;
  function docRef(path){
    return {
      id: path.split('/').pop(), path,
      set(data){ store[path] = merge({}, data); emit(); return Promise.resolve(); },
      update(data){ store[path] = merge(store[path]||{}, data); emit(); return Promise.resolve(); },
      delete(){ delete store[path]; emit(); return Promise.resolve(); },
      collection(name){ return collRef(path + '/' + name); },
      get(){ return Promise.resolve({exists: path in store, data:()=>store[path]}); },
      onSnapshot(cb){ const l = {fire:()=>cb({exists: path in store, data:()=>store[path]})}; listeners.push(l); l.fire(); return ()=>{}; }
    };
  }
  function collRef(path){
    const snap = () => ({ docs: Object.keys(store).filter(k => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1)
      .map(k => ({ id: k.split('/').pop(), data: () => store[k] })) });
    const api = {
      parent: docRef(path.split('/').slice(0,-1).join('/')),
      get(){ const sn = snap(); return Promise.resolve({ size: sn.docs.length, docs: sn.docs.map(d => ({...d, ref: docRef(path + '/' + d.id)})) }); },
      doc(id){ return docRef(path + '/' + id); },
      add(data){ const r = docRef(path + '/auto' + (++auto)); return r.set(data).then(()=>r); },
      orderBy(){ return api; },
      onSnapshot(cb){ const l = {fire:()=>{ const s = snap(); s.docs.sort((a,b)=> (b.data().date||'') > (a.data().date||'') ? 1 : -1); cb(s); }}; listeners.push(l); l.fire(); return ()=>{}; }
    };
    return api;
  }
  const db = {
    enablePersistence(){ return Promise.resolve(); },
    collection(n){ return collRef(n); },
    batch(){ const ops=[]; return { set(r,d){ops.push(()=>r.set(d))}, update(r,d){ops.push(()=>r.update(d))}, delete(r){ops.push(()=>r.delete())}, commit(){ ops.forEach(f=>f()); return Promise.resolve(); } }; }
  };
  const fs = () => db; fs.Timestamp = { fromDate: d => ({__tsd: d.toISOString(), toDate(){ return d; }}) };
  fs.FieldValue = { serverTimestamp: () => ({__ts:1}), delete: () => ({__del:1}), increment: n => ({__inc:n}), arrayUnion: (...a) => ({__union:a}) };
  const au = () => ({ currentUser:{displayName:'mubbaseer K'}, onAuthStateChanged: cb => setTimeout(()=>cb({uid:'u1',displayName:'mubbaseer K',photoURL:''}),10), signOut(){} });
  au.GoogleAuthProvider = function(){};
  const ac = () => ({activate(){}}); ac.ReCaptchaEnterpriseProvider = function(){};
  Object.defineProperty(window,'firebase',{value:{initializeApp(){},firestore:fs,auth:au,appCheck:ac},writable:false});

  // Seed: some expenses this month, budgets, and a monthly rule that started 3 months ago (should backfill)
  const today = new Date(); const pad=n=>String(n).padStart(2,'0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const m = (off, day) => key(new Date(today.getFullYear(), today.getMonth()+off, day));
  store['users/u1/expenses/e1'] = {title:'Groceries', amount:180, date:m(0,2), category:'Food', payment:'Card'};
  store['users/u1/expenses/e2'] = {title:'Dinner out', amount:95, date:m(0,5), category:'Food', payment:'Card'};
  store['users/u1/expenses/e3'] = {title:'Gas', amount:60, date:m(0,4), category:'Transport', payment:'Card'};
  store['users/u1/expenses/e4'] = {title:'Shoes', amount:140, date:m(0,1), category:'Shopping', payment:'Card'};
  store['users/u1/expenses/e5'] = {title:'Groceries', amount:120, date:m(-1,3), category:'Food', payment:'Card'};
  store['users/u1/expenses/e6'] = {title:'Train pass', amount:95, date:m(-1,2), category:'Transport', payment:'Card'};
  store['users/u1/expenses/e7'] = {title:'Movie', amount:30, date:m(-1,6), category:'Entertainment', payment:'Card'};
  store['users/u1/goals/g1'] = {name:'Emergency fund', icon:'🛟', color:'#10ac84', target:6000, saved:1200, startDate:m(-6,1), deadline:m(6,1)};
  store['users/u1/goals/g2'] = {name:'New laptop', icon:'💻', color:'#2e86de', target:1500, saved:1500, startDate:m(-3,1)};
  store['users/u1/expenses/u1x'] = {title:'UBER EATS 1234', amount:24.5, date:m(0,6), category:'Other', payment:'Card'};
  store['users/u1/expenses/u2x'] = {title:'UBER EATS 9981', amount:31.2, date:m(0,7), category:'Other', payment:'Card'};
  store['users/u1/settings/budgets'] = {limits:{_total:900, Food:300, Transport:200, Shopping:120}};
  store['users/u1/recurring/r1'] = {title:'Rent', amount:1850, category:'Bills', payment:'Bank Transfer', frequency:'monthly', anchorDay:31, startDate:m(-3,31), nextDate:m(-3,31), active:true};
  store['users/u1/recurring/r2'] = {title:'Netflix', amount:15.49, category:'Entertainment', payment:'Card', frequency:'monthly', anchorDay:28, startDate:m(1,28), nextDate:m(1,28), active:true};
})();
