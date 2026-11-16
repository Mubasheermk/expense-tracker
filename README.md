# Spendly · Expense Tracker

A colorful personal expense tracker: budgets, recurring bills, income, savings goals, insights, money flow, calendar, statement import, reports, backups and daily saving tips. Plain HTML/CSS/JavaScript, Firebase (Auth + Firestore, compat SDK) and App Check. It's hosted on GitHub Pages and installable as an app (PWA).

**Live:** https://mubasheermk.github.io/expense-tracker/

## Project layout

```
index.html            Page markup; loads the CSS and scripts below
css/styles.css        All styles (light theme variables, dark theme overrides, components)
js/                   App code as classic scripts that share one global scope.
                      Load order matters and is set at the bottom of index.html:
  core.js             Firebase setup, configuration, shared state, date and text helpers
  ui.js               Basic UI wiring, Google sign-in, live Firestore sync
  recurring.js        Recurring expenses and income
  import.js           CSV / Excel statement import
  goals.js            Savings goals
  tips.js             Tip of the day banner
  bills.js            Upcoming bills and device reminders
  rules.js            Smart category rules and bulk select
  backup.js           Full backup and restore
  categories.js       Custom categories and budgets
  form.js             Add / edit / delete transactions
  render.js           Money flow, calendar, cash flow, insights, stats, charts, list
  export.js           Excel / CSV / PDF export
  review.js           Year in review and its shareable image
  main.js             Period controls, help tips, dark mode, PWA setup (loaded last)
sw.js                 Service worker (offline cache, reminder clicks). Bump CACHE when changing files
manifest.webmanifest  Install metadata; icons/ holds the app icons
firestore.rules       Copy of the security rules published in Firebase (the console is the source of truth)
tests/                Automated browser tests (Playwright) with a mock Firebase
```

**Adding code:** put it in the file for that feature. Functions can call anything defined in any file once the page has loaded. Only code that runs immediately at load time must use things from the same or an earlier file. Shared helpers belong in `core.js`.

## Data model (Firestore, per user)

| Path | Contents |
|---|---|
| `users/{uid}/expenses/{id}` | Transactions: `title, amount, date (YYYY-MM-DD), category, payment`, optional `type: "income"`, `note`, `tags[]`, `recurringId`. IDs `rec_{rule}_{date}` (recurring) and `imp_{hash}` (import) are deterministic to prevent duplicates |
| `users/{uid}/recurring/{id}` | Repeat rules: `frequency, anchorDay, startDate, nextDate, active` + expense fields |
| `users/{uid}/goals/{id}` | Savings goals: `name, icon, color, target, saved, deadline?, startDate` |
| `users/{uid}/settings/budgets` | `{ limits: { "_total": n, "<Category>": n } }` |
| `users/{uid}/settings/categories` | `{ custom: [{ name, icon, color }] }` |
| `users/{uid}/settings/rules` | `{ rules: [{ match, category, type }] }` |

## Tests

Every pull request runs the browser tests in GitHub Actions (**Actions → Tests**). To run them locally:

```bash
npm ci
npx playwright install chromium
npm test
```

The tests use a mock Firebase (`tests/mock-firebase.js`), so they never touch real data.

## Workflow

One branch and pull request per change, squash-merged into `main` (GitHub Pages deploys `main`). Tag stable versions under **Releases**.
