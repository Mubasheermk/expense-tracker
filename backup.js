/* Spendly · Full backup and restore.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Backup & restore ---------------- */
const BACKUP_KEY = "spendly-last-backup";
// Firestore values → plain JSON (timestamps become ISO strings)
const toPlain = v => v && typeof v.toDate === "function" ? { __ts: v.toDate().toISOString() }
  : Array.isArray(v) ? v.map(toPlain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)])) : v;
const fromPlain = v => v && v.__ts ? firebase.firestore.Timestamp.fromDate(new Date(v.__ts))
  : Array.isArray(v) ? v.map(fromPlain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromPlain(x)])) : v;

async function makeBackup(){
  const [ex, rec, gl, bud, cat, rul] = await Promise.all([expensesRef.get(), recurringRef.get(), goalsRef.get(), budgetRef.get(), catsRef.get(),
    expensesRef.parent.collection("settings").doc("rules").get().catch(() => null)]);
  const docs = snap => snap.docs.map(d => ({ id:d.id, ...toPlain(d.data()) }));
  return { app:"spendly", version:1, exportedAt:new Date().toISOString(),
    counts:{ transactions:ex.size, recurring:rec.size, goals:gl.size },
    data:{ expenses:docs(ex), recurring:docs(rec), goals:docs(gl),
      settings:{ budgets: bud.exists ? toPlain(bud.data()) : null, categories: cat.exists ? toPlain(cat.data()) : null,
        rules: rul && rul.exists ? toPlain(rul.data()) : null } } };
}
function updateBackupNote(){
  let t = null; try{ t = localStorage.getItem(BACKUP_KEY); }catch(e){}
  if(!t){ $("backupNote").textContent = "Never backed up on this device"; return; }
  const days = Math.floor((Date.now() - +t) / 86400000);
  $("backupNote").textContent = `Last backup: ${days === 0 ? "today" : days === 1 ? "yesterday" : days + " days ago"}${days >= 30 ? " — time for a new one" : ""}`;
}
$("exportBtn").addEventListener("click", updateBackupNote);
$("backupBtn").addEventListener("click", async () => {
  if(!expensesRef) return;
  $("backupBtn").disabled = true;
  try{
    const b = await makeBackup();
    download(new Blob([JSON.stringify(b, null, 1)], { type:"application/json" }), `spendly-backup-${toKey(new Date())}.json`);
    try{ localStorage.setItem(BACKUP_KEY, String(Date.now())); }catch(e){}
    toast(`💾 Backed up ${b.counts.transactions} transactions, ${b.counts.recurring} recurring and ${b.counts.goals} goals`);
    $("exportMenu").hidden = true;
  }catch(err){ console.error(err); toast("Backup failed: " + err.message); }
  $("backupBtn").disabled = false;
});

let pendingBackup = null;
async function readBackupFile(file){
  try{
    if(file.size > 20 * 1024 * 1024) return toast("That backup is over 20 MB");
    const b = JSON.parse(await file.text());
    if(b.app !== "spendly" || !b.data || !Array.isArray(b.data.expenses)) return toast("That isn't a Spendly backup file");
    pendingBackup = b;
    const d = b.data, inc = d.expenses.filter(e => e.type === "income").length;
    const tile = (n, l) => `<div><b>${n}</b>${l}</div>`;
    $("rstFile").textContent = `💾 ${file.name} · made ${new Date(b.exportedAt).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})}`;
    $("rstSummary").innerHTML = tile(d.expenses.length - inc, "expenses") + tile(inc, "income") + tile((d.recurring || []).length, "recurring")
      + tile((d.goals || []).length, "goals") + tile(d.settings && d.settings.budgets ? Object.keys(d.settings.budgets.limits || {}).length : 0, "budgets")
      + tile(d.settings && d.settings.categories ? (d.settings.categories.custom || []).length : 0, "custom categories");
    document.querySelector('input[name="rstMode"][value="merge"]').checked = true;
    showImpStep("R");
  }catch(err){ console.error(err); toast("Couldn't read that backup: " + err.message); }
}
$("rstBack").addEventListener("click", () => { $("impFile").value = ""; showImpStep(1); });
$("rstGo").addEventListener("click", async () => {
  const b = pendingBackup; if(!b || !expensesRef) return;
  const mode = document.querySelector('input[name="rstMode"]:checked').value;
  if(mode === "replace" && !confirm("Replace deletes all current transactions, recurring items and goals before restoring. Continue?")) return;
  $("rstGo").disabled = true;
  const ops = [];   // [kind, ref, data]
  const coll = { expenses:expensesRef, recurring:recurringRef, goals:goalsRef };
  const clean = o => { const { id, ...rest } = o; return fromPlain(rest); };
  try{
    if(mode === "replace"){
      const keep = Object.fromEntries(Object.keys(coll).map(k => [k, new Set((b.data[k] || []).map(x => x.id))]));
      for(const k of Object.keys(coll)){ const snap = await coll[k].get(); snap.docs.forEach(d => { if(!keep[k].has(d.id)) ops.push(["del", d.ref]); }); }
    }
    for(const k of Object.keys(coll)) (b.data[k] || []).forEach(x => { if(x && x.id && /^[A-Za-z0-9_-]{1,100}$/.test(x.id)) ops.push(["set", coll[k].doc(x.id), clean(x)]); });
    let failed = 0;
    // Settings are written one by one so a single rejected document can't fail a whole batch
    const st = b.data.settings || {};
    const settingsRefs = { budgets:budgetRef, categories:catsRef, rules:expensesRef.parent.collection("settings").doc("rules") };
    for(const [k, ref] of Object.entries(settingsRefs)) if(st[k]) await ref.set(fromPlain(st[k])).catch(err => { console.error(k, err); failed++; });
    for(let i = 0; i < ops.length; i += 400){
      const batch = db.batch();
      ops.slice(i, i + 400).forEach(([kind, ref, data]) => kind === "del" ? batch.delete(ref) : batch.set(ref, data));
      await batch.commit().catch(err => { console.error(err); failed += Math.min(400, ops.length - i); });
    }
    const n = (b.data.expenses || []).length;
    $("impDoneMsg").textContent = failed ? `Restore finished with problems — ${failed} changes were rejected` : `Restored ${n} transactions, ${(b.data.recurring || []).length} recurring items and ${(b.data.goals || []).length} goals`;
    $("impUndo").disabled = true; $("impUndo").hidden = true; $("impDoneNote").textContent = "Everything from the backup is back in Spendly."; showImpStep(3);
  }catch(err){ console.error(err); toast("Restore failed: " + err.message); }
  $("rstGo").disabled = false;
});
