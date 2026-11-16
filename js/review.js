/* Spendly · Year in review: a yearly summary with highlights and a shareable image.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Year in review ---------------- */
let reviewYear = new Date().getFullYear();

// Every number for one calendar year (up to today for the current year)
function yearStats(year){
  const now = new Date(), isCurrent = year === now.getFullYear();
  const start = new Date(year, 0, 1), end = isCurrent ? startOfDay(now) : new Date(year, 11, 31);
  const inYear = e => e._date.getFullYear() === year && e._date <= end;
  const out = expenses.filter(inYear), inc = incomes.filter(inYear);
  // Count days from the first transaction of the year, so a year you started mid-way isn't padded with empty months
  const first = [...out, ...inc].reduce((a, e) => !a || e._date < a ? e._date : a, null);
  const from = first && first > start ? startOfDay(first) : start;
  const spent = sum(out), earned = sum(inc), days = Math.max(Math.round((end - from) / 86400000) + 1, 1);

  const months = Array.from({ length:12 }, (_, m) => ({ m, out:0, in:0 }));
  out.forEach(e => months[e._date.getMonth()].out += e.amount);
  inc.forEach(e => months[e._date.getMonth()].in += e.amount);
  const active = months.filter(x => x.m <= end.getMonth() && (x.out > 0 || x.in > 0));
  const biggest = active.slice().sort((a, b) => b.out - a.out)[0];
  const quietest = active.filter(x => x.out > 0).sort((a, b) => a.out - b.out)[0];

  const byCat = {}; out.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + e.amount);
  const cats = Object.keys(byCat).map(c => ({ c, v:byCat[c] })).sort((a, b) => b.v - a.v);

  // Most frequent place, grouped by the leading words of the description (recurring items excluded)
  const places = {};
  out.filter(e => !e.recurringId).forEach(e => { const k = commonPrefix([e.title || ""]); if(k.length < 3) return;
    const p = places[k] ||= { k, n:0, v:0, title:k.replace(/\b\p{L}/gu, ch => ch.toUpperCase()) }; p.n++; p.v += e.amount; });
  const topPlace = Object.values(places).sort((a, b) => b.n - a.n || b.v - a.v)[0];

  const biggestBuy = out.filter(e => !e.recurringId).reduce((a, b) => (!a || b.amount > a.amount) ? b : a, null);

  // No-spend days (one-off spending only) and the longest streak
  const spendDays = new Set(out.filter(e => !e.recurringId).map(e => e.date));
  let noSpend = 0, streak = 0, best = 0;
  for(let d = new Date(from); d <= end; d = addDays(d, 1)){ if(spendDays.has(toKey(d))){ streak = 0; } else { noSpend++; streak++; best = Math.max(best, streak); } }

  const dow = Array(7).fill(0); out.filter(e => !e.recurringId).forEach(e => dow[(e._date.getDay() + 6) % 7] += e.amount);
  const busiestDow = dow.indexOf(Math.max(...dow));

  const goalsDone = goals.filter(g => (g.saved || 0) >= (g.target || Infinity)).length;

  // Same period last year, for comparison
  const prevEnd = new Date(year - 1, end.getMonth(), end.getDate());
  const prevSpent = sum(expenses.filter(e => e._date.getFullYear() === year - 1 && e._date <= prevEnd));

  return { year, isCurrent, start, from, end, days, spent, earned, net:earned - spent, count:out.length + inc.length,
    months, biggest, quietest, cats, topPlace, biggestBuy, noSpend, best, busiestDow:dow.some(v => v > 0) ? busiestDow : -1,
    goalsDone, prevSpent, hasData: out.length + inc.length > 0 };
}

const DOW_LONG = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
function monthBarsSVG(st, w, h, o = {}){
  const max = Math.max(...st.months.map(x => Math.max(x.out, x.in)), 1), bw = w / 12;
  const txt = o.text || "currentColor";
  return st.months.map((x, i) => {
    const ho = x.out / max * (h - 22), hi = x.in / max * (h - 22), cx = i * bw;
    const hot = st.biggest && st.biggest.m === i;
    return `${x.in ? `<rect x="${cx + bw * .16}" y="${h - 16 - hi}" width="${bw * .3}" height="${hi}" rx="3" fill="#1dd1a1" opacity=".85"/>` : ""}
      <rect x="${cx + (x.in ? bw * .5 : bw * .25)}" y="${h - 16 - ho}" width="${x.in ? bw * .3 : bw * .5}" height="${Math.max(ho, x.out ? 2 : 0)}" rx="3" fill="${hot ? (o.hot || "#ff4d8d") : (o.bar || "#8854d0")}"/>
      <text x="${cx + bw / 2}" y="${h - 3}" text-anchor="middle" font-size="${o.fs || 10}" fill="${txt}" opacity=".75">${MONTHS[i][0]}</text>`;
  }).join("");
}

function renderReview(){
  const years = [...new Set(allRecords.map(e => e._date.getFullYear()))].sort((a, b) => b - a);
  if(!years.includes(reviewYear)) years.unshift(reviewYear);
  $("revYear").innerHTML = years.map(y => `<option ${y === reviewYear ? "selected" : ""}>${y}</option>`).join("");
  const st = yearStats(reviewYear);
  $("revTitle").textContent = `🎉 Your ${reviewYear} with Spendly`;
  const fromTxt = `${MONTHS[st.from.getMonth()]} ${st.from.getDate()}`;
  $("revRange").textContent = st.isCurrent ? `${fromTxt} – ${MONTHS[st.end.getMonth()]} ${st.end.getDate()}, so far` : st.from > st.start ? `${fromTxt} – Dec 31` : "Full year";
  if(!st.hasData){ $("revBody").innerHTML = `<div class="empty">No transactions recorded in ${reviewYear}.</div>`; $("revShare").disabled = $("revDownload").disabled = true; return; }
  $("revShare").disabled = $("revDownload").disabled = false;
  const rate = st.earned > 0 ? Math.round(st.net / st.earned * 100) : null;
  const cmp = st.prevSpent > 0 ? Math.round((st.spent - st.prevSpent) / st.prevSpent * 100) : null;
  const tile = (label, value, cls = "", sub = "") => `<div class="rv-tile"><div class="cl">${label}</div><div class="cv ${cls}">${value}</div>${sub ? `<div class="cs">${sub}</div>` : ""}</div>`;
  const hl = [];
  if(st.biggest) hl.push(["📈", `Biggest month: <b>${MONTHS[st.biggest.m]}</b> (${fmt(st.biggest.out)})`]);
  if(st.quietest && st.quietest !== st.biggest) hl.push(["🧘", `Quietest month: <b>${MONTHS[st.quietest.m]}</b> (${fmt(st.quietest.out)})`]);
  if(st.topPlace && st.topPlace.n >= 2) hl.push(["📍", `Most visited: <b>${esc(st.topPlace.title)}</b> — ${st.topPlace.n} times, ${fmt(st.topPlace.v)}`]);
  if(st.biggestBuy) hl.push(["💸", `Biggest one-off purchase: <b>${esc(st.biggestBuy.title)}</b> (${fmt(st.biggestBuy.amount)}, ${st.biggestBuy._date.toLocaleDateString("en-US",{month:"short",day:"numeric"})})`]);
  if(st.busiestDow >= 0) hl.push(["📅", `You spend the most on <b>${DOW_LONG[st.busiestDow]}s</b>`]);
  hl.push(["🌿", `<b>${st.noSpend} no-spend days</b> — your longest streak was ${st.best} day${st.best === 1 ? "" : "s"}`]);
  if(st.goalsDone) hl.push(["🏁", `<b>${st.goalsDone} savings goal${st.goalsDone === 1 ? "" : "s"}</b> reached`]);
  if(cmp !== null) hl.push([cmp > 0 ? "🔺" : "🔻", `Spending is <b class="${cmp > 0 ? "up-t" : "down-t"}">${cmp > 0 ? "up" : "down"} ${Math.abs(cmp)}%</b> compared with the same period of ${reviewYear - 1}`]);

  const top = st.cats.slice(0, 5);
  $("revBody").innerHTML = `
    <div class="rv-grid">
      ${tile("Spent", fmt(st.spent), "", `${fmt(st.spent / st.days)} a day`)}
      ${st.earned ? tile("Income", fmt(st.earned), "down-t") : ""}
      ${st.earned ? tile(st.net >= 0 ? "Saved" : "Overspent", fmt(Math.abs(st.net)), st.net >= 0 ? "down-t" : "up-t", rate === null ? "" : rate >= 0 ? `${rate}% of income` : `${Math.abs(rate)}% more than income`) : ""}
      ${tile("Transactions", st.count.toLocaleString("en-US"))}
    </div>
    <div class="rv-sec">Month by month${st.earned ? ` <span class="sub-h">· <i class="lg" style="background:#8854d0"></i>spent <i class="lg" style="background:#1dd1a1"></i>income</span>` : ""}</div>
    <svg class="rv-bars" viewBox="0 0 600 140" preserveAspectRatio="none">${monthBarsSVG(st, 600, 140)}</svg>
    ${top.length ? `<div class="rv-sec">Top categories</div>
      ${top.map(x => { const c = catMap[x.c] || catMap.Other, p = x.v / st.spent * 100;
        return `<div class="rv-cat"><span class="rn">${esc(c.icon)} ${esc(x.c)}</span><span class="rb"><i style="width:${p.toFixed(1)}%;background:${c.color}"></i></span><span class="rv">${fmt(x.v)} · ${Math.round(p)}%</span></div>`; }).join("")}` : ""}
    <div class="rv-sec">Highlights</div>
    <ul class="rv-hl">${hl.map(([i, t]) => `<li><span>${i}</span><span>${t}</span></li>`).join("")}</ul>`;
}
function openReview(year){ reviewYear = year || new Date().getFullYear(); renderReview(); $("reviewModal").hidden = false; }
const closeReview = () => { $("reviewModal").hidden = true; };
$("reviewBtn").addEventListener("click", () => openReview());
$("revClose").addEventListener("click", closeReview);
$("revYear").addEventListener("change", () => { reviewYear = +$("revYear").value; renderReview(); });
$("reviewModal").addEventListener("click", e => { if(e.target.id === "reviewModal") closeReview(); });

// A 1080×1350 share card (Instagram portrait size) drawn as SVG, then turned into a PNG
function reviewCardSVG(st){
  const W = 1080, H = 1350, f = "Helvetica, Arial, sans-serif", e = esc;
  const rate = st.earned > 0 ? Math.round(st.net / st.earned * 100) : null;
  const stats = [["Spent", fmt(st.spent)], st.earned ? ["Income", fmt(st.earned)] : ["Per day", fmt(st.spent / st.days)],
    st.earned ? [st.net >= 0 ? "Saved" : "Overspent", fmt(Math.abs(st.net)) + (rate !== null && rate >= 0 ? ` · ${rate}%` : "")] : ["No-spend days", String(st.noSpend)],
    ["Transactions", st.count.toLocaleString("en-US")]];
  const box = (x, y, [l, v]) => `<rect x="${x}" y="${y}" width="470" height="150" rx="28" fill="#fff" fill-opacity=".16"/>
    <text x="${x + 32}" y="${y + 55}" font-size="30" fill="#fff" fill-opacity=".85" font-family="${f}">${e(l)}</text>
    <text x="${x + 32}" y="${y + 115}" font-size="52" font-weight="700" fill="#fff" font-family="${f}">${e(v)}</text>`;
  const top = st.cats.slice(0, 3);
  const cats = top.map((x, i) => { const c = catMap[x.c] || catMap.Other, p = x.v / st.spent, y = 840 + i * 80;
    return `<text x="70" y="${y}" font-size="34" fill="#fff" font-family="${f}">${e(c.icon)} ${e(x.c)}</text>
      <rect x="430" y="${y - 24}" width="400" height="26" rx="13" fill="#fff" fill-opacity=".2"/>
      <rect x="430" y="${y - 24}" width="${Math.max(400 * p, 10)}" height="26" rx="13" fill="#fff"/>
      <text x="1010" y="${y}" text-anchor="end" font-size="32" font-weight="700" fill="#fff" font-family="${f}">${Math.round(p * 100)}%</text>`; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a11cb"/><stop offset=".55" stop-color="#ff4d8d"/><stop offset="1" stop-color="#ff9f43"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <text x="70" y="140" font-size="40" fill="#fff" fill-opacity=".85" font-family="${f}">💸 Spendly</text>
    <text x="70" y="235" font-size="84" font-weight="700" fill="#fff" font-family="${f}">My ${st.year} in money</text>
    <text x="70" y="295" font-size="32" fill="#fff" fill-opacity=".8" font-family="${f}">${MONTHS[st.from.getMonth()]} ${st.from.getDate()} – ${st.isCurrent ? `${MONTHS[st.end.getMonth()]} ${st.end.getDate()}` : "Dec 31"}</text>
    ${box(55, 350, stats[0])}${box(555, 350, stats[1])}${box(55, 520, stats[2])}${box(555, 520, stats[3])}
    ${top.length ? `<text x="70" y="770" font-size="36" font-weight="700" fill="#fff" font-family="${f}">Top categories</text>${cats}` : ""}
    <text x="70" y="1080" font-size="36" font-weight="700" fill="#fff" font-family="${f}">Month by month</text>
    <svg x="60" y="1100" width="960" height="150" viewBox="0 0 960 150" font-family="${f}">${monthBarsSVG(st, 960, 150, { bar:"#ffffff", hot:"#ffd166", text:"#ffffff", fs:22 })}</svg>
    <text x="${W / 2}" y="${H - 36}" text-anchor="middle" font-size="26" fill="#fff" fill-opacity=".75" font-family="${f}">${st.noSpend} no-spend days · longest streak ${st.best} days</text>
  </svg>`;
}
async function reviewImage(){
  const st = yearStats(reviewYear);
  const url = await svgToPng(reviewCardSVG(st), 1080, 1350);
  if(!url) throw new Error("Couldn't draw the image");
  return { url, blob: await (await fetch(url)).blob(), name:`spendly-${reviewYear}-review.png` };
}
$("revDownload").addEventListener("click", async () => {
  try{ const img = await reviewImage(); download(img.blob, img.name); toast("🖼️ Image saved"); }
  catch(err){ console.error(err); toast("Couldn't create the image: " + err.message); }
});
$("revShare").addEventListener("click", async () => {
  try{
    const img = await reviewImage(), file = new File([img.blob], img.name, { type:"image/png" });
    if(navigator.canShare && navigator.canShare({ files:[file] })) await navigator.share({ files:[file], title:`My ${reviewYear} with Spendly` });
    else { download(img.blob, img.name); toast("Sharing isn't available here, so the image was saved instead"); }
  }catch(err){ if(err.name !== "AbortError"){ console.error(err); toast("Couldn't share: " + err.message); } }
});
