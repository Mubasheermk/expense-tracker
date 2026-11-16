/* Spendly · Upcoming bills and device reminders.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Upcoming bills ---------------- */
// Future dates of every active recurring item within the next N days
function upcomingItems(days){
  const today = startOfDay(new Date()), endK = toKey(addDays(today, days)), todayK = toKey(today), out = [];
  recurring.filter(r => r.active !== false && r.nextDate).forEach(r => {
    let d = r.nextDate, n = 0;
    while(d < todayK && n < 400){ d = advanceDate(r, d); n++; }           // skip anything not yet caught up
    while(d <= endK && n < 400){ out.push({ rule:r, date:d }); d = advanceDate(r, d); n++; }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.rule.amount - a.rule.amount);
}
const daysUntil = k => Math.round((parseKey(k) - startOfDay(new Date())) / 86400000);
function whenText(k){ const n = daysUntil(k); return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`; }
function renderUpcoming(){
  const days = +$("upDays").value, items = upcomingItems(days);
  const out = sum(items.filter(i => i.rule.type !== "income").map(i => i.rule)), inn = sum(items.filter(i => i.rule.type === "income").map(i => i.rule));
  // Still due this calendar month (from today on)
  const now = new Date(), monthEndDays = daysIn(now.getFullYear(), now.getMonth()) - now.getDate();
  const leftThisMonth = sum(upcomingItems(monthEndDays).filter(i => i.rule.type !== "income").map(i => i.rule));
  $("upSub").textContent = items.length ? `· ${fmt(out)} due${inn ? ` · +${fmt(inn)} expected` : ""} · ${fmt(leftThisMonth)} left to pay in ${MONTHS[now.getMonth()]}` : "";
  if(!recurring.some(r => r.active !== false)){
    $("upcoming").innerHTML = `<div class="empty" style="grid-column:1/-1">No recurring bills yet. Add rent, subscriptions or paychecks with <b>Repeat</b> in the form, and they'll show up here before they're due.</div>`; return;
  }
  if(!items.length){ $("upcoming").innerHTML = `<div class="empty" style="grid-column:1/-1">Nothing due in the next ${days} days. 🎉</div>`; return; }
  $("upcoming").innerHTML = items.map(({ rule:r, date }) => {
    const c = catMap[r.category] || catMap.Other, d = parseKey(date), n = daysUntil(date), inc = r.type === "income";
    return `<div class="up ${n <= 3 && !inc ? "soon" : ""}" style="--c:${inc ? "#10ac84" : c.color}">
      <div class="ud"><span>${DOW[(d.getDay() + 6) % 7]}</span><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()]}</span></div>
      <div class="ui"><div class="ut">${esc(c.icon)} ${esc(r.title)}</div>
        <div class="um">${whenText(date)} · ${FREQ_LABEL[r.frequency] || ""}${n <= 3 && !inc ? ` <span class="badge b-soon">Soon</span>` : ""}</div></div>
      <div class="ua" style="color:${inc ? "#10ac84" : "var(--text)"}">${inc ? "+" : ""}${fmt(r.amount)}</div></div>`;
  }).join("");
}
$("upDays").addEventListener("change", renderUpcoming);

/* ---------------- Reminders (notifications on this device) ---------------- */
const REMIND_KEY = "spendly-reminders", NOTIFIED_KEY = "spendly-notified";
const remindPrefs = () => { try{ return { on:false, days:1, income:false, ...JSON.parse(localStorage.getItem(REMIND_KEY) || "{}") }; }catch(e){ return { on:false, days:1, income:false }; } };
const canNotify = () => "Notification" in window;
function remindStatusText(){
  if(!canNotify()) return "⚠️ This browser doesn't support notifications. On iPhone, add Spendly to your Home Screen and open it from there.";
  if(Notification.permission === "denied") return "🚫 Notifications are blocked for this site. Allow them in your browser's site settings, then try again.";
  if(Notification.permission === "granted") return remindPrefs().on ? "✅ Reminders are on for this device." : "Notifications are allowed — tick “Remind me” and Save.";
  return "You'll be asked to allow notifications when you save.";
}
function openRemind(){
  const p = remindPrefs(); $("remindOn").checked = p.on; $("remindDays").value = String(p.days); $("remindIncome").checked = !!p.income;
  $("remindStatus").textContent = remindStatusText(); $("remindModal").hidden = false;
}
const closeRemind = () => { $("remindModal").hidden = true; };
$("remindBtn").addEventListener("click", openRemind);
$("remindClose").addEventListener("click", closeRemind);
$("remindModal").addEventListener("click", e => { if(e.target.id === "remindModal") closeRemind(); });
async function ensurePermission(){
  if(!canNotify()) return false;
  if(Notification.permission === "granted") return true;
  if(Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}
async function notify(title, body, tag){
  try{
    let reg = null;
    try{ reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null; }catch(e){ reg = null; }   // fall back to a plain notification
    const opts = { body, tag, icon:"icons/icon-192.png", badge:"icons/icon-192.png" };
    if(reg && reg.showNotification) await reg.showNotification(title, opts); else new Notification(title, opts);
    return true;
  }catch(err){ console.error(err); return false; }
}
$("remindSave").addEventListener("click", async () => {
  const prefs = { on:$("remindOn").checked, days:+$("remindDays").value, income:$("remindIncome").checked };
  if(prefs.on && !(await ensurePermission())){ prefs.on = false; $("remindOn").checked = false; $("remindStatus").textContent = remindStatusText(); toast("Notifications weren't allowed"); }
  try{ localStorage.setItem(REMIND_KEY, JSON.stringify(prefs)); }catch(e){}
  $("remindBtn").classList.toggle("on", prefs.on);
  $("remindStatus").textContent = remindStatusText();
  if(prefs.on){ toast("🔔 Reminders on for this device"); closeRemind(); checkReminders(); } else toast("🔕 Reminders off");
});
$("remindTest").addEventListener("click", async () => {
  if(!(await ensurePermission())){ $("remindStatus").textContent = remindStatusText(); return; }
  const ok = await notify("Spendly test 🔔", "Reminders work on this device.", "spendly-test");
  $("remindStatus").textContent = ok ? "✅ Test sent — check your notifications." : "Couldn't show a notification on this device.";
});
// Notify once per bill and due date; grouped into one notification
async function checkReminders(){
  const p = remindPrefs(); $("remindBtn").classList.toggle("on", p.on);
  if(!p.on || !canNotify() || Notification.permission !== "granted" || !recurring.length) return;
  let seen = []; try{ seen = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]"); }catch(e){}
  const todayK = toKey(new Date());
  seen = seen.filter(k => k.split("|")[1] >= todayK);                     // forget past dates
  const due = upcomingItems(p.days).filter(i => (p.income || i.rule.type !== "income") && !seen.includes(`${i.rule.id}|${i.date}`));
  if(!due.length){ try{ localStorage.setItem(NOTIFIED_KEY, JSON.stringify(seen)); }catch(e){} return; }
  const line = i => `${i.rule.type === "income" ? "💵" : "💸"} ${i.rule.title} ${i.rule.type === "income" ? "+" : ""}${fmt(i.rule.amount)} · ${whenText(i.date).toLowerCase()}`;
  const title = due.length === 1 ? `${due[0].rule.type === "income" ? "Income expected" : "Bill due"} ${whenText(due[0].date).toLowerCase()}` : `${due.length} bills coming up`;
  const ok = await notify(title, due.slice(0, 5).map(line).join("\n") + (due.length > 5 ? `\n+${due.length - 5} more` : ""), "spendly-bills");
  if(ok){ seen.push(...due.map(i => `${i.rule.id}|${i.date}`)); try{ localStorage.setItem(NOTIFIED_KEY, JSON.stringify(seen)); }catch(e){} }
}
setInterval(checkReminders, 30 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") checkReminders(); });
