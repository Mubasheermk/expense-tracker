/* Spendly · Tip of the day banner.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Tip of the day ---------------- */
// General tips, one per day in rotation (general guidance, not financial advice)
const GENERAL_TIPS = [
  ["🧾", "Wait 24 hours before any non-essential purchase over $50. Many impulse buys stop feeling necessary by the next day."],
  ["🛒", "Shop groceries with a list and after a meal. Shopping hungry tends to add unplanned items to the cart."],
  ["📦", "Check your subscriptions every few months. Cancel the ones you haven't used in the last 30 days."],
  ["💳", "Turn on autopay for at least the minimum on every card. One late fee can cost more than a month of savings."],
  ["🏦", "Pay yourself first: move a set amount to savings on payday, before you start spending."],
  ["☕", "Small daily habits add up: $5 a day is about $150 a month, or $1,800 a year."],
  ["🍱", "Plan meals for the week and cook in batches. It's one of the easiest ways to cut food spending."],
  ["📱", "Call your phone, internet and insurance providers once a year and ask for a better rate or a loyalty discount."],
  ["🎯", "Give every dollar a job: set a monthly budget for each category, so you decide where money goes before it's spent."],
  ["🛟", "Aim for an emergency fund of 3–6 months of essential expenses. Start with a first milestone of $1,000."],
  ["🔁", "Round up: when you save, round to the next $10 or $50. The small extra adds up without feeling like much."],
  ["🗓️", "Try a no-spend weekend once a month: free activities, cook at home, and see how much you keep."],
  ["🏷️", "Compare the unit price, not the sticker price. Bigger isn't always cheaper per ounce."],
  ["💡", "Unplug devices you don't use and switch to LED bulbs. Small changes lower the electric bill every month."],
  ["🚗", "Combine errands into one trip, and keep tires properly inflated. Both save on fuel."],
  ["🎁", "Set a gift budget per person before the holidays and track it. It keeps December from wrecking January."],
  ["📉", "Pay down the highest-interest debt first while making minimum payments on the rest. That saves the most in interest."],
  ["🛍️", "Unsubscribe from store marketing emails. Fewer \"sale\" reminders means fewer purchases you didn't plan."],
  ["🔄", "Before buying something new, check if you can borrow, rent or buy it used."],
  ["💧", "Carry a reusable water bottle and pack snacks. Convenience-store stops add up fast."],
  ["📊", "Review last month's spending once, at the start of each month. Ten minutes is enough to spot leaks."],
  ["🎟️", "Look for free local events, library passes and museum days before paying for entertainment."],
  ["🍽️", "When eating out, skip drinks and dessert, or split them. It can cut the bill by a third."],
  ["⏰", "Use cash-back or rewards only on purchases you'd make anyway, and pay the card off in full."],
  ["🧺", "Wash clothes in cold water and air-dry when you can. It saves energy and makes clothes last longer."],
  ["📆", "Plan around annual bills like insurance or memberships: divide them by 12 and set that aside monthly."],
  ["🤝", "Ask about discounts — student, military, senior, employer or AAA — before you pay."],
  ["🏠", "Raise your insurance deductible only if your emergency fund can cover it. It often lowers the premium."],
  ["🧠", "Track every expense for one month. Just noticing where money goes often lowers spending by itself."],
  ["🌱", "Increase savings whenever income goes up. Saving half of every raise keeps lifestyle creep in check."]
];
const TIP_HIDE_KEY = "spendly-tip-hidden";
let tipList = [], tipIdx = 0, tipBrowsed = false;
const dayNumber = () => Math.floor(Date.now() / 86400000);
const m2 = v => fmt(v).replace(".00", "");

// Tips computed from your own data; each returns [icon, html] or null
function personalTips(){
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), day = now.getDate(), dim = daysIn(y, m);
  const thisR = periodRange("month", now), lastR = [new Date(y, m - 1, 1), new Date(y, m, 1)];
  const cur = expenses.filter(e => inRange(e, thisR)), last = expenses.filter(e => inRange(e, lastR));
  const curT = sum(cur), out = [];
  const match = (list, re) => list.filter(e => re.test(e.title || ""));
  const ninety = expenses.filter(e => e._date >= addDays(startOfDay(now), -90));

  // Coffee runs
  const coffee = match(cur, /coffee|starbucks|dunkin|cafe|café|espresso|latte|peet/i);
  if(coffee.length >= 4){ const avg = sum(coffee) / coffee.length, monthly = sum(coffee) / day * 30;
    out.push(["☕", `You've had <b>${coffee.length} coffee runs</b> this month (${m2(sum(coffee))}). Making coffee at home 3 days a week could save about <b>${m2(avg * 3 * 4.3)}/month</b>.`]); }
  // Delivery / takeout
  const deliv = match(cur, /doordash|uber ?eats|grubhub|postmates|seamless|caviar|instacart|delivery|takeout/i);
  if(deliv.length >= 3){ const avg = sum(deliv) / deliv.length;
    out.push(["🛵", `<b>${deliv.length} delivery orders</b> this month cost ${m2(sum(deliv))}. Swapping two of them for home-cooked meals saves about <b>${m2(avg * 2)}</b> — and delivery fees and tips go with them.`]); }
  // Category up vs last month (same days)
  const lastSame = last.filter(e => e._date.getDate() <= day);
  const byCat = l => l.reduce((o, e) => (o[e.category] = (o[e.category] || 0) + e.amount, o), {});
  const cc = byCat(cur), lc = byCat(lastSame);
  const jump = Object.keys(cc).map(c => ({ c, d:cc[c] - (lc[c] || 0), p:lc[c] ? (cc[c] - lc[c]) / lc[c] : null })).filter(x => x.d >= 50 && x.p !== null && x.p >= 0.3).sort((a, b) => b.d - a.d)[0];
  if(jump){ const ic = (catMap[jump.c] || catMap.Other).icon;
    const lim = budgets[jump.c];
    out.push([ic, `<b>${esc(jump.c)}</b> is up <b>${Math.round(jump.p * 100)}%</b> compared with this point last month (+${m2(jump.d)}). ` +
      (lim > 0 ? `You've used ${Math.round(cc[jump.c] / lim * 100)}% of your ${m2(lim)} ${esc(jump.c)} budget so far.` : `Setting a ${esc(jump.c)} budget in 🎯 Budgets can help keep it in check.`)]); }
  // Budget pace
  Object.keys(budgets).filter(k => k !== "_total" && budgets[k] > 0).forEach(k => {
    const spent = cc[k] || 0, lim = budgets[k], left = lim - spent, daysLeft = dim - day + 1;
    if(spent / lim >= 0.75 && left > 0 && daysLeft > 3)
      out.push(["🎯", `<b>${esc(k)}</b> is at ${Math.round(spent / lim * 100)}% of its budget with ${daysLeft} days left. Keeping it to about <b>${m2(left / daysLeft)}/day</b> keeps you on track.`]);
  });
  if(budgets._total > 0 && day >= 5 && day < dim){ const proj = curT / day * dim;
    if(proj > budgets._total * 1.05) out.push(["🔮", `At this pace you'll spend about <b>${m2(proj)}</b> this month, ${m2(proj - budgets._total)} over your total budget. Cutting <b>${m2((proj - budgets._total) / (dim - day))}/day</b> from now on closes the gap.`]); }
  // Subscriptions
  const subs = recurring.filter(r => r.active !== false && r.type !== "income" && (r.category === "Entertainment" || /netflix|spotify|hulu|disney|hbo|max|youtube|apple|prime|audible|xbox|playstation|subscription|membership|gym/i.test(r.title || "")));
  if(subs.length >= 2){ const per = r => r.frequency === "weekly" ? r.amount * 52 / 12 : r.frequency === "yearly" ? r.amount / 12 : r.amount;
    const tot = subs.reduce((a, r) => a + per(r), 0), small = subs.slice().sort((a, b) => per(a) - per(b))[0];
    out.push(["📺", `You pay about <b>${m2(tot)}/month</b> for ${subs.length} subscriptions. Pausing one you rarely use — like ${esc(small.title)} — saves ${m2(per(small) * 12)} a year.`]); }
  // Fees
  const fees = match(ninety, /\bfee\b|fees|overdraft|late charge|interest charge|finance charge|atm/i);
  if(fees.length && sum(fees) >= 5) out.push(["⚠️", `You've paid <b>${m2(sum(fees))} in fees</b> over the last 90 days (${fees.length} charge${fees.length === 1 ? "" : "s"}). Autopay and low-balance alerts usually prevent most of them.`]);
  // Weekend vs weekday
  if(ninety.length >= 15){ let we = 0, wd = 0, wen = 0, wdn = 0; const seen = new Set();
    for(let d = addDays(startOfDay(now), -89); d <= now; d = addDays(d, 1)){ const k = toKey(d), w = d.getDay() === 0 || d.getDay() === 6; w ? wen++ : wdn++; seen.add(k); }
    ninety.forEach(e => { const w = e._date.getDay() === 0 || e._date.getDay() === 6; if(e.recurringId) return; w ? we += e.amount : wd += e.amount; });
    const ratio = wen && wdn && wd ? (we / wen) / (wd / wdn) : 0;
    if(ratio >= 1.6) out.push(["🎉", `You spend about <b>${ratio.toFixed(1)}× more per day on weekends</b> than on weekdays. Planning one free weekend activity is an easy win.`]); }
  // Savings rate (last full month)
  const inLast = sum(incomes.filter(e => inRange(e, lastR))), outLast = sum(last);
  if(inLast > 0){ const rate = (inLast - outLast) / inLast;
    if(rate < 0.1) out.push(["🏦", `Last month you kept <b>${Math.max(Math.round(rate * 100), 0)}%</b> of your income. Automatically moving 10% of each paycheck into a 🏁 savings goal makes saving the default.`]);
    else if(rate >= 0.2) out.push(["🌟", `Nice — you saved <b>${Math.round(rate * 100)}%</b> of your income last month. Consider sending part of it to a 🏁 goal so it doesn't drift back into spending.`]); }
  // Goals behind
  const behind = goals.map(g => ({ g, st:goalStatus(g) })).filter(x => x.st.key === "behind")[0];
  if(behind) out.push(["🏁", `<b>${esc(behind.g.name)}</b> is behind schedule. ${behind.st.note.split(" · ")[0].replace("needed", "would get it back on track")}.`]);
  // No-spend days
  const spendDays = new Set(cur.filter(e => !e.recurringId).map(e => e.date)).size, noSpend = day - spendDays;
  if(day >= 10 && noSpend >= 3) out.push(["🗓️", `You've had <b>${noSpend} no-spend days</b> so far this month. Try for ${noSpend + 2} by the end of ${MONTHS[m]} — check the 📅 Calendar to see them.`]);
  return out;
}
function buildTips(){
  const mine = personalTips().map(t => ({ icon:t[0], html:t[1], mine:true }));
  // Today's general tip goes first among the general ones, then the rest in rotation
  const start = dayNumber() % GENERAL_TIPS.length;
  const gen = GENERAL_TIPS.map((_, i) => GENERAL_TIPS[(start + i) % GENERAL_TIPS.length]).map(t => ({ icon:t[0], html:t[1], mine:false }));
  // Personal tips rotate daily too, so the first tip changes each day
  if(mine.length){ const r = dayNumber() % mine.length; mine.push(...mine.splice(0, r)); }
  return [...mine, ...gen];
}
function showTip(){
  const t = tipList[tipIdx]; if(!t) return;
  $("tipIcon").textContent = t.icon; $("tipText").innerHTML = t.html;
  $("tipKind").textContent = t.mine ? "Based on your spending" : "Saving tip of the day";
  $("tipCount").textContent = `${tipIdx + 1} of ${tipList.length}`;
  $("tipBanner").classList.toggle("mine", t.mine);
}
function renderTips(){
  let hidden = null; try{ hidden = localStorage.getItem(TIP_HIDE_KEY); }catch(e){}
  const off = hidden === toKey(new Date());
  $("tipBanner").hidden = off; $("tipShow").hidden = !off;
  const keep = tipList[tipIdx];
  tipList = buildTips();
  // Start on today's first tip; once you've browsed, stay on the same tip when data refreshes
  const again = tipBrowsed && keep ? tipList.findIndex(t => t.html === keep.html) : -1;
  tipIdx = again >= 0 ? again : 0;
  if(!off) showTip();
}
$("tipPrev").addEventListener("click", () => { tipBrowsed = true; tipIdx = (tipIdx - 1 + tipList.length) % tipList.length; showTip(); });
$("tipNext").addEventListener("click", () => { tipBrowsed = true; tipIdx = (tipIdx + 1) % tipList.length; showTip(); });
$("tipClose").addEventListener("click", () => { try{ localStorage.setItem(TIP_HIDE_KEY, toKey(new Date())); }catch(e){} $("tipBanner").hidden = true; $("tipShow").hidden = false; });
$("tipShow").addEventListener("click", () => { try{ localStorage.removeItem(TIP_HIDE_KEY); }catch(e){} tipIdx = 0; tipBrowsed = false; renderTips(); });
