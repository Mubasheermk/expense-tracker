/* Spendly · Basic UI wiring, Google sign-in and live Firestore sync.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- UI setup ---------------- */
const $ = id => document.getElementById(id);
function renderChips(){
  const list = formType === "income" ? INCOME_CATEGORIES : CATEGORIES;
  $("catChips").innerHTML = list.map(c =>
    `<span class="chip ${c.name===selectedCat?"active":""}" data-c="${esc(c.name)}"
      style="${c.name===selectedCat?`background:${c.color};border-color:${c.color}`:`border-color:${c.color}33`}">${esc(c.icon)} ${esc(c.name)}</span>`
  ).join("") + (formType === "income" ? "" : `<button type="button" class="chip chip-add" id="manageCatsBtn" title="Add or remove your own categories">＋ Manage</button>`);
}
// Switch the form between Expense and Income
function setFormType(t, keepCategory){
  formType = t;
  document.querySelectorAll("#typeSeg button").forEach(b => b.classList.toggle("active", b.dataset.type === t));
  $("expForm").classList.toggle("is-income", t === "income");
  const pay = $("fPay").value;
  $("fPay").innerHTML = PAY_OPTIONS[t].map(o => `<option>${o}</option>`).join("");
  if(PAY_OPTIONS[t].includes(pay)) $("fPay").value = pay;
  $("fTitle").placeholder = t === "income" ? "e.g. Paycheck" : "e.g. Lunch with team";
  if(!keepCategory){ selectedCat = t === "income" ? "Salary" : "Food"; catTouched = false; if($("ruleHint")) $("ruleHint").textContent = ""; }
  if(!editingId){ $("formTitle").textContent = t === "income" ? "➕ Add Income" : "➕ Add Expense"; $("submitBtn").textContent = t === "income" ? "Add Income" : "Add Expense"; }
  renderChips();
}
$("typeSeg").addEventListener("click", e => { const b = e.target.closest("button[data-type]"); if(b && b.dataset.type !== formType) setFormType(b.dataset.type); });
let catTouched = false;   // true once the user picks a chip themselves; rules then leave the choice alone
$("catChips").addEventListener("click", e => {
  if(e.target.closest("#manageCatsBtn")) return openCats();
  const chip = e.target.closest(".chip[data-c]"); if(!chip) return;
  selectedCat = chip.dataset.c; catTouched = true; renderChips();
});
function renderCatFilter(){
  const cur = $("catFilter").value;
  const opt = c => `<option value="${esc(c.name)}">${esc(c.icon)} ${esc(c.name)}</option>`;
  $("catFilter").innerHTML = `<option value="">All categories</option><option value="__expense">💸 All expenses</option><option value="__income">💵 All income</option>`
    + `<optgroup label="Expenses">${CATEGORIES.map(opt).join("")}</optgroup><optgroup label="Income">${INCOME_CATEGORIES.map(opt).join("")}</optgroup>`;
  $("catFilter").value = (cur.startsWith("__") || catMap[cur]) ? cur : "";
}
// Rebuild the category list: defaults, then the user's own, with "Other" kept last
function setCategories(custom){
  customCats = (custom || []).filter(c => c && c.name && !DEFAULT_CATEGORIES.some(d => d.name.toLowerCase() === c.name.toLowerCase()));
  const other = DEFAULT_CATEGORIES.find(c => c.name === "Other");
  CATEGORIES = [...DEFAULT_CATEGORIES.filter(c => c !== other), ...customCats, other];
  catMap = Object.fromEntries([...CATEGORIES, ...INCOME_CATEGORIES].map(c => [c.name, c]));
  if(formType === "expense" && !CATEGORIES.some(c => c.name === selectedCat)) selectedCat = "Food";
  renderChips(); renderCatFilter();
}
renderCatFilter();
$("fDate").value = toKey(new Date());
renderChips();

function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2200); }

/* ---------------- Auth (Google) ---------------- */
$("googleBtn").addEventListener("click", async () => {
  $("loginErr").textContent = "";
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try { await auth.signInWithPopup(provider); }
  catch(err){
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(err.code)) return auth.signInWithRedirect(provider);
    if(err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request")
      $("loginErr").textContent = err.code === "auth/unauthorized-domain"
        ? "This website isn't in Firebase's Authorized domains list yet."
        : "Sign-in failed: " + err.message;
  }
});
$("signOutBtn").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(user => {
  unsubs.forEach(u => u()); unsubs = [];
  allRecords = []; expenses = []; incomes = []; budgets = {}; recurring = []; setFormType("expense"); resetForm();
  if(!user){
    expensesRef = budgetRef = recurringRef = catsRef = goalsRef = rulesRef = null; goals = []; userRules = []; setCategories([]); exitSelect();
    document.body.classList.add("signed-out");
    return;
  }
  document.body.classList.remove("signed-out");
  $("userName").textContent = user.displayName ? user.displayName.split(" ")[0] : (user.email || "");
  $("userPhoto").src = user.photoURL || "";
  $("userPhoto").style.display = user.photoURL ? "" : "none";
  $("dbDot").className = "dot"; $("dbStatus").textContent = "Connecting to Firebase…";
  $("list").innerHTML = `<div class="empty">Loading…</div>`;
  const userRef = db.collection("users").doc(user.uid);
  expensesRef  = userRef.collection("expenses");
  budgetRef    = userRef.collection("settings").doc("budgets");
  catsRef      = userRef.collection("settings").doc("categories");
  goalsRef     = userRef.collection("goals");
  rulesRef     = userRef.collection("settings").doc("rules");
  recurringRef = userRef.collection("recurring");
  startSync();
});

/* ---------------- Firestore: live sync ---------------- */
function setStatus(){
  if(!expensesRef) return;
  if(!navigator.onLine){ $("dbDot").className = "dot off"; $("dbStatus").textContent = `Offline · changes will sync`; return; }
  $("dbDot").className = "dot ok"; $("dbStatus").textContent = `Synced · ${allRecords.length} records`;
}
window.addEventListener("online", setStatus);
window.addEventListener("offline", setStatus);

function onSyncError(err){
  console.error(err);
  $("dbDot").className = "dot err"; $("dbStatus").textContent = "Firebase error — check Firestore rules";
  $("list").innerHTML = `<div class="empty">⚠️ Could not load data: ${err.message}</div>`;
}
function startSync(){
  unsubs.push(expensesRef.orderBy("date","desc").onSnapshot(snap => {
    allRecords = snap.docs.map(d => {
      const x = d.data();
      return { id:d.id, ...x, amount:Number(x.amount)||0, _date:parseKey(x.date) };
    });
    expenses = allRecords.filter(e => !isIncome(e));
    incomes  = allRecords.filter(isIncome);
    setStatus(); renderAll();
  }, onSyncError));

  unsubs.push(budgetRef.onSnapshot(snap => {
    budgets = (snap.exists && snap.data().limits) || {};
    renderBudgets();
  }, err => { console.error(err); $("budgetList").innerHTML = `<div class="empty">⚠️ ${esc(err.message)}</div>`; }));

  unsubs.push(rulesRef.onSnapshot(snap => {
    userRules = (snap.exists && snap.data().rules) || [];
    if(!$("rulesModal").hidden) renderRules();
  }, err => console.error(err)));

  unsubs.push(goalsRef.onSnapshot(snap => {
    goals = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderGoals(); if(expensesRef) renderTips();
  }, err => { console.error(err); $("goals").innerHTML = `<div class="empty">⚠️ ${esc(err.message)}</div>`; }));

  unsubs.push(catsRef.onSnapshot(snap => {
    setCategories((snap.exists && snap.data().custom) || []);
    renderAll(); renderRecurring();
    if(!$("catModal").hidden) renderCatManager();
  }, err => console.error(err)));

  unsubs.push(recurringRef.onSnapshot(snap => {
    recurring = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderRecurring(); renderUpcoming(); checkReminders(); if(expensesRef) renderTips();
    processRecurring();
  }, err => { console.error(err); $("recurringList").innerHTML = `<div class="empty">⚠️ ${esc(err.message)}</div>`; }));
}
