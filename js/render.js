/* Spendly · Rendering: money flow, calendar, cash flow, insights, stats, charts and the transaction list.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Rendering ---------------- */
function renderAll(){ renderTips(); renderStats(); renderCashflow(); renderSankey(); renderCharts(); renderList(); renderBudgets(); renderInsights(); renderCalendar(); }

/* ---------------- Money flow (Sankey) ---------------- */
// Flow: income sources → total in → spending categories (+ Saved, or + From savings when overspent)
function buildFlow(rows){
  const out = rows.filter(e => !isIncome(e)), inc = rows.filter(isIncome);
  const tIn = sum(inc), tOut = sum(out);
  const group = (list, catsList) => {
    const by = {}; list.forEach(e => by[e.category] = (by[e.category] || 0) + e.amount);
    return Object.keys(by).map(n => ({ name:n, value:by[n], color:(catMap[n] || catMap.Other).color, icon:(catMap[n] || catMap.Other).icon, cat:n })).sort((a, b) => b.value - a.value);
  };
  let left = group(inc), right = group(out);
  // Fold categories under 3% of spending into one "Other" node so labels stay readable
  if(right.length > 6){
    const small = right.filter((r, i) => i >= 5 && r.value / tOut < 0.03);
    if(small.length > 1){ right = right.filter(r => !small.includes(r));
      right.push({ name:`${small.length} more`, value:sum(small), color:"#a4b0be", icon:"📦", cat:null }); }
  }
  if(!tIn){ // no income: just show spending split
    return { left:[{ name:"Spent", value:tOut, color:"#8854d0", icon:"💸" }], mid:null, right, total:tOut, tIn, tOut };
  }
  if(tIn > tOut) right.push({ name:"Saved", value:tIn - tOut, color:"#10ac84", icon:"🏦", saved:true });
  if(tOut > tIn) left.push({ name:"From savings", value:tOut - tIn, color:"#e74c3c", icon:"⚠️", short:true });
  return { left, mid:{ name:"Money in", value:Math.max(tIn, tOut) }, right, total:Math.max(tIn, tOut), tIn, tOut };
}

// Returns an SVG string. Three columns when there's income, two when there isn't.
function sankeySVG(flow, W, o = {}){
  const narrow = W < 620, fs = narrow ? 10.5 : 12.5, lineH = narrow ? 26 : 18, gap = lineH + 4, nodeW = 12;
  const labW = narrow ? Math.min(118, W * 0.32) : Math.min(210, W * 0.26);
  const cols = flow.mid ? [labW, (W - nodeW) / 2, W - labW - nodeW] : [labW, null, W - labW - nodeW];
  const n = Math.max(flow.left.length, flow.right.length, 1);
  const H = Math.max(narrow ? 220 : 260, n * (gap + 14) + 30), pad = 16;
  const k = (H - pad * 2 - (n - 1) * gap) / Math.max(flow.total, 0.01);
  const esc2 = t => esc(t);
  const money = v => fmt(v).replace(".00", "");
  const pct = v => flow.tIn ? Math.round(v / flow.tIn * 100) + "%" : Math.round(v / Math.max(flow.tOut, 0.01) * 100) + "%";
  // Stack nodes in a column, centred vertically
  const stack = (list) => {
    const used = list.reduce((a, d) => a + d.value * k, 0) + (list.length - 1) * gap;
    let y = (H - used) / 2;
    return list.map(d => { const h = Math.max(d.value * k, 1.5); const r = { ...d, y, h }; y += h + gap; return r; });
  };
  const L = stack(flow.left), R = stack(flow.right);
  const band = (x0, y0a, y0b, x1, y1a, y1b, color, title, attrs = "") => {
    const xm = (x0 + x1) / 2;
    return `<path class="lk" ${attrs} d="M${x0},${y0a} C${xm},${y0a} ${xm},${y1a} ${x1},${y1a} L${x1},${y1b} C${xm},${y1b} ${xm},${y0b} ${x0},${y0b} Z" fill="${color}" opacity="${o.export ? 0.42 : 0.38}"><title>${esc2(title)}</title></path>`;
  };
  let links = "", nodes = "", labels = "";
  const tColor = o.textColor ? `fill="${o.textColor}"` : "", mColor = o.mutedColor ? `fill="${o.mutedColor}"` : "";
  const label = (x, yc, anchor, name, amount) => narrow
    ? `<text x="${x}" y="${yc - 2}" text-anchor="${anchor}" font-size="${fs}" font-weight="600" ${tColor}>${esc2(name)}</text><text class="amt" x="${x}" y="${yc + fs}" text-anchor="${anchor}" font-size="${fs - 1}" ${mColor}>${amount}</text>`
    : `<text x="${x}" y="${yc + fs / 3}" text-anchor="${anchor}" font-size="${fs}" ${tColor}><tspan font-weight="600">${esc2(name)}</tspan><tspan class="amt" ${mColor} dx="6">${amount}</tspan></text>`;

  if(flow.mid){
    const mH = flow.total * k, mY = (H - mH) / 2, mx = cols[1];
    let off = mY;
    L.forEach(d => { links += band(cols[0] + nodeW, d.y, d.y + d.h, mx, off, off + d.h, d.color, `${d.name} → ${flow.mid.name}: ${fmt(d.value)} (${pct(d.value)} of income)`); off += d.h; });
    off = mY;
    R.forEach(d => { links += band(mx + nodeW, off, off + d.h, cols[2], d.y, d.y + d.h, d.color, `${flow.mid.name} → ${d.name}: ${fmt(d.value)} (${pct(d.value)} of income)`, d.cat ? `data-cat="${esc2(d.cat)}"` : ""); off += d.h; });
    nodes += `<rect class="nd" x="${mx}" y="${mY}" width="${nodeW}" height="${mH}" rx="3" fill="#8854d0"><title>Income ${fmt(flow.tIn)}${flow.tOut > flow.tIn ? ` + ${fmt(flow.tOut - flow.tIn)} from savings` : ""}</title></rect>`;
    labels += `<text x="${mx + nodeW / 2}" y="${Math.max(mY - 8, fs)}" text-anchor="middle" font-size="${fs}" font-weight="700" ${tColor}>${esc2(flow.mid.name)} ${money(flow.tIn)}</text>`;
  } else {
    // Two columns: Spent → categories
    let off = L[0].y;
    R.forEach(d => { links += band(cols[0] + nodeW, off, off + d.h, cols[2], d.y, d.y + d.h, d.color, `${d.name}: ${fmt(d.value)} (${pct(d.value)})`, d.cat ? `data-cat="${esc2(d.cat)}"` : ""); off += d.h; });
  }
  L.forEach(d => { nodes += `<rect class="nd" x="${cols[0]}" y="${d.y}" width="${nodeW}" height="${d.h}" rx="3" fill="${d.color}"><title>${esc2(d.name)}: ${fmt(d.value)}</title></rect>`;
    labels += label(cols[0] - 8, d.y + d.h / 2, "end", `${d.icon} ${d.name}`, money(d.value)); });
  R.forEach(d => { nodes += `<rect class="nd" ${d.cat ? `data-cat="${esc2(d.cat)}"` : ""} x="${cols[2]}" y="${d.y}" width="${nodeW}" height="${d.h}" rx="3" fill="${d.color}"><title>${esc2(d.name)}: ${fmt(d.value)}</title></rect>`;
    labels += label(cols[2] + nodeW + 8, d.y + d.h / 2, "start", `${d.icon} ${d.name}`, `${money(d.value)} · ${pct(d.value)}`); });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Money flow diagram"${o.export ? ` font-family="Helvetica, Arial, sans-serif"` : ""}>${o.export ? `<rect width="${W}" height="${H}" fill="#fff"/>` : ""}${links}${nodes}${labels}</svg>`;
}

function flowRange(){
  const v = $("flowPeriod").value, now = new Date(), y = now.getFullYear(), m = now.getMonth();
  if(v === "this-month") return [new Date(y, m, 1), new Date(y, m + 1, 1), `${MONTHS[m]} ${y}`];
  if(v === "last-month") return [new Date(y, m - 1, 1), new Date(y, m, 1), `${MONTHS[(m + 11) % 12]} ${m === 0 ? y - 1 : y}`];
  if(v === "last-3")     return [new Date(y, m - 2, 1), new Date(y, m + 1, 1), `${MONTHS[(m + 10) % 12]} – ${MONTHS[m]}`];
  if(v === "this-year")  return [new Date(y, 0, 1), new Date(y + 1, 0, 1), String(y)];
  return [new Date(1990, 0, 1), new Date(2100, 0, 1), "All time"];
}
function renderSankey(){
  const [s0, s1, label] = flowRange();
  const rows = allRecords.filter(e => e._date >= s0 && e._date < s1);
  const flow = buildFlow(rows);
  if(!rows.length || !flow.tOut && !flow.tIn){
    $("flowSub").textContent = `· ${label}`; $("flowHint").textContent = "";
    $("sankey").innerHTML = `<div class="empty">Nothing recorded for ${label} yet.</div>`; return;
  }
  const net = flow.tIn - flow.tOut;
  $("flowSub").textContent = `· ${label}` + (flow.tIn ? ` · ${fmt(flow.tIn)} in · ${fmt(flow.tOut)} out · ${net >= 0 ? "saved" : "overspent"} ${fmt(Math.abs(net))}` : ` · ${fmt(flow.tOut)} spent`);
  $("flowHint").innerHTML = flow.tIn ? "Hover a flow for details · click a category to see its transactions"
    : "Add income with the <b>💵 Income</b> switch to see where your money comes from and how much you keep.";
  const W = Math.max(Math.round($("sankey").clientWidth || 900), 300);
  $("sankey").innerHTML = sankeySVG(flow, W);
}
$("flowPeriod").addEventListener("change", renderSankey);
$("sankey").addEventListener("click", e => {
  const t = e.target.closest("[data-cat]"); if(!t) return;
  const v = $("flowPeriod").value, [s0, s1] = flowRange();
  $("catFilter").value = t.dataset.cat;
  if(v === "this-month" || v === "last-month" || v === "this-year") $("dateRange").value = v;
  else if(v === "all") $("dateRange").value = "";
  else { $("dateRange").value = "custom"; $("dFrom").value = toKey(s0); $("dTo").value = toKey(addDays(s1, -1)); }
  $("dateCustom").hidden = $("dateRange").value !== "custom";
  renderList(); renderCalendar(); $("list").scrollIntoView({ behavior:"smooth", block:"center" });
});
let sankeyResize; window.addEventListener("resize", () => { clearTimeout(sankeyResize); sankeyResize = setTimeout(renderSankey, 150); });

/* ---------------- Calendar heatmap ---------------- */
let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const compact = n => n >= 1000 ? "$" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : "$" + Math.round(n);
function renderCalendar(){
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), dim = daysIn(y, m), todayK = toKey(new Date());
  $("calLabel").textContent = `${MONTHS[m]} ${y}`;
  const out = {}, inn = {};
  expenses.forEach(e => { if(e._date.getFullYear() === y && e._date.getMonth() === m) out[e.date] = (out[e.date] || 0) + e.amount; });
  incomes.forEach(e => { if(e._date.getFullYear() === y && e._date.getMonth() === m) inn[e.date] = (inn[e.date] || 0) + e.amount; });
  const vals = Object.values(out), max = Math.max(...vals, 0), total = vals.reduce((a, b) => a + b, 0);
  const spendDays = vals.filter(v => v > 0).length;
  $("calSub").textContent = total ? `· ${fmt(total)} over ${spendDays} day${spendDays === 1 ? "" : "s"} · ${dim - spendDays} no-spend day${dim - spendDays === 1 ? "" : "s"}` : "· no spending recorded";
  const dr = dateFilter(), selDay = dr && dr[0] === dr[1] ? dr[0] : null;
  let html = DOW.map(d => `<div class="dow">${d}</div>`).join("");
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;             // Monday-first grid
  for(let i = 0; i < lead; i++) html += `<div class="day empty-d"></div>`;
  for(let d = 1; d <= dim; d++){
    const k = toKey(new Date(y, m, d)), v = out[k] || 0;
    // Square-root scale so one big day (like rent) doesn't wash out the rest
    const a = v > 0 ? Math.max(0.08, Math.sqrt(v / max)) : 0;
    const tip = `${parseKey(k).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}: ${fmt(v)} spent${inn[k] ? ` · +${fmt(inn[k])} income` : ""}`;
    html += `<div class="day ${k === todayK ? "today" : ""} ${k === selDay ? "sel" : ""} ${k > todayK ? "future" : ""} ${a > 0.55 ? "hot" : ""}" data-day="${k}" style="--a:${a.toFixed(2)}" title="${tip}">
      <div class="dn">${d}</div>${v ? `<div class="da">${compact(v)}</div>` : ""}${inn[k] ? `<b class="inc-dot"></b>` : ""}</div>`;
  }
  $("cal").innerHTML = html;
}
$("cal").addEventListener("click", e => {
  const d = e.target.closest("[data-day]"); if(!d) return;
  const k = d.dataset.day, dr = dateFilter();
  if(dr && dr[0] === k && dr[1] === k){ $("dateRange").value = ""; $("dateCustom").hidden = true; }   // click again to clear
  else { $("dateRange").value = "custom"; $("dFrom").value = k; $("dTo").value = k; $("dateCustom").hidden = false; }
  renderList(); renderCalendar();
  if($("dateRange").value) $("list").scrollIntoView({ behavior:"smooth", block:"center" });
});
$("calPrev").addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); });
$("calNext").addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); });
$("calToday").addEventListener("click", () => { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); renderCalendar(); });

/* ---------------- Cash flow ---------------- */
function renderCashflow(){
  const now = new Date(), mr = periodRange("month", now), yr = periodRange("year", now);
  const inM = sum(incomes.filter(e => inRange(e, mr))), outM = sum(expenses.filter(e => inRange(e, mr)));
  const inY = sum(incomes.filter(e => inRange(e, yr))), outY = sum(expenses.filter(e => inRange(e, yr)));
  const net = inM - outM, rate = inM > 0 ? Math.round(net / inM * 100) : null;
  $("cashSub").textContent = `· ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  if(!inY && !incomes.length){
    $("cashflow").innerHTML = `<div class="empty" style="grid-column:1/-1">Switch the form to <b>💵 Income</b> to add paychecks and other income. You'll see your net balance and savings rate here.</div>`;
    return;
  }
  const tile = (label, value, cls, sub) => `<div class="cf"><div class="cl">${label}</div><div class="cv ${cls}">${value}</div><div class="cs">${sub}</div></div>`;
  $("cashflow").innerHTML =
    tile("Income", fmt(inM), "down-t", `${fmt(inY)} this year`) +
    tile("Spent", fmt(outM), "", `${fmt(outY)} this year`) +
    tile("Net", (net >= 0 ? "+" : "−") + fmt(Math.abs(net)), net >= 0 ? "down-t" : "up-t", `${inY - outY >= 0 ? "+" : "−"}${fmt(Math.abs(inY - outY))} this year`) +
    tile("Savings rate", rate === null ? "—" : `${rate}%`, rate === null ? "" : rate >= 0 ? "down-t" : "up-t", rate === null ? "No income this month yet" : rate >= 20 ? "Great — 20%+ is a common goal" : rate >= 0 ? "Share of income you kept" : "Spending more than you earned");
}

/* ---------------- Insights ---------------- */
// Compares this month so far with the same days of last month (e.g. Nov 1–11 vs Oct 1–11)
function renderInsights(){
  const now = new Date(), day = now.getDate();
  const y = now.getFullYear(), m = now.getMonth();
  const dim = daysIn(y, m);
  const thisR = [new Date(y, m, 1), addDays(startOfDay(now), 1)];
  const prevDays = Math.min(day, daysIn(y, m - 1 < 0 ? 11 : m - 1));
  const lastR = [new Date(y, m - 1, 1), new Date(y, m - 1, prevDays + 1)];
  const cur = expenses.filter(e => inRange(e, thisR)), prev = expenses.filter(e => inRange(e, lastR));
  const curT = sum(cur), prevT = sum(prev);
  $("insightsSub").textContent = `· ${MONTHS[m]} 1–${day} vs ${MONTHS[(m + 11) % 12]} 1–${prevDays}`;
  if(!cur.length && !prev.length){ $("insights").innerHTML = `<div class="empty">Add a few expenses and insights about your spending will show up here.</div>`; return; }

  const tiles = [];
  const pct = (a, b) => b > 0 ? Math.round((a - b) / b * 100) : null;
  const byCat = list => list.reduce((o, e) => (o[e.category] = (o[e.category] || 0) + e.amount, o), {});

  // 1. Pace vs last month
  const p = pct(curT, prevT);
  if(p !== null) tiles.push({ icon: p > 0 ? "📈" : "📉", accent: p > 0 ? "#e74c3c" : "#10ac84",
    value: `<span class="${p > 0 ? "up-t" : "down-t"}">${p > 0 ? "+" : ""}${p}%</span> vs last month`,
    text: `${fmt(curT)} so far, compared with ${fmt(prevT)} by this point in ${MONTHS[(m + 11) % 12]}` });
  else if(curT > 0) tiles.push({ icon:"🆕", accent:"#2e86de", value:`${fmt(curT)} so far`, text:"No spending recorded for the same days last month to compare with" });

  // 2. Projected month end (+ budget pace)
  if(curT > 0 && day < dim){
    const proj = curT / day * dim; let text = `At this pace you'll spend about ${fmt(proj)} by ${MONTHS[m]} ${dim}`;
    let accent = "#8854d0";
    if(budgets._total > 0){
      const diff = proj - budgets._total;
      text += diff > 0 ? ` — ${fmt(diff)} over your ${fmt(budgets._total)} budget` : ` — within your ${fmt(budgets._total)} budget`;
      accent = diff > 0 ? "#e74c3c" : "#10ac84";
    }
    tiles.push({ icon:"🔮", accent, value:`~${fmt(proj)} projected`, text });
  }

  // 3. Biggest category change
  const cc = byCat(cur), pc = byCat(prev);
  const changes = [...new Set([...Object.keys(cc), ...Object.keys(pc)])].map(c => ({ c, d:(cc[c] || 0) - (pc[c] || 0) })).filter(x => Math.abs(x.d) >= 1);
  if(changes.length){
    const up = changes.reduce((a, b) => b.d > a.d ? b : a), down = changes.reduce((a, b) => b.d < a.d ? b : a);
    const show = (x, isUp) => { const c = catMap[x.c] || catMap.Other, q = pct(cc[x.c] || 0, pc[x.c] || 0);
      tiles.push({ icon:c.icon, accent:c.color, value:`${esc(x.c)} <span class="${isUp ? "up-t" : "down-t"}">${isUp ? "▲" : "▼"} ${fmt(Math.abs(x.d))}</span>`,
        text: q === null ? `New this month: ${fmt(cc[x.c] || 0)} so far` : `${isUp ? "Up" : "Down"} ${Math.abs(q)}% vs the same days last month` }); };
    if(up.d > 0) show(up, true);
    if(down.d < 0 && down.c !== up.c) show(down, false);
  }

  // 4. Top category share
  const topCat = Object.keys(cc).sort((a, b) => cc[b] - cc[a])[0];
  if(topCat && curT > 0){ const c = catMap[topCat] || catMap.Other;
    tiles.push({ icon:"🥇", accent:c.color, value:`${esc(topCat)} is ${Math.round(cc[topCat] / curT * 100)}%`, text:`Your biggest category this month at ${fmt(cc[topCat])}` }); }

  // 5. Largest single expense
  if(cur.length){ const big = cur.reduce((a, b) => b.amount > a.amount ? b : a);
    tiles.push({ icon:"💸", accent:(catMap[big.category] || catMap.Other).color, value:`${fmt(big.amount)} · ${esc(big.title)}`,
      text:`Largest expense this month, on ${big._date.toLocaleDateString("en-US",{month:"short",day:"numeric"})}` }); }

  // 6. Recurring share
  const rec = sum(cur.filter(e => e.recurringId));
  if(rec > 0 && curT > 0) tiles.push({ icon:"🔁", accent:"#00c9a7", value:`${Math.round(rec / curT * 100)}% recurring`,
    text:`${fmt(rec)} of this month's spending came from recurring expenses` });

  // 7. Daily average
  if(curT > 0) tiles.push({ icon:"📅", accent:"#ff9f43", value:`${fmt(curT / day)} per day`,
    text: prevT > 0 ? `vs ${fmt(prevT / prevDays)} per day last month` : `Average over the first ${day} day${day === 1 ? "" : "s"} of ${MONTHS[m]}` });

  $("insights").innerHTML = tiles.slice(0, 6).map(t => `<div class="ins" style="--accent:${t.accent}">
    <div class="ii">${t.icon}</div><div><div class="iv">${t.value}</div><div class="it">${t.text}</div></div></div>`).join("");
}

function renderStats(){
  const now = new Date();
  [["day","stToday","stTodayN"],["week","stWeek","stWeekN"],["month","stMonth","stMonthN"],["year","stYear","stYearN"]]
    .forEach(([p,v,n]) => {
      const r = periodRange(p, now); const items = expenses.filter(e=>inRange(e,r));
      const inc = sum(incomes.filter(e=>inRange(e,r)));
      $(v).textContent = fmt(sum(items));
      $(n).textContent = `${items.length} expense${items.length===1?"":"s"}${inc ? ` · +${fmt(inc)} in` : ""}`;
    });
}

function buildBuckets(){
  const [s,t] = periodRange(period, anchor);
  let labels=[], keyOf, unit;
  if(period==="day"){
    // No time stored per expense → show the 7 days ending on the selected day for context
    labels=[]; const days=[];
    for(let i=6;i>=0;i--){ const d=addDays(startOfDay(anchor),-i); days.push(toKey(d)); labels.push(i===0?"Selected":`${MONTHS[d.getMonth()]} ${d.getDate()}`); }
    const vals = days.map(k => sum(expenses.filter(e=>e.date===k)));
    const inc = days.map(k => sum(incomes.filter(e=>e.date===k)));
    return { labels, vals, inc, highlight:6, unit:"day", range:[s,t] };
  }
  if(period==="week"){ labels=DOW; keyOf=e=>(e._date.getDay()+6)%7; unit="day"; }
  if(period==="month"){
    const n = new Date(anchor.getFullYear(),anchor.getMonth()+1,0).getDate();
    labels = Array.from({length:n},(_,i)=>String(i+1)); keyOf=e=>e._date.getDate()-1; unit="day";
  }
  if(period==="year"){ labels=MONTHS; keyOf=e=>e._date.getMonth(); unit="month"; }
  const vals = labels.map(()=>0), inc = labels.map(()=>0);
  expenses.filter(e=>inRange(e,[s,t])).forEach(e=> vals[keyOf(e)] += e.amount);
  incomes.filter(e=>inRange(e,[s,t])).forEach(e=> inc[keyOf(e)] += e.amount);
  return { labels, vals, inc, highlight:-1, unit, range:[s,t] };
}

function rangeLabel(){
  const [s,t] = periodRange(period, anchor); const e = addDays(t,-1);
  if(period==="day") return s.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  if(period==="week") return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  if(period==="month") return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  return String(s.getFullYear());
}

const PALETTE = ["#ff6b6b","#ff9f43","#feca57","#1dd1a1","#00c9a7","#2e86de","#8854d0","#ff4d8d"];
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function renderCharts(){
  if(typeof Chart==="undefined") return;
  Chart.defaults.color = cssVar("--muted") || "#6b7090";
  const b = buildBuckets();
  $("rangeLabel").textContent = rangeLabel();

  const ctx = $("barChart").getContext("2d");
  const grad = ctx.createLinearGradient(0,0,0,300);
  grad.addColorStop(0,"#8854d0"); grad.addColorStop(1,"#ff4d8d");
  const colors = b.labels.map((_,i)=> b.highlight===-1 ? PALETTE[i%PALETTE.length] : (i===b.highlight ? grad : cssVar("--bar-muted")));

  const barCfg = {
    type:"bar",
    data:{ labels:b.labels, datasets:[{ label:"Spent", data:b.vals, backgroundColor:colors, borderRadius:8, maxBarThickness:42 },
      ...(b.inc.some(v => v > 0) ? [{ label:"Income", data:b.inc, backgroundColor:"#1dd1a1", borderRadius:8, maxBarThickness:42 }] : [])] },
    options:{ responsive:true, maintainAspectRatio:false, animation:{duration:600},
      plugins:{ legend:{display:b.inc.some(v => v > 0), position:"top", align:"end", labels:{boxWidth:10, usePointStyle:true}},
        tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)}`}} },
      scales:{ y:{ beginAtZero:true, ticks:{callback:v=>"$"+v}, grid:{color:cssVar("--soft")} }, x:{ grid:{display:false} } } }
  };
  if(barChart){ barChart.data = barCfg.data; barChart.update(); } else barChart = new Chart(ctx, barCfg);

  // Category breakdown for the selected period
  const items = expenses.filter(e=>inRange(e,b.range));
  const byCat = {}; items.forEach(e => byCat[e.category] = (byCat[e.category]||0) + e.amount);
  const cats = Object.keys(byCat).sort((a,c)=>byCat[c]-byCat[a]);
  const pieData = {
    labels: cats.length ? cats : ["No data"],
    datasets:[{ data: cats.length ? cats.map(c=>byCat[c]) : [1],
      backgroundColor: cats.length ? cats.map(c=>(catMap[c]||catMap.Other).color) : [cssVar("--border")],
      borderWidth:3, borderColor:cssVar("--surface"), hoverOffset:10 }]
  };
  const pieCfg = { type:"doughnut", data:pieData,
    options:{ responsive:true, maintainAspectRatio:false, cutout:"62%",
      plugins:{ legend:{position:"bottom",labels:{boxWidth:12,usePointStyle:true,font:{size:11}}},
        tooltip:{enabled:cats.length>0, callbacks:{label:c=>` ${c.label}: ${fmt(c.parsed)}`}} } } };
  if(pieChart){ pieChart.data = pieData; pieChart.options.plugins.tooltip.enabled = cats.length>0; pieChart.update(); }
  else pieChart = new Chart($("pieChart"), pieCfg);

  const total = sum(items), periodIn = sum(incomes.filter(e=>inRange(e,b.range)));
  $("periodIncome").textContent = periodIn ? ` · Income: ${fmt(periodIn)} · Net: ${periodIn - total >= 0 ? "+" : "−"}${fmt(Math.abs(periodIn - total))}` : "";
  const divisor = period==="day"?1 : period==="week"?7 : period==="month"?b.labels.length : 12;
  $("periodTotal").textContent = fmt(total);
  $("avgUnit").textContent = period==="year" ? "month" : "day";
  $("periodAvg").textContent = fmt(total/divisor);
}

// #tags: letters, numbers, _ and -, up to 24 chars; at most 10 per expense
function parseTags(text){
  const out = []; const re = /#([\p{L}\p{N}_-]{1,24})/gu; let m;
  while((m = re.exec(text || "")) && out.length < 10){ const t = m[1].toLowerCase(); if(!out.includes(t)) out.push(t); }
  return out;
}
// Shared by the list and "Export → Current list". "#tag" searches tags; anything else searches title, note and tags.
// Selected date range for Transactions as [fromKey, toKey] (inclusive), or null for all dates
function dateFilter(){
  const v = $("dateRange").value, now = new Date(), y = now.getFullYear(), m = now.getMonth();
  if(v === "this-month") return [toKey(new Date(y, m, 1)), toKey(new Date(y, m + 1, 0))];
  if(v === "last-month") return [toKey(new Date(y, m - 1, 1)), toKey(new Date(y, m, 0))];
  if(v === "last-30")    return [toKey(addDays(startOfDay(now), -29)), toKey(now)];
  if(v === "this-year")  return [`${y}-01-01`, `${y}-12-31`];
  if(v === "last-year")  return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if(v === "custom"){ const f = $("dFrom").value || "0000-01-01", t = $("dTo").value || "9999-12-31"; return f <= t ? [f, t] : [t, f]; }
  return null;
}
function dateFilterText(){
  const r = dateFilter(); if(!r) return "";
  const nice = k => /^0000|^9999/.test(k) ? "…" : parseKey(k).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  return r[0] === r[1] ? nice(r[0]) : `${nice(r[0])} – ${nice(r[1])}`;
}
function matchesFilter(e){
  const q = $("search").value.trim().toLowerCase(); const cf = $("catFilter").value;
  const dr = dateFilter(); if(dr && (e.date < dr[0] || e.date > dr[1])) return false;
  if(cf === "__income" && !isIncome(e)) return false;
  if(cf === "__expense" && isIncome(e)) return false;
  if(cf && !cf.startsWith("__") && e.category !== cf) return false;
  if(!q) return true;
  if(q.startsWith("#") && q.length > 1) return (e.tags || []).some(t => t.startsWith(q.slice(1)));
  return (e.title || "").toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q) || (e.tags || []).some(t => t.includes(q));
}
function renderList(){
  const rows = allRecords.filter(matchesFilter);
  const filtered = !!($("search").value.trim() || $("catFilter").value || $("dateRange").value), outT = sum(rows.filter(e => !isIncome(e))), inT = sum(rows.filter(isIncome));
  $("listSummary").innerHTML = filtered
    ? `Showing <b>${rows.length}</b> of ${allRecords.length}${dateFilter() ? ` · ${dateFilterText()}` : ""} · <b>${fmt(outT)}</b> spent${inT ? ` · <b class="down-t">+${fmt(inT)}</b> income` : ""} · <button type="button" class="link-btn" id="clearFilters">Clear filters</button>`
    : "";
  if(!rows.length){ $("list").innerHTML = `<div class="empty">${allRecords.length?"Nothing matches this search":"No expenses yet — add your first one! 🎉"}</div>`; return; }
  $("list").innerHTML = rows.map(e => {
    const c = catMap[e.category] || catMap.Other;
    return `<div class="item ${isIncome(e) ? "inc" : ""} ${selecting && picked.has(e.id) ? "picked" : ""}" style="border-left-color:${c.color}">
      ${selecting ? `<input type="checkbox" class="pick" data-pick="${e.id}" ${picked.has(e.id) ? "checked" : ""} aria-label="Select ${esc(e.title)}">` : ""}
      <div class="ic" style="background:${c.color}22">${c.icon}</div>
      <div class="info"><div class="title">${esc(e.title)}</div>
        <div class="meta">${esc(e.category)} · ${e._date.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} · ${esc(e.payment||"")}${e.recurringId ? " · 🔁" : ""}</div>
        ${e.note ? `<div class="note" title="${esc(e.note)}">${esc(e.note.replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/\s+/g, " ").trim())}</div>` : ""}
        ${(e.tags||[]).length ? `<div class="tags">${e.tags.map(t => `<button class="tag" data-tag="${esc(t)}" title="Show #${esc(t)}">#${esc(t)}</button>`).join("")}</div>` : ""}</div>
      <div class="amt" style="color:${c.color}">${isIncome(e) ? "+" : ""}${fmt(e.amount)}</div>
      ${selecting ? "" : `<div class="ops"><button data-act="edit" data-id="${e.id}" title="Edit">✏️</button><button data-act="del" data-id="${e.id}" title="Delete">🗑️</button></div>`}
    </div>`;
  }).join("");
  if(selecting) updateBulk();
}
$("search").addEventListener("input", renderList);
$("listSummary").addEventListener("click", e => {
  if(e.target.id !== "clearFilters") return;
  $("search").value = ""; $("catFilter").value = ""; $("dateRange").value = ""; $("dateCustom").hidden = true; renderList(); renderCalendar();
});
$("list").addEventListener("click", e => {
  const t = e.target.closest(".tag"); if(!t) return;
  e.stopPropagation(); $("search").value = "#" + t.dataset.tag; renderList();
});
$("catFilter").addEventListener("change", renderList);
$("dateRange").addEventListener("change", () => {
  $("dateCustom").hidden = $("dateRange").value !== "custom";
  if($("dateRange").value === "custom" && !$("dFrom").value){ const t = toKey(new Date()); $("dFrom").value = t.slice(0, 8) + "01"; $("dTo").value = t; }
  renderList();
});
["dFrom","dTo"].forEach(id => $(id).addEventListener("change", renderList));
