/* Spendly · Savings goals.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Savings goals ---------------- */
const GOAL_ICONS = ["🛟","🏖️","🏠","🚗","🎓","💍","👶","💻","✈️","🎁","🏦","📈","🩺","🐶","🎸","🌴"];
const GOAL_COLORS = ["#10ac84","#2e86de","#8854d0","#ff9f43","#ff4d8d","#00c9a7","#e84393","#6c5ce7"];
let editingGoal = null, fundingGoal = null, fundMode = "add";
const monthsBetween = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30.4;

function goalStatus(g){
  const saved = g.saved || 0, target = g.target || 1, pct = Math.min(saved / target, 1);
  if(saved >= target) return { key:"done", label:"Reached 🎉", pct, note:"Goal reached — nice work!" };
  if(!g.deadline) return { key:"free", label:"No date", pct, note:`${fmt(target - saved)} to go` };
  const today = startOfDay(new Date()), end = parseKey(g.deadline);
  const start = g.startDate ? parseKey(g.startDate) : today;
  const left = target - saved;
  if(end <= today) return { key:"behind", label:"Past due", pct, note:`${fmt(left)} short — target date has passed` };
  const monthsLeft = Math.max(monthsBetween(today, end), 0.5);
  const perMonth = left / monthsLeft;
  const total = Math.max((end - start) / 86400000, 1), elapsed = Math.max((today - start) / 86400000, 0);
  const expected = target * Math.min(elapsed / total, 1);
  const onTrack = saved + 0.005 >= expected;
  return { key: onTrack ? "on" : "behind", label: onTrack ? "On track" : "Behind", pct,
    note: `${fmt(perMonth)}/mo needed · by ${end.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}` };
}
function ringSVG(pct, color){
  const r = 32, c = 2 * Math.PI * r;
  return `<svg width="76" height="76" viewBox="0 0 76 76"><circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--soft)" stroke-width="8"/>
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" style="transition:stroke-dasharray .6s"/></svg>`;
}
function renderGoals(){
  if(!goals.length){
    $("goalsSub").textContent = "";
    $("goals").innerHTML = `<div class="empty" style="grid-column:1/-1">No goals yet. Click <b>＋ New goal</b> to start saving for an emergency fund, a trip or a big purchase.</div>`;
    return;
  }
  const totalSaved = goals.reduce((a, g) => a + (g.saved || 0), 0), totalTarget = goals.reduce((a, g) => a + (g.target || 0), 0);
  $("goalsSub").textContent = `· ${fmt(totalSaved)} of ${fmt(totalTarget)} saved`;
  const order = { behind:0, on:1, free:2, done:3 };
  $("goals").innerHTML = goals.map(g => ({ g, st:goalStatus(g) }))
    .sort((a, b) => order[a.st.key] - order[b.st.key] || (a.g.deadline || "9999") .localeCompare(b.g.deadline || "9999"))
    .map(({ g, st }) => `<div class="goal">
      <div class="ring">${ringSVG(st.pct, g.color || "#10ac84")}<div class="rp">${Math.floor(st.pct * 100)}%</div></div>
      <div class="gi">
        <div class="gn" title="${esc(g.name)}">${esc(g.icon || "🏁")} ${esc(g.name)}</div>
        <div class="gv"><b>${fmt(g.saved || 0)}</b> of ${fmt(g.target)} <span class="badge b-${st.key}">${st.label}</span></div>
        <div class="gm">${st.note}</div>
        <div class="gb">
          ${st.key === "done" ? "" : `<button type="button" class="add" data-gfund="${g.id}">＋ Add money</button>`}
          <button type="button" data-gwd="${g.id}">− Withdraw</button>
          <button type="button" data-gedit="${g.id}">✏️ Edit</button>
        </div>
      </div></div>`).join("");
}

function openGoal(g){
  editingGoal = g ? g.id : null;
  $("goalModalTitle").textContent = g ? "✏️ Edit goal" : "🏁 New savings goal";
  $("goalSave").textContent = g ? "Save changes" : "Create goal";
  $("gIcon").value = g ? (g.icon || "🏁") : "🛟";
  $("gName").value = g ? g.name : "";
  $("gColor").value = g ? (g.color || "#10ac84") : GOAL_COLORS[goals.length % GOAL_COLORS.length];
  $("gTarget").value = g ? g.target : "";
  $("gDeadline").value = g ? (g.deadline || "") : "";
  $("gStart").value = ""; $("gStartRow").hidden = !!g; $("goalDelete").hidden = !g;
  $("gQuickIcons").innerHTML = GOAL_ICONS.map(i => `<button type="button" data-qi="${i}">${i}</button>`).join("");
  $("goalModal").hidden = false; setTimeout(() => $("gName").focus(), 50);
}
const closeGoal = () => { $("goalModal").hidden = true; };
$("newGoalBtn").addEventListener("click", () => { if(goals.length >= 20) return toast("You can have up to 20 goals"); openGoal(null); });
$("goalClose").addEventListener("click", closeGoal);
$("goalModal").addEventListener("click", e => {
  if(e.target.id === "goalModal") return closeGoal();
  const qi = e.target.closest("[data-qi]"); if(qi) $("gIcon").value = qi.dataset.qi;
});
$("goalForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("gName").value.trim().replace(/\s+/g, " ").slice(0, 40);
  const target = Math.round(parseFloat($("gTarget").value) * 100) / 100;
  const deadline = $("gDeadline").value || null;
  if(!name) return toast("Give your goal a name");
  if(!(target > 0) || target >= 100000000) return toast("Enter a target amount");
  if(deadline && deadline <= toKey(new Date()) && !editingGoal) return toast("Pick a target date in the future");
  const data = { name, target, icon:([...($("gIcon").value.trim())].slice(0, 2).join("")) || "🏁",
    color:/^#[0-9a-f]{6}$/i.test($("gColor").value) ? $("gColor").value : "#10ac84", updatedAt:TS() };
  const fail = err => toast("Error: " + err.message);
  if(editingGoal){
    goalsRef.doc(editingGoal).update({ ...data, deadline: deadline || firebase.firestore.FieldValue.delete() }).catch(fail);
    toast("✏️ Goal updated");
  } else {
    const start = Math.max(Math.round((parseFloat($("gStart").value) || 0) * 100) / 100, 0);
    goalsRef.add({ ...data, ...(deadline ? { deadline } : {}), saved:start, startDate:toKey(new Date()), createdAt:TS() }).catch(fail);
    toast(`🏁 Goal "${name}" created`);
  }
  closeGoal();
});
$("goalDelete").addEventListener("click", () => {
  const g = goals.find(x => x.id === editingGoal); if(!g) return;
  if(!confirm(`Delete the goal "${g.name}"? This doesn't change any expenses or income.`)) return;
  goalsRef.doc(g.id).delete().catch(err => toast("Error: " + err.message));
  toast("🗑️ Goal deleted"); closeGoal();
});

// Add / withdraw money
function openFund(g, mode){
  fundingGoal = g.id; setFundMode(mode);
  $("fundTitle").textContent = `${g.icon || "🏁"} ${g.name}`;
  $("fundAmt").value = "";
  const { net } = (() => { const r = periodRange("month", new Date());
    return { net: sum(incomes.filter(e => inRange(e, r))) - sum(expenses.filter(e => inRange(e, r))) }; })();
  const left = Math.max((g.target || 0) - (g.saved || 0), 0);
  const quick = [25, 50, 100, 250].map(v => `<button type="button" data-fq="${v}" style="width:auto;padding:0 10px">$${v}</button>`);
  if(left > 0) quick.push(`<button type="button" data-fq="${left.toFixed(2)}" style="width:auto;padding:0 10px">Rest: ${fmt(left)}</button>`);
  if(net > 0) quick.push(`<button type="button" data-fq="${net.toFixed(2)}" style="width:auto;padding:0 10px" title="This month's income minus spending">This month's net: ${fmt(net)}</button>`);
  $("fundQuick").innerHTML = quick.join("");
  $("fundModal").hidden = false; setTimeout(() => $("fundAmt").focus(), 50);
}
function setFundMode(m){
  fundMode = m;
  document.querySelectorAll("#fundSeg button").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
  $("fundSave").textContent = m === "add" ? "Add" : "Withdraw";
  $("fundQuick").hidden = m !== "add";
}
const closeFund = () => { $("fundModal").hidden = true; };
$("fundClose").addEventListener("click", closeFund);
$("fundSeg").addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if(b) setFundMode(b.dataset.mode); });
$("fundModal").addEventListener("click", e => {
  if(e.target.id === "fundModal") return closeFund();
  const q = e.target.closest("[data-fq]"); if(q) $("fundAmt").value = q.dataset.fq;
});
$("fundForm").addEventListener("submit", e => {
  e.preventDefault();
  const g = goals.find(x => x.id === fundingGoal); if(!g) return closeFund();
  let amt = Math.round(parseFloat($("fundAmt").value) * 100) / 100;
  if(!(amt > 0)) return toast("Enter an amount");
  if(fundMode === "withdraw") amt = -Math.min(amt, g.saved || 0);
  if(!amt) return toast("There's nothing saved in this goal yet");
  const newSaved = Math.round(((g.saved || 0) + amt) * 100) / 100;
  goalsRef.doc(g.id).update({ saved: firebase.firestore.FieldValue.increment(amt), updatedAt:TS() }).catch(err => toast("Error: " + err.message));
  closeFund();
  if(amt > 0 && newSaved >= g.target && (g.saved || 0) < g.target) toast(`🎉 You reached "${g.name}"!`);
  else toast(amt > 0 ? `💰 Added ${fmt(amt)} to ${g.name}` : `↩️ Withdrew ${fmt(-amt)} from ${g.name}`);
});
$("goals").addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b) return;
  const id = b.dataset.gfund || b.dataset.gwd || b.dataset.gedit; const g = goals.find(x => x.id === id); if(!g) return;
  if(b.dataset.gedit) openGoal(g); else openFund(g, b.dataset.gfund ? "add" : "withdraw");
});
