/* Spendly · Period controls, help tips, dark mode and installable-app setup (loaded last).
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Period controls ---------------- */
$("tabs").addEventListener("click", e => {
  const t = e.target.closest(".tab"); if(!t) return;
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active", x===t));
  period = t.dataset.p; renderCharts();
});
function shift(dir){
  const a = new Date(anchor);
  if(period==="day") a.setDate(a.getDate()+dir);
  if(period==="week") a.setDate(a.getDate()+7*dir);
  if(period==="month") a.setMonth(a.getMonth()+dir, 1);
  if(period==="year") a.setFullYear(a.getFullYear()+dir);
  anchor = a; renderCharts();
}
$("prev").addEventListener("click", ()=>shift(-1));
$("next").addEventListener("click", ()=>shift(1));
$("todayBtn").addEventListener("click", ()=>{ anchor = new Date(); renderCharts(); });

renderCharts();

/* ---------------- Help tips ---------------- */
const HELP = {
  add: ["Add a transaction", "Record what you spend or earn.", [
    "Switch <i>💸 Expense / 💵 Income</i> at the top right",
    "Add a note with <i>#tags</i> (e.g. #vacation) to group related items",
    "Set <i>Repeat</i> for rent, bills or paychecks — they'll be added automatically",
    "Press <i>Enter</i> to save; ✏️ in Transactions to edit"]],
  stats: ["Spending at a glance", "Total spent today, this week (Mon–Sun), this month and this year. Any income for the same period shows as “+$X in”."],
  budgets: ["Monthly budgets", "Spending limits for each category, plus an optional overall total.", [
    "Bars turn <i>yellow at 80%</i> and <i>red</i> when you go over",
    "Click <i>Edit budgets</i> to set limits — leave a box blank for no limit",
    "Budgets reset at the start of every month"]],
  recurring: ["Recurring items", "Expenses or income that repeat weekly, monthly or yearly.", [
    "Added automatically when you open the app — missed dates are filled in",
    "⏸️ pauses it (no catch-up when you resume)",
    "🗑️ stops repeating but keeps past entries",
    "Create one by choosing <i>Repeat</i> when adding"]],
  upcoming: ["Upcoming", "Recurring bills (and expected income) due soon, based on your Repeat items.", [
    "Choose the next 7, 14 or 30 days",
    "Orange <i>Soon</i> = due within 3 days",
    "The header shows what's still left to pay this month",
    "<i>🔔 Reminders</i> sends a notification on this device before a bill is due"]],
  cashflow: ["Cash flow", "This month's money in versus money out.", [
    "<i>Net</i> = income − spending",
    "<i>Savings rate</i> = net ÷ income — 20% or more is a common goal",
    "Add income with the <i>💵 Income</i> switch in the form"]],
  moneyflow: ["Money flow", "Where your money comes from and where it goes.", [
    "Income sources on the left, spending categories on the right",
    "Green <i>Saved</i> = money left over; red <i>From savings</i> = you spent more than you earned",
    "Hover a band for amounts; click a category to see its transactions",
    "Pick a different period with the menu on the right"]],
  goals: ["Savings goals", "Save toward targets like an emergency fund, a trip or a big purchase.", [
    "<i>＋ Add money</i> whenever you set some aside (tracked separately from expenses)",
    "With a target date it shows the monthly amount needed and whether you're on track",
    "<i>✏️ Edit</i> to change the target, date or name, or delete the goal"]],
  insights: ["Insights", "Automatic observations comparing this month so far with the same days last month — trend, projected month-end spending, biggest changes, top category and largest expense. Uses spending only."],
  charts: ["Spending charts", "Your spending over time, with income in green when there is any.", [
    "<i>Day / Week / Month / Year</i> switch the view; ‹ › move between periods",
    "The doughnut shows spending by category for the period shown"]],
  calendar: ["Calendar", "Each day's spending as a color — the darker the pink, the more you spent.", [
    "Green dots mark days with income",
    "Click a day to show only its transactions; click it again to clear",
    "‹ › change the month"]],
  transactions: ["Transactions", "All your expenses and income, newest first.", [
    "Search text or <i>#tag</i>, and filter by category or date range",
    "✏️ edits, 🗑️ deletes; <i>☑ Select</i> edits many at once",
    "<i>🪄 Rules</i> file transactions into categories automatically",
    "<i>Import</i> a bank or card statement (CSV/Excel)",
    "<i>Export</i> to Excel, CSV, a PDF report or a full <i>.json</i> backup"]],
  import: ["Importing a statement", "Download a CSV or Excel statement from your bank or card's website, then:", [
    "Check the column choices — they're filled in automatically",
    "For <i>credit cards</i>, set Amount signs to “Positive = expense”",
    "Unticked rows (duplicates, card payments) are skipped — tick to include",
    "Re-importing the same file never creates duplicates; <i>Undo</i> removes the whole import",
    "Choose a Spendly <i>.json</i> backup here to restore it"]],
  rules: ["Smart rules", "Teach Spendly how to file things. When a description contains your text, it picks that category — while you type a new expense and when you import a statement.", [
    "Rules are checked top to bottom; newest first",
    "<i>Apply rules to existing transactions</i> re-files past entries",
    "Tip: after changing many items' category with ☑ Select, Spendly offers to make a rule"]],
  categories: ["Your categories", "Add categories the defaults don't cover, like Pets or Kids. They appear everywhere — the form, filters, charts, budgets and exports. Removing one keeps old expenses (they show as Other)."]
};
let helpOpen = null, helpPinned = false, helpTimer;
function helpHTML(k){ const [t, d, list] = HELP[k]; return `<b>${t}</b>${d}${list ? `<ul>${list.map(x => `<li>${x}</li>`).join("")}</ul>` : ""}`; }
function showHelp(btn, pin){
  clearTimeout(helpTimer);
  if(helpOpen && helpOpen !== btn) helpOpen.setAttribute("aria-expanded", "false");
  const pop = $("helpPop"); pop.innerHTML = helpHTML(btn.dataset.helpKey); pop.hidden = false;
  helpOpen = btn; helpPinned = !!pin; btn.setAttribute("aria-expanded", "true");
  // Position below the button, kept inside the screen
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
  let top = r.bottom + 8; if(top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8);
  pop.style.left = left + "px"; pop.style.top = top + "px";
}
function hideHelp(){ if(!helpOpen) return; helpOpen.setAttribute("aria-expanded", "false"); $("helpPop").hidden = true; helpOpen = null; helpPinned = false; }
function makeHelpBtn(key){
  const b = document.createElement("button");
  b.type = "button"; b.className = "help-btn"; b.textContent = "?"; b.dataset.helpKey = key;
  b.setAttribute("aria-label", "About " + HELP[key][0]); b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-describedby", "helpPop");
  b.addEventListener("click", e => { e.stopPropagation(); e.preventDefault(); helpOpen === b && helpPinned ? hideHelp() : showHelp(b, true); });
  // Hover only on devices with a real mouse; taps use click
  b.addEventListener("mouseenter", () => { if(matchMedia("(hover:hover)").matches && !helpPinned) showHelp(b, false); });
  b.addEventListener("mouseleave", () => { if(!helpPinned) helpTimer = setTimeout(hideHelp, 150); });
  b.addEventListener("focus", () => { if(!helpOpen) showHelp(b, false); });
  b.addEventListener("blur", () => { if(!helpPinned) hideHelp(); });
  return b;
}
document.querySelectorAll("h2[data-help]").forEach(h => {
  const b = makeHelpBtn(h.dataset.help), sub = h.querySelector(".sub-h");
  sub ? h.insertBefore(b, sub) : h.appendChild(b);
});
document.querySelectorAll("[data-help-inline]").forEach(el => el.replaceWith(makeHelpBtn(el.dataset.helpInline)));
$("helpPop").addEventListener("mouseenter", () => clearTimeout(helpTimer));
$("helpPop").addEventListener("mouseleave", () => { if(!helpPinned) helpTimer = setTimeout(hideHelp, 150); });
document.addEventListener("click", e => { if(helpOpen && !e.target.closest("#helpPop")) hideHelp(); });
document.addEventListener("keydown", e => { if(e.key === "Escape") hideHelp(); });
window.addEventListener("scroll", () => { if(helpOpen && !helpPinned) hideHelp(); else if(helpOpen) showHelp(helpOpen, true); }, { passive:true });

/* ---------------- Dark mode ---------------- */
function applyTheme(t, save){
  document.documentElement.setAttribute("data-theme", t);
  $("themeBtn").textContent = t === "dark" ? "☀️" : "🌙";
  $("themeBtn").title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", t === "dark" ? "#1d0838" : "#6a11cb");
  if(save){ try{ localStorage.setItem("spendly-theme", t); }catch(e){} }
  // Rebuild charts so axis, grid and border colors match the theme
  if(barChart){ barChart.destroy(); barChart = null; }
  if(pieChart){ pieChart.destroy(); pieChart = null; }
  renderCharts();
}
applyTheme(document.documentElement.getAttribute("data-theme") || "light", false);
$("themeBtn").addEventListener("click", () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark", true));
// Follow the system setting until the user picks a theme themselves
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
  let saved = null; try{ saved = localStorage.getItem("spendly-theme"); }catch(err){}
  if(!saved) applyTheme(e.matches ? "dark" : "light", false);
});

/* ---------------- Installable app (PWA) ---------------- */
if("serviceWorker" in navigator && location.protocol === "https:"){
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW registration failed", err)));
}
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let installPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; if(!isStandalone()) $("installBtn").hidden = false; });
window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; installPrompt = null; toast("📱 Spendly installed"); });
if(isIOS && !isStandalone()) $("installBtn").hidden = false;   // iOS has no install prompt, so show instructions instead
$("installBtn").addEventListener("click", async () => {
  if(installPrompt){
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if(outcome === "accepted") $("installBtn").hidden = true;
    installPrompt = null;
  } else if(isIOS){
    const t = $("toast"); t.textContent = "In Safari, tap Share ⬆️ then “Add to Home Screen”"; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 6000);
  }
});
