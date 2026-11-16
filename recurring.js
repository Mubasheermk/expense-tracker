/* Spendly · Recurring expenses and income.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Recurring expenses ---------------- */
const FREQ_LABEL = { weekly:"Weekly", monthly:"Monthly", yearly:"Yearly" };
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
function advanceDate(r, key){
  const d = parseKey(key);
  if(r.frequency === "weekly") return toKey(addDays(d, 7));
  const day = r.anchorDay || d.getDate();
  if(r.frequency === "yearly"){ const y = d.getFullYear() + 1, m = d.getMonth(); return toKey(new Date(y, m, Math.min(day, daysIn(y, m)))); }
  let y = d.getFullYear(), m = d.getMonth() + 1; if(m > 11){ m = 0; y++; }
  return toKey(new Date(y, m, Math.min(day, daysIn(y, m))));
}

// Create any expenses that are due. Generated IDs are deterministic (rec_<rule>_<date>),
// so running this on two devices at once can never create duplicates.
let processing = false;
async function processRecurring(){
  if(processing || !recurringRef) return;
  const today = toKey(new Date());
  const due = recurring.filter(r => r.active !== false && r.nextDate && r.nextDate <= today);
  if(!due.length) return;
  processing = true;
  let created = 0;
  try{
    for(const r of due){
      const batch = db.batch(); let next = r.nextDate, n = 0;
      while(next <= today && n < 100){
        batch.set(expensesRef.doc(`rec_${r.id}_${next}`), {
          title:r.title, amount:r.amount, date:next, category:r.category, payment:r.payment,
          ...(r.note ? { note:r.note } : {}), ...(r.tags && r.tags.length ? { tags:r.tags } : {}),
          ...(r.type === "income" ? { type:"income" } : {}),
          recurringId:r.id, createdAt:TS()
        });
        next = advanceDate(r, next); n++;
      }
      batch.update(recurringRef.doc(r.id), { nextDate:next, updatedAt:TS() });
      r.nextDate = next;              // avoid re-processing before the snapshot arrives
      batch.commit().catch(err => { console.error(err); toast("Recurring error: " + err.message); });
      created += n;
    }
    if(created) toast(`🔁 Added ${created} recurring expense${created===1?"":"s"}`);
  } finally { processing = false; }
}

function renderRecurring(){
  if(!recurring.length){ $("recurringList").innerHTML = `<div class="empty">No recurring expenses yet.<br>Choose <b>Repeat → Monthly</b> when adding rent, subscriptions or bills.</div>`; return; }
  const sorted = recurring.slice().sort((a,b) => (a.active===false) - (b.active===false) || (a.nextDate > b.nextDate ? 1 : -1));
  const perMonth = r => r.frequency==="weekly" ? r.amount*52/12 : r.frequency==="yearly" ? r.amount/12 : r.amount;
  const active = recurring.filter(r => r.active !== false);
  const monthlyCost = active.filter(r => r.type !== "income").reduce((s,r) => s + perMonth(r), 0);
  const monthlyIn = active.filter(r => r.type === "income").reduce((s,r) => s + perMonth(r), 0);
  $("recurringList").innerHTML = sorted.map(r => {
    const c = catMap[r.category] || catMap.Other; const paused = r.active === false;
    const next = r.nextDate ? parseKey(r.nextDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
    return `<div class="rec ${paused?"paused":""}">
      <div class="ic" style="background:${c.color}22">${c.icon}</div>
      <div class="info"><div class="t">${esc(r.title)}</div>
        <div class="m">${FREQ_LABEL[r.frequency]||""} · ${paused ? "Paused" : "Next " + next}</div></div>
      <div class="a" style="color:${r.type === "income" ? "#10ac84" : c.color}">${r.type === "income" ? "+" : ""}${fmt(r.amount)}</div>
      <button data-rid="${r.id}" data-ract="toggle" title="${paused?"Resume":"Pause"}">${paused?"▶️":"⏸️"}</button>
      <button data-rid="${r.id}" data-ract="del" title="Stop repeating">🗑️</button>
    </div>`;
  }).join("") + `<div class="sub-h" style="margin-top:6px">≈ <b>${fmt(monthlyCost)}</b> per month out${monthlyIn ? ` · <b class="down-t">+${fmt(monthlyIn)}</b> in` : ""} from active recurring items</div>`;
}

$("recurringList").addEventListener("click", async e => {
  const b = e.target.closest("button[data-rid]"); if(!b) return;
  const r = recurring.find(x => x.id === b.dataset.rid); if(!r) return;
  try{
    if(b.dataset.ract === "del"){
      if(!confirm(`Stop repeating "${r.title}"? Expenses already added stay in your history.`)) return;
      recurringRef.doc(r.id).delete().catch(err => toast("Error: " + err.message));
      toast("🗑️ Recurring expense removed");
    } else if(r.active === false){
      // Resume without back-filling the paused period: skip forward to today or later
      const today = toKey(new Date()); let next = r.nextDate || today;
      while(next < today) next = advanceDate(r, next);
      recurringRef.doc(r.id).update({ active:true, nextDate:next, updatedAt:TS() }).catch(err => toast("Error: " + err.message));
      toast("▶️ Resumed");
    } else {
      recurringRef.doc(r.id).update({ active:false, updatedAt:TS() }).catch(err => toast("Error: " + err.message));
      toast("⏸️ Paused");
    }
  }catch(err){ toast("Error: " + err.message); }
});
