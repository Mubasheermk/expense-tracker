/* Spendly · Add / edit / delete transactions.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Add / Edit / Delete ---------------- */
$("expForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = {
    title: $("fTitle").value.trim(),
    amount: Math.round(parseFloat($("fAmount").value)*100)/100,
    date: $("fDate").value,
    category: selectedCat,
    payment: $("fPay").value
  };
  if(formType === "income") data.type = "income";
  const note = $("fNote").value.trim().slice(0, 200), tags = parseTags(note);
  if(note) data.note = note;
  if(tags.length) data.tags = tags;
  if(!data.title || !(data.amount>0) || !data.date) return toast("Please fill all fields");
  const repeat = $("fRepeat").value;
  // Writes apply locally right away (and sync later when offline), so don't block the UI on the server
  const fail = err => { console.error(err); toast("Error: " + err.message); };
  try{
    if(editingId){
      const del = firebase.firestore.FieldValue.delete();
      expensesRef.doc(editingId).update({ note: del, tags: del, type: del, ...data, updatedAt: TS() }).catch(fail);
      toast(formType === "income" ? "✏️ Income updated" : "✏️ Expense updated");
    }else if(repeat){
      // Create the rule; processRecurring() adds this and future occurrences when they're due
      const rule = { ...data, frequency:repeat, anchorDay:parseKey(data.date).getDate(),
        startDate:data.date, nextDate:data.date, active:true, createdAt:TS() };
      delete rule.date;
      recurringRef.add(rule).catch(fail);
      toast(data.date <= toKey(new Date())
        ? `🔁 ${FREQ_LABEL[repeat]} ${formType} set up`
        : `🔁 ${FREQ_LABEL[repeat]} ${formType} starts ${parseKey(data.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`);
    }else{
      expensesRef.add({ ...data, createdAt: TS() }).catch(fail);
      toast(formType === "income" ? "💵 Income added" : "✅ Expense added");
    }
    if(formType === "expense") budgetAlert(data.category);
    resetForm();
  }catch(err){ fail(err); }
});

function resetForm(){
  editingId = null;
  $("expForm").reset(); $("fDate").value = toKey(new Date());
  $("formTitle").textContent = formType === "income" ? "➕ Add Income" : "➕ Add Expense";
  $("submitBtn").textContent = formType === "income" ? "Add Income" : "Add Expense";
  $("cancelEdit").hidden = true; $("repeatRow").hidden = false; catTouched = false; $("ruleHint").textContent = "";
}
$("cancelEdit").addEventListener("click", resetForm);

$("list").addEventListener("click", async e => {
  const btn = e.target.closest("button"); if(!btn) return;
  const id = btn.dataset.id; const exp = allRecords.find(x=>x.id===id); if(!exp) return;
  if(btn.dataset.act==="edit"){
    editingId = id; setFormType(isIncome(exp) ? "income" : "expense", true);
    $("fTitle").value = exp.title; $("fAmount").value = exp.amount; $("fDate").value = exp.date; $("fNote").value = exp.note || "";
    $("fPay").value = exp.payment || "Card"; selectedCat = exp.category in catMap ? exp.category : (isIncome(exp) ? "Other income" : "Other"); renderChips();
    $("formTitle").textContent = isIncome(exp) ? "✏️ Edit Income" : "✏️ Edit Expense"; $("submitBtn").textContent = "Save Changes";
    $("cancelEdit").hidden = false; $("repeatRow").hidden = true; window.scrollTo({top:0,behavior:"smooth"});
  }else if(btn.dataset.act==="del"){
    if(!confirm(`Delete "${exp.title}"?`)) return;
    expensesRef.doc(id).delete().catch(err => toast("Error: "+err.message));
    toast("🗑️ Expense deleted"); if(editingId===id) resetForm();
  }
});
