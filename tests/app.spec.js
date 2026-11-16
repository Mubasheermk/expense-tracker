// Spendly browser tests. Each test opens the app with a fresh mock Firebase (tests/mock-firebase.js),
// which signs in a test user and seeds sample data relative to today.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const APP = "file://" + path.resolve(__dirname, "..", "index.html");
const MOCK = fs.readFileSync(path.join(__dirname, "mock-firebase.js"), "utf8");
// Optional: serve CDN libraries from a local node_modules folder when there's no internet
const LOCAL_CDN = process.env.LOCAL_CDN;

const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const us = d => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
const store = page => page.evaluate(() => window.__store);

async function openApp(page){
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(MOCK);
  await page.route(/gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.fulfill({ body:"", contentType:"text/javascript" }));
  if(LOCAL_CDN){
    const map = { "chart.umd": "chart.js/dist/chart.umd.js", "xlsx.full": "xlsx/dist/xlsx.full.min.js", "autotable": "jspdf-autotable/dist/jspdf.plugin.autotable.min.js", "jspdf.umd": "jspdf/dist/jspdf.umd.min.js" };
    await page.route(/cdnjs\.cloudflare\.com/, r => { const u = r.request().url(); const k = Object.keys(map).find(k => u.includes(k));
      return k ? r.fulfill({ body: fs.readFileSync(path.join(LOCAL_CDN, map[k])), contentType:"text/javascript" }) : r.abort(); });
  }
  await page.goto(APP);
  await expect(page.locator("#dbStatus")).toContainText("Synced");
  return errors;
}
// Fail the test if the page threw any JavaScript error
const noErrors = errors => expect(errors, "JavaScript errors on the page").toEqual([]);

test.describe("Spendly", () => {

  test("loads signed in with data and no errors @phone", async ({ page }) => {
    const errors = await openApp(page);
    await expect(page.locator("body")).not.toHaveClass(/signed-out/);
    await expect(page.locator("#list .item").first()).toBeVisible();
    await expect(page.locator("#tipBanner")).toBeVisible();
    // No sideways scrolling on small screens
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    noErrors(errors);
  });

  test("adds an expense with a note and #tags, filters by tag", async ({ page }) => {
    const errors = await openApp(page);
    await page.fill("#fTitle", "Team lunch");
    await page.fill("#fAmount", "48.5");
    await page.fill("#fNote", "Kickoff #Work #team");
    await page.click("#submitBtn");
    const doc = Object.values(await store(page)).find(v => v.title === "Team lunch");
    expect(doc).toMatchObject({ amount:48.5, category:"Food", tags:["work", "team"] });
    await page.click('.tag[data-tag="team"]');
    await expect(page.locator("#search")).toHaveValue("#team");
    await expect(page.locator("#list .title")).toHaveText(["Team lunch"]);
    noErrors(errors);
  });

  test("income shows in cash flow, money flow and charts", async ({ page }) => {
    const errors = await openApp(page);
    await page.click('#typeSeg button[data-type="income"]');
    await expect(page.locator("#submitBtn")).toHaveText("Add Income");
    await page.fill("#fTitle", "Paycheck");
    await page.fill("#fAmount", "3000");
    await page.click("#submitBtn");
    await expect(page.locator(".cf .cv").first()).toHaveText("$3,000.00");
    await expect(page.locator("#flowSub")).toContainText("$3,000.00 in");
    await expect(page.locator("#sankey")).toContainText("Saved");
    await page.click('#tabs .tab[data-p="month"]');
    expect(await page.evaluate(() => barChart.data.datasets.map(d => d.label))).toEqual(["Spent", "Income"]);
    noErrors(errors);
  });

  test("recurring rules backfill missed dates once (deterministic IDs)", async ({ page }) => {
    const errors = await openApp(page);
    const s = await store(page);
    const rent = Object.keys(s).filter(k => k.startsWith("users/u1/expenses/rec_r1_"));
    expect(rent.length).toBe(3);                                         // rule started 3 months ago
    expect(s["users/u1/recurring/r1"].nextDate > key(new Date())).toBeTruthy();
    // Running the catch-up again must not duplicate
    await page.evaluate(() => processRecurring());
    expect(Object.keys(await store(page)).filter(k => k.startsWith("users/u1/expenses/rec_r1_")).length).toBe(3);
    noErrors(errors);
  });

  test("budgets: edit limits and warn near the limit", async ({ page }) => {
    const errors = await openApp(page);
    await page.click("#editBudgetsBtn");
    await page.fill("#b_Health", "50");
    await page.click('#budgetForm button[type="submit"]');
    expect((await store(page))["users/u1/settings/budgets"].limits.Health).toBe(50);
    await page.click('#catChips .chip[data-c="Health"]');
    await page.fill("#fTitle", "Pharmacy");
    await page.fill("#fAmount", "45");
    await page.click("#submitBtn");
    await expect(page.locator("#toast")).toContainText("Health is at 90% of budget", { timeout:5000 });
    noErrors(errors);
  });

  test("custom categories can be added and removed", async ({ page }) => {
    const errors = await openApp(page);
    await page.click("#manageCatsBtn");
    await page.click('[data-qi="🐶"]');
    await page.fill("#catName", "Pets");
    await page.click('#catForm button[type="submit"]');
    await expect(page.locator("#catCustomList .t")).toHaveText(["Pets"]);
    await page.click("#doneCats");
    await expect(page.locator('#catChips .chip[data-c="Pets"]')).toHaveClass(/active/);
    await expect(page.locator('#catFilter option[value="Pets"]')).toHaveCount(1);
    noErrors(errors);
  });

  test("savings goals: create, add money, withdraw", async ({ page }) => {
    const errors = await openApp(page);
    await page.click("#newGoalBtn");
    await page.fill("#gName", "Trip");
    await page.fill("#gTarget", "1000");
    await page.fill("#gStart", "100");
    await page.click("#goalSave");
    const id = () => page.evaluate(() => Object.keys(window.__store).find(k => window.__store[k].name === "Trip").split("/").pop());
    const gid = await id();
    await page.click(`[data-gfund="${gid}"]`);
    await page.fill("#fundAmt", "250");
    await page.click("#fundSave");
    await page.click(`[data-gwd="${gid}"]`);
    await page.fill("#fundAmt", "9999");                                 // more than saved → clamps to zero
    await page.click("#fundSave");
    expect((await store(page))[`users/u1/goals/${gid}`].saved).toBe(0);
    noErrors(errors);
  });

  test("imports a bank CSV with duplicates, transfers and bad rows flagged", async ({ page }) => {
    const errors = await openApp(page);
    const gasDay = new Date(new Date().getFullYear(), new Date().getMonth(), 4);   // matches seeded "Gas" expense
    const csv = ["Posting Date,Description,Amount",
      `${us(daysAgo(1))},STARBUCKS #1234 VIENNA VA,-6.45`,
      `${us(daysAgo(2))},PAYROLL ACME CORP DIRECT DEP,"2,500.00"`,
      `${us(daysAgo(3))},UBER *TRIP,(18.30)`,
      `${us(gasDay)},Gas,-60.00`,
      `${us(daysAgo(5))},ONLINE TRANSFER TO SAVINGS,-500.00`,
      `not a date,BROKEN,abc`].join("\n");
    const file = path.join(os.tmpdir(), `bank-${Date.now()}.csv`); fs.writeFileSync(file, csv);
    await page.click("#importBtn");
    await page.setInputFiles("#impFile", file);
    await expect(page.locator("#impSummary")).toContainText("3 selected");
    await expect(page.locator("#impSummary")).toContainText("1 already in Spendly");
    await expect(page.locator("#impSummary")).toContainText("1 card payments/transfers");
    await expect(page.locator("#impSummary")).toContainText("1 unreadable");
    await page.click("#impGo");
    const imported = Object.entries(await store(page)).filter(([k]) => k.includes("/imp_")).map(([, v]) => v);
    expect(imported.map(v => v.category).sort()).toEqual(["Food", "Salary", "Transport"]);
    expect(imported.find(v => v.category === "Salary")).toMatchObject({ amount:2500, type:"income" });
    // Re-importing the same file finds everything already there
    await page.click("#impDone"); await page.click("#importBtn"); await page.setInputFiles("#impFile", file);
    await expect(page.locator("#impSummary")).toContainText("0 selected");
    noErrors(errors);
  });

  test("imports an Excel statement with debit/credit columns", async ({ page }) => {
    const errors = await openApp(page);
    await page.click("#importBtn");
    await page.setInputFiles("#impFile", path.join(__dirname, "fixtures", "stmt.xlsx"));
    await expect(page.locator("#impAmtMode")).toHaveValue("split");
    const cats = await page.$$eval("#impTable tbody tr", trs => trs.map(tr => tr.querySelectorAll("td")[3].querySelector("select").value));
    expect(cats).toEqual(["Bills", "Investments", "Health"]);
    noErrors(errors);
  });

  test("exports CSV, Excel and PDF", async ({ page }) => {
    const errors = await openApp(page);
    for(const fmt of ["csv", "xlsx", "pdf"]){
      await page.click("#exportBtn");
      await page.selectOption("#exportRange", "all");
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`#exportMenu button[data-fmt="${fmt}"]`)]);
      expect(dl.suggestedFilename()).toMatch(new RegExp(`^spendly-expenses-\\d{4}-\\d{2}-\\d{2}\\.${fmt}$`));
      const file = await dl.path(); expect(fs.statSync(file).size).toBeGreaterThan(500);
      if(fmt === "csv") expect(fs.readFileSync(file, "utf8")).toContain("Date,Type,Description,Category,Payment,Note,Tags,Amount (USD)");
    }
    noErrors(errors);
  });

  test("backup and restore (merge and replace)", async ({ page }) => {
    const errors = await openApp(page);
    await page.click("#exportBtn");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#backupBtn")]);
    const file = await dl.path();
    const backup = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(backup.app).toBe("spendly");
    const count = () => page.evaluate(() => Object.keys(window.__store).filter(k => k.startsWith("users/u1/expenses/")).length);
    const before = await count();
    await page.evaluate(() => { delete window.__store["users/u1/expenses/e1"]; window.__store["users/u1/expenses/stray"] = { title:"Stray", amount:1, date:"2026-01-01", category:"Other", payment:"Card" }; window.__emit(); });
    await page.click("#importBtn"); await page.setInputFiles("#impFile", { name:"spendly-backup.json", mimeType:"application/json", buffer:fs.readFileSync(file) });
    await page.click("#rstGo");
    await expect(page.locator("#impDoneMsg")).toContainText("Restored");
    expect(await count()).toBe(before + 1);                               // merge keeps the stray
    await page.click("#impDone"); await page.click("#importBtn"); await page.setInputFiles("#impFile", { name:"spendly-backup.json", mimeType:"application/json", buffer:fs.readFileSync(file) });
    await page.check('input[name="rstMode"][value="replace"]');
    page.once("dialog", d => d.accept());
    await page.click("#rstGo");
    await expect(page.locator("#impDoneMsg")).toContainText("Restored");
    expect(await count()).toBe(before);                                   // replace removes it
    noErrors(errors);
  });

  test("bulk edit offers a smart rule that then applies while typing", async ({ page }) => {
    const errors = await openApp(page);
    await page.click("#selectBtn");
    await page.check('.pick[data-pick="u1x"]');
    await page.check('.pick[data-pick="u2x"]');
    await expect(page.locator("#bulkCount")).toHaveText("2 selected");
    await page.selectOption("#bulkCat", "Food");
    await expect(page.locator("#toast .t-act")).toContainText("uber eats");
    await page.click("#toast .t-act");
    expect((await store(page))["users/u1/settings/rules"].rules[0]).toMatchObject({ match:"uber eats", category:"Food" });
    await page.fill("#fTitle", "Uber Eats - pizza");
    await expect(page.locator("#ruleHint")).toContainText("Food");
    noErrors(errors);
  });

  test("calendar click filters transactions to that day", async ({ page }) => {
    const errors = await openApp(page);
    const day = page.locator("#cal .day .da").first();
    const k = await day.evaluate(el => el.parentElement.dataset.day);
    await day.click();
    await expect(page.locator("#dateRange")).toHaveValue("custom");
    await expect(page.locator("#listSummary")).toContainText("Clear filters");
    const dates = await page.evaluate(() => allRecords.filter(matchesFilter).map(e => e.date));
    expect(dates.length).toBeGreaterThan(0);
    expect(new Set(dates)).toEqual(new Set([k]));
    noErrors(errors);
  });

  test("upcoming bills and reminders notify once", async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(k => {
      window.__notes = [];
      window.Notification = class { constructor(t, o){ window.__notes.push(t); } static permission = "granted"; static requestPermission(){ return Promise.resolve("granted"); } };
      window.__store["users/u1/recurring/gym"] = { title:"Gym", amount:12, category:"Health", payment:"Card", frequency:"weekly", anchorDay:1, startDate:k, nextDate:k, active:true };
      window.__emit();
    }, key(daysAgo(-1)));
    await expect(page.locator(".up .ut").first()).toContainText("Gym");
    await page.click("#remindBtn");
    await page.check("#remindOn");
    await page.selectOption("#remindDays", "3");
    await page.click("#remindSave");
    await expect.poll(() => page.evaluate(() => window.__notes.length)).toBe(1);
    await page.evaluate(() => checkReminders());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__notes.length)).toBe(1);
    noErrors(errors);
  });

  test("tip banner: browse, hide for today, bring back", async ({ page }) => {
    const errors = await openApp(page);
    await expect(page.locator("#tipCount")).toContainText("1 of");
    await page.click("#tipNext");
    await expect(page.locator("#tipCount")).toContainText("2 of");
    await page.click("#tipClose");
    await expect(page.locator("#tipBanner")).toBeHidden();
    await expect(page.locator("#tipShow")).toBeVisible();
    await page.click("#tipShow");
    await expect(page.locator("#tipBanner")).toBeVisible();
    noErrors(errors);
  });

  test("help tips open on click and close with Escape @phone", async ({ page }) => {
    const errors = await openApp(page);
    const btn = page.locator('h2[data-help="budgets"] .help-btn');
    await btn.click();
    await expect(page.locator("#helpPop")).toBeVisible();
    await expect(page.locator("#helpPop b")).toHaveText("Monthly budgets");
    await page.keyboard.press("Escape");
    await expect(page.locator("#helpPop")).toBeHidden();
    noErrors(errors);
  });

  test("dark mode toggles and is remembered", async ({ page }) => {
    const errors = await openApp(page);
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const start = await theme();
    await page.click("#themeBtn");
    expect(await theme()).not.toBe(start);
    await page.reload();
    await expect(page.locator("#dbStatus")).toContainText("Synced");
    expect(await theme()).not.toBe(start);
    noErrors(errors);
  });
});
