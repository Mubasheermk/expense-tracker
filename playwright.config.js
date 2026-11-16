// Browser tests for Spendly. The app is opened straight from disk (file://) with a mock Firebase,
// so no server, accounts or real data are involved.
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ }
  ]
});
