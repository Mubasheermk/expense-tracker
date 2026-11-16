/* Spendly · Excel / CSV / PDF export.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Export (Excel / CSV / PDF) ---------------- */
const LIBS = {
  xlsx:     "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  jspdf:    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  autotable:"https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"
};
const loaded = {};
function loadScript(src){
  return loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res;
    s.onerror = () => { delete loaded[src]; rej(new Error("Could not load export library")); };
    document.head.appendChild(s);
  });
}

function exportRows(){
  const range = $("exportRange").value;
  let rows;
  if(range === "all") rows = allRecords.slice();
  else if(range === "period") rows = allRecords.filter(e => inRange(e, periodRange(period, anchor)));
  else rows = allRecords.filter(matchesFilter);
  return rows.sort((a,b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
}
function rangeText(){
  const r = $("exportRange").value;
  if(r === "all") return "Everything";
  if(r === "period") return `${period[0].toUpperCase()+period.slice(1)}: ${rangeLabel()}`;
  const parts = [], cf = $("catFilter").value;
  if(dateFilter()) parts.push(dateFilterText());
  if(cf) parts.push(cf === "__income" ? "Income only" : cf === "__expense" ? "Expenses only" : `Category: ${cf}`);
  if($("search").value.trim()) parts.push(`Search: "${$("search").value.trim()}"`);
  return parts.length ? parts.join(" · ") : "All expenses";
}
const HEAD = ["Date","Type","Description","Category","Payment","Note","Tags","Amount (USD)"];
const AMT = HEAD.length - 1;                                   // amount is always the last column
const AMT_COL = String.fromCharCode(65 + AMT);                 // its spreadsheet letter (G)
const toRow = e => [e.date, isIncome(e) ? "Income" : "Expense", e.title || "", e.category || "", e.payment || "",
  (e.note || "").replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/\s+/g, " ").trim(), (e.tags || []).map(t => "#" + t).join(" "),
  Math.round(e.amount*100)/100];
const labelRow = (label, v) => { const r = Array(HEAD.length).fill(""); r[AMT - 1] = label; r[AMT] = v; return r; };
// Summary rows: spent, plus income and net when the export includes income
function totalRows(rows, f){
  const out = sum(rows.filter(e => !isIncome(e))), inc = sum(rows.filter(isIncome));
  return inc ? [labelRow("Total spent", f(out)), labelRow("Total income", f(inc)), labelRow("Net", f(inc - out))] : [labelRow("Total spent", f(out))];
}
const fileBase = () => `spendly-expenses-${toKey(new Date())}`;

function download(blob, name){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Guard against spreadsheet formula injection (cells starting with = + - @)
const safeCell = v => typeof v === "string" && /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? "'" + v : v;

function exportCSV(rows){
  const esc = v => { v = String(safeCell(v)); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v; };
  const lines = [HEAD, ...rows.map(toRow), ...totalRows(rows, v => v.toFixed(2))].map(r => r.map(esc).join(","));
  download(new Blob(["﻿" + lines.join("\r\n")], {type:"text/csv;charset=utf-8"}), fileBase() + ".csv");
}

async function exportXLSX(rows){
  await loadScript(LIBS.xlsx);
  const data = [HEAD, ...rows.map(toRow)];   // SheetJS stores these as plain text cells, never formulas
  data.push([], ...totalRows(rows, v => Math.round(v*100)/100));
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{wch:12},{wch:9},{wch:30},{wch:15},{wch:14},{wch:28},{wch:18},{wch:14}];
  for(let i = 2; i <= rows.length + 5; i++){ const c = ws[AMT_COL+i]; if(c && typeof c.v === "number") c.z = '"$"#,##0.00'; }
  ws["!autofilter"] = { ref: `A1:${AMT_COL}${rows.length + 1}` };

  // Second sheet: totals by category
  const byCat = {}; rows.forEach(e => byCat[e.category] = (byCat[e.category]||0) + e.amount);
  const catData = [["Category","Count","Total (USD)"],
    ...Object.keys(byCat).sort((a,b)=>byCat[b]-byCat[a]).map(c => [c, rows.filter(e=>e.category===c).length, Math.round(byCat[c]*100)/100])];
  const ws2 = XLSX.utils.aoa_to_sheet(catData);
  ws2["!cols"] = [{wch:18},{wch:8},{wch:14}];
  for(let i = 2; i <= catData.length; i++){ const c = ws2["C"+i]; if(c) c.z = '"$"#,##0.00'; }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expenses");
  XLSX.utils.book_append_sheet(wb, ws2, "By Category");
  XLSX.writeFile(wb, fileBase() + ".xlsx");
}

async function exportPDF(rows){
  await loadScript(LIBS.jspdf); await loadScript(LIBS.autotable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"pt", format:"letter" });
  const W = doc.internal.pageSize.getWidth();
  // Header band
  doc.setFillColor(136,84,208); doc.rect(0,0,W,70,"F");
  doc.setFillColor(255,77,141); doc.rect(W*0.6,0,W*0.4,70,"F");
  doc.setTextColor(255); doc.setFont("helvetica","bold"); doc.setFontSize(20);
  doc.text("Spendly · Expense Report", 40, 42);
  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  const who = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email || "") : "";
  doc.text(`Generated ${new Date().toLocaleString("en-US")}${who ? "  ·  " + who : ""}`, 40, 58);
  doc.setTextColor(40); doc.setFontSize(11);
  doc.text(`Range: ${rangeText()}`, 40, 95);
  doc.setFont("helvetica","bold");
  const pOut = sum(rows.filter(e => !isIncome(e))), pIn = sum(rows.filter(isIncome));
  // Summary tiles
  const net = pIn - pOut, dates = rows.map(e => e.date).sort();
  const spanDays = dates.length ? Math.round((parseKey(dates[dates.length - 1]) - parseKey(dates[0])) / 86400000) + 1 : 1;
  const biggest = rows.filter(e => !isIncome(e)).reduce((a, b) => (!a || b.amount > a.amount) ? b : a, null);
  const tiles = pIn
    ? [["Spent", fmt(pOut), [231,76,60]], ["Income", fmt(pIn), [16,172,132]], ["Net", (net >= 0 ? "+" : "-") + fmt(Math.abs(net)), net >= 0 ? [16,172,132] : [231,76,60]], ["Records", String(rows.length), [46,134,222]]]
    : [["Spent", fmt(pOut), [231,76,60]], ["Daily average", fmt(pOut / spanDays), [136,84,208]], ["Largest expense", biggest ? fmt(biggest.amount) : "—", [255,159,67]], ["Records", String(rows.length), [46,134,222]]];
  const tw = (W - 80 - 30) / 4;
  tiles.forEach(([label, value, col], i) => {
    const x = 40 + i * (tw + 10);
    doc.setFillColor(246,247,252); doc.roundedRect(x, 106, tw, 50, 6, 6, "F");
    doc.setFillColor(...col); doc.rect(x, 106, 4, 50, "F");
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(110); doc.text(label, x + 12, 124);
    doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(...col); doc.text(value, x + 12, 145);
  });
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(120);
  if(dates.length) doc.text(`${parseKey(dates[0]).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} – ${parseKey(dates[dates.length-1]).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`, W - 40, 95, { align:"right" });

  // Charts (rendered off-screen in light colors)
  let y = 172;
  const spendRows = rows.filter(e => !isIncome(e));
  if(rows.length && typeof Chart !== "undefined"){
    const imgs = await reportCharts(rows, dates);
    if(imgs.bar){ doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(40); doc.text(imgs.barTitle, 40, y); doc.addImage(imgs.bar, "PNG", 40, y + 6, W - 80, (W - 80) * 0.36); y += 6 + (W - 80) * 0.36 + 18; }
    if(imgs.pie){
      doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(40); doc.text("Spending by category", 40, y);
      doc.addImage(imgs.pie, "PNG", 40, y + 6, 190, 190);
      // Category summary table next to the pie
      const byCat = {}; spendRows.forEach(e => { const b = byCat[e.category] ||= { n:0, t:0 }; b.n++; b.t += e.amount; });
      const cats = Object.keys(byCat).sort((a, b) => byCat[b].t - byCat[a].t);
      doc.autoTable({
        startY: y + 6, margin: { left: 250, right: 40 },
        head: [["Category", "Count", "Total", "Share"]],
        body: cats.map(c => [c, byCat[c].n, fmt(byCat[c].t), Math.round(byCat[c].t / pOut * 100) + "%"]),
        foot: [["Total", spendRows.length, fmt(pOut), "100%"]],
        styles: { fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: [136,84,208], textColor: 255 },
        footStyles: { fillColor: [238,240,251], textColor: 30, fontStyle: "bold" },
        columnStyles: { 1:{halign:"right"}, 2:{halign:"right"}, 3:{halign:"right"} },
        didParseCell: d => { if(d.section === "body" && d.column.index === 0){ const c = catMap[d.cell.raw]; if(c){ d.cell.styles.textColor = pdfColor(c.color); d.cell.styles.fontStyle = "bold"; } } }
      });
      y = Math.max(y + 6 + 190, doc.lastAutoTable.finalY) + 20;
    }
  }
  // Transactions start on a new page when there were charts
  if(y > 172){ doc.addPage(); y = 40; }
  // Money flow diagram (only meaningful with income)
  if(pIn > 0){
    const flow = buildFlow(rows), w = 1000;
    const svg = sankeySVG(flow, w, { export:true, textColor:"#22263f", mutedColor:"#6b7090" });
    const hgt = +svg.match(/height="(\d+(?:\.\d+)?)"/)[1];
    const png = await svgToPng(svg, w, hgt);
    if(png){
      const dw = W - 80, dh = dw * hgt / w;
      doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(40); doc.text("Money flow", 40, y);
      doc.addImage(png, "PNG", 40, y + 6, dw, dh); y += 6 + dh + 22;
      if(y > doc.internal.pageSize.getHeight() - 120){ doc.addPage(); y = 40; }
    }
  }
  doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(40); doc.text("Transactions", 40, y);

  doc.autoTable({
    startY: y + 8,
    head: [HEAD],
    body: rows.map(e => { const r = toRow(e); r[AMT] = (isIncome(e) ? "+" : "") + fmt(r[AMT]); return r; }),
    foot: totalRows(rows, fmt),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [46,134,222], textColor: 255 },
    footStyles: { fillColor: [238,240,251], textColor: 30, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248,249,254] },
    columnStyles: { 0:{cellWidth:58}, 1:{cellWidth:44}, 5:{cellWidth:96}, 6:{cellWidth:62}, [AMT]:{halign:"right", cellWidth:66} },
    didParseCell: d => {
      if(d.section === "body" && d.column.index === 3){
        const c = catMap[d.cell.raw]; if(c){ d.cell.styles.textColor = pdfColor(c.color); d.cell.styles.fontStyle = "bold"; }
      }
    },
  });
  // Page numbers on every page
  const pages = doc.internal.getNumberOfPages(), H = doc.internal.pageSize.getHeight();
  for(let i = 1; i <= pages; i++){ doc.setPage(i); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Spendly report · Page ${i} of ${pages}`, W - 40, H - 20, { align:"right" }); }
  doc.save(fileBase() + ".pdf");
}

// Render an SVG string to a PNG data URL (2× for sharpness)
function svgToPng(svg, w, h){
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2;
      const x = c.getContext("2d"); x.scale(2, 2); x.drawImage(img, 0, 0, w, h); res(c.toDataURL("image/png")); };
    img.onerror = () => res(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

// Category color as RGB for PDF text, darkened if it's too light to read on white
function pdfColor(hex){
  const h = (hex || "#778ca3").slice(1); let [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if(lum > 0.62){ const k = 0.62 / lum; r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k); }
  return [r, g, b];
}

// Draw the report charts on a hidden canvas and return them as PNG data URLs
async function reportCharts(rows, dates){
  const out = {}, spend = rows.filter(e => !isIncome(e)), inc = rows.filter(isIncome);
  const make = async (w, h, cfg) => {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(cv);
    const white = { id:"bg", beforeDraw: c => { const x = c.ctx; x.save(); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.restore(); } };
    cfg.options = { ...(cfg.options || {}), responsive:false, animation:false, devicePixelRatio:2 };
    cfg.plugins = [white];
    const ch = new Chart(cv.getContext("2d"), cfg);
    const url = ch.toBase64Image("image/png", 1); ch.destroy(); cv.remove(); return url;
  };
  const prevColor = Chart.defaults.color; Chart.defaults.color = "#555a7a";
  try{
    if(dates.length){
      const first = parseKey(dates[0]), last = parseKey(dates[dates.length - 1]);
      const days = Math.round((last - first) / 86400000) + 1;
      let labels = [], keyOf;
      if(days <= 62){
        for(let d = new Date(first); d <= last; d = addDays(d, 1)) labels.push(toKey(d));
        keyOf = e => e.date; out.barTitle = "Daily spending" + (inc.length ? " and income" : "");
      } else {
        for(let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) labels.push(toKey(d).slice(0, 7));
        keyOf = e => e.date.slice(0, 7); out.barTitle = "Monthly spending" + (inc.length ? " and income" : "");
      }
      const idx = Object.fromEntries(labels.map((l, i) => [l, i]));
      const sv = labels.map(() => 0), iv = labels.map(() => 0);
      spend.forEach(e => { const i = idx[keyOf(e)]; if(i !== undefined) sv[i] += e.amount; });
      inc.forEach(e => { const i = idx[keyOf(e)]; if(i !== undefined) iv[i] += e.amount; });
      const nice = l => l.length === 7 ? `${MONTHS[+l.slice(5) - 1]} ${l.slice(2, 4)}` : `${MONTHS[+l.slice(5, 7) - 1]} ${+l.slice(8)}`;
      out.bar = await make(1000, 360, { type:"bar",
        data:{ labels: labels.map(nice), datasets:[{ label:"Spent", data:sv, backgroundColor:"#8854d0", borderRadius:4 },
          ...(inc.length ? [{ label:"Income", data:iv, backgroundColor:"#1dd1a1", borderRadius:4 }] : [])] },
        options:{ plugins:{ legend:{ display: inc.length > 0, position:"top", align:"end" } },
          scales:{ y:{ beginAtZero:true, ticks:{ callback:v => "$" + v }, grid:{ color:"#eef0fb" } }, x:{ grid:{ display:false } } } } });
    }
    if(spend.length){
      const byCat = {}; spend.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + e.amount);
      const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
      out.pie = await make(500, 500, { type:"doughnut",
        data:{ labels:cats, datasets:[{ data:cats.map(c => byCat[c]), backgroundColor:cats.map(c => (catMap[c] || catMap.Other).color), borderColor:"#fff", borderWidth:3 }] },
        options:{ cutout:"58%", plugins:{ legend:{ display:false } } } });
    }
  } finally { Chart.defaults.color = prevColor; }
  return out;
}

$("exportBtn").addEventListener("click", e => {
  e.stopPropagation();
  const m = $("exportMenu"); m.hidden = !m.hidden;
  $("exportBtn").setAttribute("aria-expanded", String(!m.hidden));
});
document.addEventListener("click", e => { if(!e.target.closest(".export")) $("exportMenu").hidden = true; });
$("exportMenu").addEventListener("click", async e => {
  const btn = e.target.closest("button[data-fmt]"); if(!btn) return;
  const rows = exportRows();
  if(!rows.length) return toast("Nothing to export for this range");
  const btns = $("exportMenu").querySelectorAll("button"); btns.forEach(b => b.disabled = true);
  try{
    if(btn.dataset.fmt === "csv") exportCSV(rows);
    else if(btn.dataset.fmt === "xlsx") await exportXLSX(rows);
    else await exportPDF(rows);
    toast(`📥 Exported ${rows.length} record${rows.length===1?"":"s"}`);
    $("exportMenu").hidden = true;
  }catch(err){ console.error(err); toast("Export failed: " + err.message); }
  btns.forEach(b => b.disabled = false);
});
