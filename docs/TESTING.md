# Testing Rica BizTrack

## Automatic tests

| Command | What it tests | Time |
|---|---|---|
| `npm run test:run` | Calculations, every service against a real SQLite database, every screen (clicking and typing like a user), random trading days | ~45 s |
| `npm run test:e2e` | The built app in a real browser (Chromium), with the desktop backend simulated | ~2 min |
| `cd src-tauri && cargo test --lib` | Rust: transactions, backups, restore, migrations | ~1 s (after building) |
| `npm run test:coverage` | Same as `test:run`, plus a coverage report in `coverage/index.html` | ~50 s |
| `npm run test:all` | Lint + `test:run` + `test:e2e` | ~3 min |

The first time you run `test:e2e` on a computer, install the browser once:
`npx playwright install chromium`.

GitHub Actions runs all of them on every push (`.github/workflows/ci.yml`).
If an end-to-end test fails there, download **playwright-report** from the run page:
it has a screenshot and a step-by-step trace of the failure
(`npx playwright show-trace trace.zip`).

### Where the tests are

| Folder | Kind |
|---|---|
| `src/tests/unit/` | Pure logic: money, VAT, dates, i18n (every text translated), desktop helpers (backup, update, print, Excel) with Tauri mocked |
| `src/tests/integration/` | Services against an in-memory SQLite database built from the **real migrations** |
| `src/tests/integration/trading-day.test.js` | 31 random trading days (sales, credit, voids, restocks, repayments, expenses). After every step, stock, cash, debts and profit must match an independent model. A failure prints the seed and the last steps, so it can be replayed |
| `src/tests/ui/` | Every screen rendered with React Testing Library on the real database: setup, sign-in, roles, POS, history, customers, products, expenses, settings, auto-lock, error screen |
| `e2e/` | Playwright: complete user journeys in Chromium. `e2e/mock-tauri.js` replaces the desktop backend with sql.js and supports failure injection (`window.__failNext`) |
| `src-tauri/src/commands.rs` (bottom) | Rust tests: all-or-nothing transactions, param types, two tills selling at once, backups, restore, old-database upgrade |

### Adding a test when you fix a bug

1. Write a test that fails because of the bug (usually in `src/tests/integration/`).
2. Fix the bug; the test now passes.
3. It stays forever, so the bug can never come back silently.

---

## Manual checklist (before each release)

Some things can only be checked on a real Windows PC with real hardware.
Use a **test computer or a fresh Windows user**, not a shop's live data.
Tick each line; note the Windows version and the printer model.

### Installer
- [ ] Download the installer from the GitHub release; it runs **without admin rights**.
- [ ] SmartScreen warning: *More info → Run anyway* works.
- [ ] The app opens after installing; Start menu and desktop shortcuts work.
- [ ] Offline installer (`tauri.offline.conf.json`) works on a PC **without internet**.
- [ ] Uninstall, then reinstall: the data is **still there** (the database is not deleted).

### First start and daily use
- [ ] Setup wizard in **Kinyarwanda** and **French**: all texts translated, nothing cut off.
- [ ] Write down the recovery code; reset the owner PIN with it.
- [ ] Screen 1366×768 (common laptops) and 1920×1080: nothing hidden, no horizontal scroll.
- [ ] Windows display scaling 125% and 150%.
- [ ] Close the app during a sale and reopen: no half-saved sale.

### Barcode scanner (USB)
- [ ] Scan a product at the till: it is added once (not twice), quantity goes up on the second scan.
- [ ] Scan an unknown code: clear message, nothing added.
- [ ] Scan while the cursor is in another field (e.g. Cash received): check what happens.
- [ ] Scan into the *Barcode* field when adding a product.

### Receipt printer (58 mm and 80 mm)
- [ ] First print asks for the printer; choose the receipt printer; next prints go there.
- [ ] Receipt fits the paper width (Settings → Receipts → paper width), no text cut off.
- [ ] Shop name, TIN, phone, receipt number, cashier name, VAT lines (VAT shops) are correct.
- [ ] Long product names wrap; RWF amounts are aligned.
- [ ] Reprint from Sales History.
- [ ] Printer off / no paper: the app shows a message and does not freeze.

### Backups and restore
- [ ] Next day, a new automatic backup appears in *Documents\Rica BizTrack Backups*.
- [ ] Change the backup folder to a **USB drive**, then remove the USB: the app keeps working and warns.
- [ ] Backup to a **OneDrive** folder.
- [ ] Restore a backup: the app restarts with the old data; a `pre-restore-…` safety copy exists.
- [ ] Try to restore a random file (e.g. a photo): refused with a clear message.

### Updates
- [ ] Install version N, publish version N+1 (draft → published): the owner sees *"Version … is available"*.
- [ ] *Install update*: the app closes, updates and reopens; data and settings are kept.
- [ ] Cashiers do not see the update banner.
- [ ] Offline: no error message about updates.

### Accounting check with a real shop (one week)
- [ ] Count the cash box at the end of each day; compare with **Transactions** (Cash).
- [ ] Compare MoMo statement with **Transactions** (Mobile Money).
- [ ] Count stock for 10 products; compare with **Products**.
- [ ] Ask the accountant to check the **Profit & Loss** and the Excel exports.
- [ ] A native speaker reviews the Kinyarwanda texts (`src/i18n/rw.js`).

### Performance
- [ ] With about 20,000 sales (one busy year), the till, Sales History and P&L open in under 2 seconds on a low-end PC (4 GB RAM).
