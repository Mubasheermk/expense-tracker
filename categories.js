/* Spendly · Custom categories and budgets.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Custom categories ---------------- */
const QUICK_ICONS = ["🏠","🐶","🎁","💼","☕","🍷","🏋️","🎮","👶","🚌","💇","🧹","🛠️","📱","🌱","🧾","⛽","🎓","💝","🏦"];
const CAT_COLORS = ["#e84393","#0984e3","#00b894","#fdcb6e","#6c5ce7","#e17055","#00cec9","#d63031","#a29bfe","#2d3436"];
function renderCatManager(){
  $("catCustomList").innerHTML = customCats.length
    ? customCats.map((c,i) => `<div class="rec"><div class="ic" style="background:${c.color}22">${esc(c.icon)}</div>
        <div class="info"><div class="t">${esc(c.name)}</div><div class="m"><span class="swatch" style="background:${c.color}"></span>${c.color}</div></div>
        <button type="button" data-cdel="${i}" title="Remove category">🗑️</button></div>`).join("")
    : `<div class="empty" style="padding:14px 0">No custom categories yet.</div>`;
  $("catCount").textContent = `${customCats.length}/20`;
}
function openCats(){
  $("catIcon").value = "🏷️"; $("catName").value = "";
  $("catColor").value = CAT_COLORS[customCats.length % CAT_COLORS.length];
  $("quickIcons").innerHTML = QUICK_ICONS.map(i => `<button type="button" data-qi="${i}">${i}</button>`).join("");
  renderCatManager(); $("catModal").hidden = false; setTimeout(() => $("catName").focus(), 50);
}
const closeCats = () => { $("catModal").hidden = true; };
const saveCats = list => catsRef.set({ custom:list, updatedAt:TS() }).catch(err => toast("Error: " + err.message));
$("closeCats").addEventListener("click", closeCats);
$("doneCats").addEventListener("click", closeCats);
$("catModal").addEventListener("click", e => {
  if(e.target.id === "catModal") return closeCats();
  const qi = e.target.closest("[data-qi]"); if(qi){ $("catIcon").value = qi.dataset.qi; return; }
  const del = e.target.closest("[data-cdel]"); if(!del) return;
  const c = customCats[+del.dataset.cdel];
  if(!confirm(`Remove the "${c.name}" category? Existing expenses keep the name but show as Other.`)) return;
  saveCats(customCats.filter((_,i) => i !== +del.dataset.cdel)); toast(`🗑️ Removed ${c.name}`);
});
$("catForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("catName").value.trim().replace(/\s+/g, " ");
  const icon = ([...($("catIcon").value.trim())].slice(0, 2).join("")) || "🏷️";
  const color = /^#[0-9a-f]{6}$/i.test($("catColor").value) ? $("catColor").value : "#778ca3";
  if(!/^[\p{L}\p{N} &'-]{1,20}$/u.test(name)) return toast("Use 1–20 letters, numbers, spaces, & ' or -");
  if(CATEGORIES.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast("That category already exists");
  if(customCats.length >= 20) return toast("You can add up to 20 categories");
  saveCats([...customCats, { name, icon, color }]);
  selectedCat = name; toast(`✅ Added ${icon} ${name}`);
  $("catName").value = ""; $("catColor").value = CAT_COLORS[(customCats.length + 1) % CAT_COLORS.length];
});

/* ---------------- Budgets ---------------- */
function monthSpend(){
  const r = periodRange("month", new Date()); const by = {}; let total = 0;
  expenses.filter(e => inRange(e, r)).forEach(e => { by[e.category] = (by[e.category]||0) + e.amount; total += e.amount; });
  return { by, total };
}
function budgetRow(name, icon, spent, limit, color, isTotal){
  const pct = limit > 0 ? spent / limit * 100 : 0;
  const cls = pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok";
  const barColor = cls === "over" ? "linear-gradient(90deg,#ff6b6b,#e74c3c)" : cls === "warn" ? "linear-gradient(90deg,#feca57,#ff9f43)" : `linear-gradient(90deg,${color}aa,${color})`;
  const left = limit - spent;
  const note = cls === "over" ? `${fmt(-left)} over budget` : cls === "warn" ? `${Math.round(pct)}% used · ${fmt(left)} left` : `${fmt(left)} left`;
  return `<div class="bud ${isTotal?"total":""}">
    <div class="bud-top"><span class="nm">${icon} ${name}</span><span class="vals"><b>${fmt(spent)}</b> of ${fmt(limit)}</span></div>
    <div class="bar"><i style="width:${Math.min(pct,100)}%;background:${barColor}"></i></div>
    <div class="bud-note ${cls}-t">${note}</div></div>`;
}
function renderBudgets(){
  const now = new Date();
  $("budgetMonth").textContent = `· ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const keys = Object.keys(budgets).filter(k => budgets[k] > 0);
  if(!keys.length){ $("budgetList").innerHTML = `<div class="empty">No budgets yet.<br>Click <b>Edit budgets</b> to set monthly limits.</div>`; return; }
  const { by, total } = monthSpend();
  let html = "";
  if(budgets._total > 0) html += budgetRow("All spending", "💰", total, budgets._total, "#8854d0", true);
  CATEGORIES.filter(c => budgets[c.name] > 0)
    .sort((a,b) => (by[b.name]||0)/budgets[b.name] - (by[a.name]||0)/budgets[a.name])
    .forEach(c => html += budgetRow(c.name, c.icon, by[c.name]||0, budgets[c.name], c.color));
  $("budgetList").innerHTML = html;
}
function budgetAlert(category){ setTimeout(() => budgetAlertNow(category), 2300); }   // after the toast and local snapshot
function budgetAlertNow(category){
  const { by, total } = monthSpend(); const msgs = [];
  const check = (label, spent, limit) => { if(!(limit > 0)) return; const p = spent/limit*100;
    if(p >= 100) msgs.push(`🚨 ${label} is over budget (${Math.round(p)}%)`); else if(p >= 80) msgs.push(`⚠️ ${label} is at ${Math.round(p)}% of budget`); };
  check(category, by[category]||0, budgets[category]);
  check("Total", total, budgets._total);
  if(msgs.length) toast(msgs[0]);
}

function openBudgets(){
  const field = (key, label, extra="") => `<div class="row ${extra}"><label for="b_${key}">${label}</label>
    <input id="b_${key}" data-key="${key}" type="number" min="0" step="1" placeholder="No budget" value="${budgets[key] > 0 ? budgets[key] : ""}" /></div>`;
  $("budgetInputs").innerHTML = field("_total", "💰 Total monthly budget", "full") + CATEGORIES.map(c => field(c.name, `${c.icon} ${c.name}`)).join("");
  $("budgetModal").hidden = false;
}
const closeBudgets = () => { $("budgetModal").hidden = true; };
$("editBudgetsBtn").addEventListener("click", openBudgets);
$("closeBudget").addEventListener("click", closeBudgets);
$("cancelBudget").addEventListener("click", closeBudgets);
$("budgetModal").addEventListener("click", e => { if(e.target.id === "budgetModal") closeBudgets(); });
$("budgetForm").addEventListener("submit", e => {
  e.preventDefault();
  const limits = {};
  $("budgetInputs").querySelectorAll("input").forEach(i => { const v = Math.round(parseFloat(i.value)*100)/100; if(v > 0) limits[i.dataset.key] = v; });
  budgetRef.set({ limits, updatedAt:TS() }).catch(err => toast("Error: " + err.message));
  closeBudgets(); toast("🎯 Budgets saved");
});
