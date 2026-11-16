/* Spendly · Smart category rules and bulk select.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Smart rules ---------------- */
let ruleTimer;
$("fTitle").addEventListener("input", () => {
  clearTimeout(ruleTimer);
  ruleTimer = setTimeout(() => {
    if(editingId || catTouched) return;
    const r = matchRule($("fTitle").value, formType); const hint = $("ruleHint");
    if(r){ selectedCat = r.category; renderChips(); hint.textContent = `🪄 ${r.category} (your rule “${r.match}”)`; } else hint.textContent = "";
  }, 200);
});
function ruleCatOptions(){
  const list = $("ruleType").value === "income" ? INCOME_CATEGORIES : CATEGORIES;
  $("ruleCat").innerHTML = list.map(c => `<option value="${esc(c.name)}">${esc(c.icon)} ${esc(c.name)}</option>`).join("");
}
const ruleMatches = r => allRecords.filter(e => (isIncome(e) ? "income" : "expense") === (r.type || "expense") && (" " + normText(e.title) + " ").includes(" " + normText(r.match)));
function renderRules(){
  $("rulesCount").textContent = `${userRules.length}/50`;
  $("rulesList").innerHTML = userRules.length ? userRules.map((r, i) => { const c = catMap[r.category] || catMap.Other, m = ruleMatches(r), off = m.filter(e => e.category !== r.category).length;
    return `<div class="rule"><div class="rm">Contains <code>${esc(r.match)}</code> → <b style="color:${c.color}">${esc(c.icon)} ${esc(r.category)}</b>${r.type === "income" ? " <span class='rn'>(income)</span>" : ""}
      <div class="rn">${m.length} transaction${m.length === 1 ? "" : "s"} match${off ? ` · ${off} filed differently` : ""}</div></div>
      <button type="button" data-rdel="${i}" title="Delete rule">🗑️</button></div>`; }).join("")
    : `<div class="empty" style="padding:14px 0">No rules yet. Example: “uber eats” → Food, “payroll” → Salary.</div>`;
  const changes = pendingRuleChanges();
  $("rulesApply").textContent = changes.length ? `Apply rules to ${changes.length} existing transaction${changes.length === 1 ? "" : "s"}` : "Existing transactions already match";
  $("rulesApply").disabled = !changes.length;
}
// Existing transactions whose category differs from what the first matching rule says
function pendingRuleChanges(){
  return allRecords.map(e => { const r = matchRule(e.title, isIncome(e) ? "income" : "expense"); return r && r.category !== e.category ? [e, r.category] : null; }).filter(Boolean);
}
const saveRules = list => rulesRef.set({ rules:list, updatedAt:TS() }).catch(err => toast("Error: " + err.message));
function addRule(match, category, type){
  match = match.trim().replace(/\s+/g, " ").slice(0, 40);
  if(match.length < 2) return toast("Use at least 2 characters"), false;
  if(userRules.length >= 50) return toast("You can have up to 50 rules"), false;
  const rest = userRules.filter(r => !(r.match.toLowerCase() === match.toLowerCase() && (r.type || "expense") === type));
  saveRules([{ match, category, type }, ...rest]); return true;
}
function openRules(){ ruleCatOptions(); $("ruleMatch").value = ""; renderRules(); $("rulesModal").hidden = false; setTimeout(() => $("ruleMatch").focus(), 50); }
const closeRules = () => { $("rulesModal").hidden = true; };
$("rulesBtn").addEventListener("click", openRules);
$("rulesClose").addEventListener("click", closeRules);
$("rulesDone").addEventListener("click", closeRules);
$("ruleType").addEventListener("change", ruleCatOptions);
$("rulesModal").addEventListener("click", e => {
  if(e.target.id === "rulesModal") return closeRules();
  const d = e.target.closest("[data-rdel]"); if(!d) return;
  saveRules(userRules.filter((_, i) => i !== +d.dataset.rdel)); toast("🗑️ Rule deleted");
});
$("ruleForm").addEventListener("submit", e => {
  e.preventDefault();
  if(addRule($("ruleMatch").value, $("ruleCat").value, $("ruleType").value)){ toast("🪄 Rule added"); $("ruleMatch").value = ""; }
});
$("rulesApply").addEventListener("click", () => {
  const ch = pendingRuleChanges(); if(!ch.length) return;
  if(!confirm(`Change the category of ${ch.length} transaction${ch.length === 1 ? "" : "s"} to match your rules?`)) return;
  for(let i = 0; i < ch.length; i += 400){ const b = db.batch(); ch.slice(i, i + 400).forEach(([e, cat]) => b.update(expensesRef.doc(e.id), { category:cat, updatedAt:TS() })); b.commit().catch(err => toast("Error: " + err.message)); }
  toast(`🪄 Updated ${ch.length} transaction${ch.length === 1 ? "" : "s"}`);
});

// Toast with an action button (e.g. "Always file … as Food?")
function actionToast(msg, label, fn){
  const t = $("toast"); t.innerHTML = ""; t.append(msg);
  const b = document.createElement("button"); b.className = "t-act"; b.textContent = label;
  b.onclick = () => { fn(); t.classList.remove("show"); }; t.append(b);
  t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 7000);
}
// The shared start of several titles, cut at a word boundary ("UBER EATS 1234" + "UBER EATS 9" → "uber eats")
function commonPrefix(titles){
  const words = titles.map(t => normText(t).split(" ").filter(Boolean));
  if(!words.length || !words[0].length) return "";
  if(words.length === 1){
    // One title: keep the leading words before any store number like "#1234" or "5744"
    const raw = String(titles[0]).split(/[#*]|\d/)[0];
    return normText(raw).split(" ").filter(Boolean).slice(0, 2).join(" ");
  }
  // Several titles: the longest run of whole words they all start with
  const out = [];
  for(let i = 0; i < words[0].length; i++){ const w = words[0][i]; if(words.every(x => x[i] === w) && !/^\d+$/.test(w)) out.push(w); else break; }
  return out.join(" ");
}

/* ---------------- Bulk select ---------------- */
let selecting = false; const picked = new Set();
function enterSelect(){ selecting = true; picked.clear(); document.body.classList.add("selecting"); $("selectBtn").classList.add("on"); $("bulkBar").hidden = false; renderList(); updateBulk(); }
function exitSelect(){ selecting = false; picked.clear(); document.body.classList.remove("selecting"); if($("selectBtn")) $("selectBtn").classList.remove("on"); if($("bulkBar")) $("bulkBar").hidden = true; if(expensesRef) renderList(); }
function updateBulk(){
  const sel = allRecords.filter(e => picked.has(e.id)), shown = allRecords.filter(matchesFilter);
  $("bulkCount").textContent = `${sel.length} selected`;
  $("bulkAll").checked = shown.length > 0 && shown.every(e => picked.has(e.id));
  const types = new Set(sel.map(e => isIncome(e) ? "income" : "expense"));
  const list = types.size === 1 ? (types.has("income") ? INCOME_CATEGORIES : CATEGORIES) : [];
  $("bulkCat").innerHTML = `<option value="">${types.size > 1 ? "Mixed expense & income" : "Change category…"}</option>` + list.map(c => `<option value="${esc(c.name)}">${esc(c.icon)} ${esc(c.name)}</option>`).join("");
  ["bulkCat","bulkTag","bulkTagBtn","bulkDel"].forEach(id => $(id).disabled = !sel.length);
  if(types.size > 1) $("bulkCat").disabled = true;
}
$("selectBtn").addEventListener("click", () => selecting ? exitSelect() : enterSelect());
$("bulkDone").addEventListener("click", exitSelect);
$("bulkAll").addEventListener("change", e => { allRecords.filter(matchesFilter).forEach(x => e.target.checked ? picked.add(x.id) : picked.delete(x.id)); renderList(); updateBulk(); });
$("list").addEventListener("change", e => {
  const c = e.target.closest(".pick"); if(!c) return;
  c.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick);
  c.closest(".item").classList.toggle("picked", c.checked); updateBulk();
});
$("bulkCat").addEventListener("change", () => {
  const cat = $("bulkCat").value; if(!cat) return;
  const sel = allRecords.filter(e => picked.has(e.id) && e.category !== cat);
  for(let i = 0; i < sel.length; i += 400){ const b = db.batch(); sel.slice(i, i + 400).forEach(e => b.update(expensesRef.doc(e.id), { category:cat, updatedAt:TS() })); b.commit().catch(err => toast("Error: " + err.message)); }
  const all = allRecords.filter(e => picked.has(e.id)), type = isIncome(all[0]) ? "income" : "expense";
  const pref = commonPrefix(all.map(e => e.title || ""));
  exitSelect();
  if(pref.length >= 3 && !userRules.some(r => r.match.toLowerCase() === pref && r.category === cat))
    actionToast(`✅ Moved ${all.length} to ${cat}. `, `🪄 Always file “${pref}” as ${cat}`, () => { if(addRule(pref, cat, type)) toast(`🪄 Rule added: “${pref}” → ${cat}`); });
  else toast(`✅ Moved ${all.length} to ${cat}`);
});
$("bulkTagBtn").addEventListener("click", () => {
  const t = (parseTags("#" + $("bulkTag").value.replace(/^#/, ""))[0]); if(!t) return toast("Type a tag (letters, numbers, - or _)");
  const sel = allRecords.filter(e => picked.has(e.id)), ok = sel.filter(e => (e.tags || []).includes(t) || (e.tags || []).length < 10);
  for(let i = 0; i < ok.length; i += 400){ const b = db.batch(); ok.slice(i, i + 400).forEach(e => b.update(expensesRef.doc(e.id), { tags:firebase.firestore.FieldValue.arrayUnion(t), updatedAt:TS() })); b.commit().catch(err => toast("Error: " + err.message)); }
  $("bulkTag").value = ""; toast(`🏷️ Tagged ${ok.length} with #${t}${ok.length < sel.length ? ` (${sel.length - ok.length} already have 10 tags)` : ""}`);
});
$("bulkDel").addEventListener("click", () => {
  const ids = [...picked]; if(!ids.length) return;
  if(!confirm(`Delete ${ids.length} transaction${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
  for(let i = 0; i < ids.length; i += 400){ const b = db.batch(); ids.slice(i, i + 400).forEach(id => b.delete(expensesRef.doc(id))); b.commit().catch(err => toast("Error: " + err.message)); }
  toast(`🗑️ Deleted ${ids.length} transaction${ids.length === 1 ? "" : "s"}`); exitSelect();
});
document.addEventListener("keydown", e => { if(e.key === "Escape" && selecting && $("rulesModal").hidden) exitSelect(); });
