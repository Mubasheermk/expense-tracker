/* Spendly · CSV / Excel statement import.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Import (CSV / Excel) ---------------- */
// Keyword rules for auto-categorizing statement descriptions (first match wins)
const AUTO_CATS = [
  [/uber ?eats|doordash|grubhub|postmates|instacart/i, "Food"],
  [/uber|lyft|shell|exxon|chevron|bp |sunoco|wawa|sheetz|\bgas\b|fuel|parking|\btolls?\b|metro|transit|amtrak|e-?zpass/i, "Transport"],
  [/\bcvs\b|walgreens|rite aid|pharmacy|clinic|hospital|dental|doctor|medical|health|gym|fitness/i, "Health"],
  [/netflix|spotify|hulu|disney|hbo|max\b|youtube|apple\.com\/bill|cinema|theat|amc |steam|playstation|xbox|ticketmaster/i, "Entertainment"],
  [/starbucks|coffee|cafe|restaurant|grill|pizza|burger|mcdonald|chipotle|taco|sushi|doordash|grubhub|ubereats|uber eats|kitchen|bakery|whole foods|trader joe|safeway|kroger|giant|harris teeter|aldi|lidl|wegmans|costco|grocery|market/i, "Food"],
  [/amazon|amzn|\btarget\b|walmart|best buy|ebay|etsy|ikea|home depot|lowe'?s|\bmacy'?s\b|nordstrom|old navy|tj ?maxx|marshalls|\bshop/i, "Shopping"],
  [/comcast|xfinity|verizon|at&t|t-mobile|dominion|electric|energy|water|sewer|utility|insurance|geico|state farm|\brent\b|mortgage|internet|phone/i, "Bills"],
  [/airline|airlines|delta|united|american air|southwest|jetblue|hotel|marriott|hilton|hyatt|airbnb|expedia|booking\.com|travel/i, "Travel"],
  [/udemy|coursera|tuition|school|university|college|books|kindle|edx|skillshare/i, "Education"]
];
const AUTO_INCOME = [[/payroll|salary|direct dep|paycheck|adp|gusto/i, "Salary"], [/refund|return|reversal|cashback|cash back/i, "Refunds"], [/dividend|interest|brokerage|vanguard|fidelity|schwab/i, "Investments"]];
const XFER = /payment.*thank|thank you.*payment|autopay|auto pay|credit card payment|card payment|transfer (to|from)|online transfer|zelle to|venmo cashout|epay/i;

let impData = [], impRows = [], impFileName = "", lastImportIds = [];
const normTitle = t => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
// Small fast string hash (cyrb53) for stable import document IDs
function hash53(str){ let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for(let i = 0; i < str.length; i++){ const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); }

function parseAmount(v){
  if(typeof v === "number") return v;
  let t = String(v ?? "").trim(); if(!t) return NaN;
  let neg = /^\(.*\)$/.test(t) || /-$/.test(t) || /\bDR\b/i.test(t);
  t = t.replace(/[()$€£₹,\s]|CR|DR|USD/gi, "").replace(/-$/, "");
  if(t.startsWith("-")){ neg = !neg; t = t.slice(1); }
  const n = parseFloat(t); return isNaN(n) ? NaN : (neg ? -n : n);
}
function parseDateCell(v, fmtPref){
  const ok = d => d && !isNaN(d) && d.getFullYear() >= 1990 && d.getFullYear() <= 2100 ? toKey(d) : null;
  if(v instanceof Date) return ok(new Date(v.getFullYear(), v.getMonth(), v.getDate()));
  if(typeof v === "number" && v > 20000 && v < 80000){   // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return ok(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  const t = String(v ?? "").trim(); if(!t) return null;
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(m) return ok(new Date(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if(m){ let a = +m[1], b = +m[2], y = +m[3]; if(y < 100) y += 2000;
    const [mo, da] = fmtPref === "dmy" ? [b, a] : [a, b];
    if(mo < 1 || mo > 12 || da < 1 || da > 31) return null; return ok(new Date(y, mo - 1, da)); }
  const d = new Date(t); return isNaN(d) ? null : ok(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
}
// Lowercase, punctuation → spaces, so "Netflix.com" and "netflix com" compare equal
const normText = t => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}&]+/gu, " ").replace(/\s+/g, " ").trim();
function matchRule(title, type){
  const t = " " + normText(title) + " ";
  return userRules.find(r => (r.type || "expense") === type && r.match && t.includes(" " + normText(r.match)) && catMap[r.category]);
}
function guessCategory(title, type, given){
  const list = type === "income" ? INCOME_CATEGORIES : CATEGORIES;
  const ur = matchRule(title, type); if(ur) return ur.category;          // your own rules win
  if(given){ const g = list.find(c => c.name.toLowerCase() === String(given).trim().toLowerCase()); if(g) return g.name; }
  const rules = type === "income" ? AUTO_INCOME : AUTO_CATS;
  for(const [re, cat] of rules) if(re.test(title)) return cat;
  return type === "income" ? "Other income" : "Other";
}

function openImport(){ showImpStep(1); $("impFile").value = ""; $("importModal").hidden = false; }
function showImpStep(n){ [1,2,3,"R"].forEach(i => $("impStep" + i).hidden = i !== n); }
const closeImport = () => { $("importModal").hidden = true; };
$("importBtn").addEventListener("click", openImport);
$("impClose").addEventListener("click", closeImport);
$("impDone").addEventListener("click", closeImport);
$("impBack").addEventListener("click", () => { $("impFile").value = ""; showImpStep(1); });
$("importModal").addEventListener("click", e => { if(e.target.id === "importModal") closeImport(); });
$("impFile").addEventListener("change", e => e.target.files[0] && readImportFile(e.target.files[0]));
["dragover","dragenter"].forEach(ev => $("impDrop").addEventListener(ev, e => { e.preventDefault(); $("impDrop").classList.add("over"); }));
["dragleave","drop"].forEach(ev => $("impDrop").addEventListener(ev, e => { e.preventDefault(); $("impDrop").classList.remove("over"); }));
$("impDrop").addEventListener("drop", e => e.dataTransfer.files[0] && readImportFile(e.dataTransfer.files[0]));

async function readImportFile(file){
  if(/\.json$/i.test(file.name)) return readBackupFile(file);
  if(file.size > 5 * 1024 * 1024) return toast("That file is over 5 MB — export a shorter date range");
  try{
    await loadScript(LIBS.xlsx);
    const wb = XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:true, raw:/\.(csv|txt)$/i.test(file.name) });
    const ws = wb.Sheets[wb.SheetNames[0]];
    impData = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:"" }).filter(r => r.some(c => String(c).trim() !== ""));
    if(impData.length < 1) return toast("That file looks empty");
    impFileName = file.name; setupMapping(); showImpStep(2);
  }catch(err){ console.error(err); toast("Couldn't read that file: " + err.message); }
}

function setupMapping(){
  const first = impData[0].map(c => String(c).trim());
  const looksLikeHeader = first.some(c => /date|desc|amount|payee|debit|credit|memo|category/i.test(c)) || first.every(c => isNaN(parseAmount(c)) && !parseDateCell(c));
  $("impHeader").checked = looksLikeHeader;
  fillMappingOptions(true);
}
function fillMappingOptions(autodetect){
  const cols = impData[0].length;
  const names = Array.from({ length:cols }, (_, i) => $("impHeader").checked && String(impData[0][i]).trim() ? String(impData[0][i]).trim() : `Column ${String.fromCharCode(65 + (i % 26))}`);
  const opts = (none) => (none ? `<option value="">— None —</option>` : "") + names.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join("");
  ["impDate","impDesc","impAmt","impDebit","impCredit"].forEach(id => $(id).innerHTML = opts(id === "impDebit" || id === "impCredit"));
  ["impCat","impNote"].forEach(id => $(id).innerHTML = opts(true));
  if(autodetect){
    const find = (re, not) => names.findIndex(n => re.test(n) && !(not && not.test(n)));
    const set = (id, i) => { if(i >= 0) $(id).value = String(i); };
    set("impDate", find(/date|posted/i));
    set("impDesc", find(/desc|payee|merchant|name|details|memo|narrative/i, /category/i));
    const amt = find(/amount|amt|value/i), deb = find(/debit|withdraw/i), cred = find(/credit|deposit/i, /card/i);
    if(amt < 0 && deb >= 0 && cred >= 0){ $("impAmtMode").value = "split"; set("impDebit", deb); set("impCredit", cred); }
    else { $("impAmtMode").value = "single"; set("impAmt", amt >= 0 ? amt : Math.min(2, cols - 1)); }
    set("impCat", find(/category|type/i, /trans.*type/i));
    if(find(/date|posted/i) < 0) set("impDate", 0);
    if(find(/desc|payee|merchant|name|details|memo|narrative/i, /category/i) < 0) set("impDesc", Math.min(1, cols - 1));
    // Guess the date format from the data: any first number > 12 means day/month/year
    const di = +$("impDate").value; const dmy = impData.slice(1, 60).some(r => { const m = String(r[di]).match(/^(\d{1,2})[-/.]\d{1,2}[-/.]/); return m && +m[1] > 12; });
    $("impDateFmt").value = dmy ? "dmy" : "mdy";
  }
  toggleAmtMode(); buildImportRows();
}
function toggleAmtMode(){
  const split = $("impAmtMode").value === "split";
  document.querySelectorAll(".imp-single").forEach(el => el.hidden = split);
  document.querySelectorAll(".imp-split").forEach(el => el.hidden = !split);
}
$("impHeader").addEventListener("change", () => fillMappingOptions(true));
$("impAmtMode").addEventListener("change", () => { toggleAmtMode(); buildImportRows(); });
["impDate","impDateFmt","impDesc","impAmt","impSign","impDebit","impCredit","impCat","impNote"].forEach(id => $(id).addEventListener("change", buildImportRows));

function buildImportRows(){
  const body = $("impHeader").checked ? impData.slice(1) : impData.slice();
  const col = id => $(id).value === "" ? -1 : +$(id).value;
  const [cD, cT, cA, cDe, cCr, cC, cN] = ["impDate","impDesc","impAmt","impDebit","impCredit","impCat","impNote"].map(col);
  const split = $("impAmtMode").value === "split", sign = $("impSign").value, dfmt = $("impDateFmt").value;
  const existing = new Set(allRecords.map(e => `${e.date}|${Math.round(e.amount * 100)}|${normTitle(e.title)}`));
  const seen = {};
  impRows = body.slice(0, 1000).map(r => {
    const date = parseDateCell(r[cD], dfmt);
    const title = String(r[cT] ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Imported transaction";
    let amount, type;
    if(split){
      const out = cDe >= 0 ? Math.abs(parseAmount(r[cDe])) : NaN, inn = cCr >= 0 ? Math.abs(parseAmount(r[cCr])) : NaN;
      if(out > 0){ amount = out; type = "expense"; } else if(inn > 0){ amount = inn; type = "income"; } else amount = NaN;
    } else {
      const a = parseAmount(r[cA]);
      if(sign === "neg-expense"){ type = a < 0 ? "expense" : "income"; }
      else if(sign === "pos-expense"){ type = a > 0 ? "expense" : "income"; }
      else type = sign === "all-income" ? "income" : "expense";
      amount = Math.abs(a);
    }
    amount = Math.round(amount * 100) / 100;
    const row = { date, title, amount, type, note: cN >= 0 ? String(r[cN] ?? "").trim().slice(0, 150) : "" };
    if(!date || !(amount > 0) || amount >= 1000000){ row.status = "bad"; row.include = false; return row; }
    row.category = guessCategory(title, type, cC >= 0 ? r[cC] : "");
    const key = `${date}|${Math.round(amount * 100)}|${normTitle(title)}`;
    seen[key] = (seen[key] || 0) + 1;
    row.id = "imp_" + hash53(`${key}|${type}|${seen[key]}`);
    if(existing.has(key) && seen[key] === 1){ row.status = "dup"; row.include = false; }
    else if(XFER.test(title)){ row.status = "xfer"; row.include = false; }
    else { row.status = "new"; row.include = true; }
    return row;
  });
  renderImportTable();
}

function renderImportTable(){
  const n = s => impRows.filter(r => r.status === s).length;
  const sel = impRows.filter(r => r.include), out = sum(sel.filter(r => r.type === "expense")), inn = sum(sel.filter(r => r.type === "income"));
  const total = impData.length - ($("impHeader").checked ? 1 : 0);
  $("impFileName").textContent = `📄 ${impFileName} · ${total} row${total === 1 ? "" : "s"}${total > 1000 ? " (first 1,000 shown)" : ""}`;
  $("impSummary").innerHTML = `<b>${sel.length}</b> selected · ${fmt(out)} spent${inn ? ` · <span class="down-t">${fmt(inn)} income</span>` : ""}`
    + (n("dup") ? ` · <span class="badge b-dup">${n("dup")} already in Spendly</span>` : "")
    + (n("xfer") ? ` · <span class="badge b-xfer">${n("xfer")} card payments/transfers</span>` : "")
    + (n("bad") ? ` · <span class="badge b-bad">${n("bad")} unreadable</span>` : "");
  const catSel = (r, i) => `<select data-ic="${i}">${(r.type === "income" ? INCOME_CATEGORIES : CATEGORIES).map(c => `<option ${c.name === r.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;
  const badge = { dup:`<span class="badge b-dup">Duplicate</span>`, xfer:`<span class="badge b-xfer">Transfer?</span>`, bad:`<span class="badge b-bad">Can't read</span>`, new:`<span class="badge b-new">New</span>` };
  $("impTable").innerHTML = `<thead><tr><th><input type="checkbox" id="impAll" ${impRows.every(r => r.include || r.status === "bad") ? "checked" : ""} title="Select all"></th><th>Date</th><th>Description</th><th>Category</th><th style="text-align:right">Amount</th><th></th></tr></thead><tbody>`
    + impRows.map((r, i) => `<tr class="${r.include ? "" : "off"}">
      <td><input type="checkbox" data-ii="${i}" ${r.include ? "checked" : ""} ${r.status === "bad" ? "disabled" : ""}></td>
      <td>${r.date ? parseKey(r.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"}</td>
      <td>${esc(r.title)}</td>
      <td>${r.status === "bad" ? "" : catSel(r, i)}</td>
      <td class="num ${r.type === "income" ? "down-t" : ""}">${r.amount > 0 ? (r.type === "income" ? "+" : "") + fmt(r.amount) : "—"}</td>
      <td>${badge[r.status]}</td></tr>`).join("") + "</tbody>";
  $("impGo").textContent = sel.length ? `Import ${sel.length} transaction${sel.length === 1 ? "" : "s"}` : "Nothing selected";
  $("impGo").disabled = !sel.length;
}
$("impTable").addEventListener("change", e => {
  if(e.target.id === "impAll"){ impRows.forEach(r => { if(r.status !== "bad") r.include = e.target.checked; }); return renderImportTable(); }
  if(e.target.dataset.ii !== undefined){ impRows[+e.target.dataset.ii].include = e.target.checked; return renderImportTable(); }
  if(e.target.dataset.ic !== undefined){ impRows[+e.target.dataset.ic].category = e.target.value; }
});

$("impGo").addEventListener("click", () => {
  const sel = impRows.filter(r => r.include && r.status !== "bad");
  if(!sel.length || !expensesRef) return;
  lastImportIds = sel.map(r => r.id);
  for(let i = 0; i < sel.length; i += 400){            // Firestore batches hold up to 500 writes
    const batch = db.batch();
    sel.slice(i, i + 400).forEach(r => {
      const tags = ["imported"];
      batch.set(expensesRef.doc(r.id), {
        title:r.title, amount:r.amount, date:r.date, category:r.category, payment:"Bank import",
        ...(r.type === "income" ? { type:"income" } : {}), ...(r.note ? { note:r.note } : {}), tags, createdAt:TS()
      });
    });
    batch.commit().catch(err => { console.error(err); toast("Import error: " + err.message); });
  }
  const inn = sel.filter(r => r.type === "income").length;
  $("impDoneMsg").textContent = `Imported ${sel.length} transaction${sel.length === 1 ? "" : "s"}` + (inn ? ` (${sel.length - inn} expenses, ${inn} income)` : "");
  $("impUndo").disabled = false; $("impUndo").hidden = false; $("impDoneNote").innerHTML = "Imported rows are tagged <b>#imported</b> so you can find them in Transactions."; showImpStep(3);
});
$("impUndo").addEventListener("click", () => {
  if(!lastImportIds.length || !confirm(`Remove the ${lastImportIds.length} transactions from this import?`)) return;
  for(let i = 0; i < lastImportIds.length; i += 400){
    const batch = db.batch(); lastImportIds.slice(i, i + 400).forEach(id => batch.delete(expensesRef.doc(id)));
    batch.commit().catch(err => toast("Error: " + err.message));
  }
  toast(`↩️ Removed ${lastImportIds.length} imported transactions`); lastImportIds = []; $("impUndo").disabled = true; closeImport();
});
