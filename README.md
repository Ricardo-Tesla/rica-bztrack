# Rica BizTrack

> Offline point-of-sale and business management for small shops in Rwanda —
> built with Tauri, React and SQLite. English · Kinyarwanda · Français.

---

## What is Rica BizTrack?

Rica BizTrack is a Windows desktop app that lets a small business sell, track
stock, follow customer debts (ideni), record expenses and see its real profit —
**without internet and without a monthly subscription**.

All data stays on the shop's computer, is backed up automatically every day,
and the app updates itself when it is online.

**Guides:**
- 🧑‍💼 [Shop owner's guide](docs/SHOP-GUIDE.md) — installing, first setup, daily use
- 🚀 [Releasing a new version](RELEASING.md) — for the developer

---

## Features

### 🛒 Point of Sale
- Search, click, or **scan a barcode** (USB scanners work out of the box)
- Sell **kg / litre / metre products in parts** (e.g. 1.5 kg of rice)
- Payment by **Cash, Mobile Money, Card, Bank Transfer — or Credit (ideni)**
- **Cash received → change** calculated for the cashier
- MoMo / card **transaction reference** saved with the sale
- **Discounts** in RWF or %
- **VAT 18%** (optional) — prices include VAT, VAT shown on receipts and reports
- Stock is checked when the sale is saved — **overselling is impossible**
- **Real receipt printing** on 58 mm or 80 mm receipt printers, with the shop's
  name, address, phone and TIN

### 👥 Customers and debts (ideni)
- Credit sales with an optional part paid now
- What every customer owes, at a glance; **record repayments**; customer statement
- Repayments recorded by mistake can be cancelled by the owner

### 💳 Sales History
- Filter by period, search by receipt, customer, MoMo reference or cashier
- Reprint receipts, record the official **EBM receipt number**
- **Void a sale** with a reason — stock goes back, refund is logged, who voided it is recorded

### 📦 Products, stock and suppliers
- Barcodes, categories, units, VAT-exempt products
- **Restock** with weighted-average cost; stock history shows every restock,
  correction, return — and who did it
- Low-stock alerts; stock value; Excel export

### 💸 Expenses and 🔄 Transactions
- Expenses by category, edit and delete; cash ledger with totals per payment method
  (how much should be in the cash box / on MoMo)

### 📈 Profit & Loss and 📊 Dashboard
- **Any period**: today, this week, this month, last month, this year, custom
- Sales → VAT → net sales → cost of goods sold → gross profit → expenses → net profit
- Monthly chart, top products, **Excel export for the accountant**

### 🔐 Users and security
- **Owner and cashier accounts with a PIN**; cashiers can sell but cannot see
  profits, change products, void sales or change settings
- Auto-lock after inactivity; 5 wrong PINs lock the account for 30 seconds
- Owner **recovery code** if the PIN is forgotten

### 💾 Never lose data
- **Automatic daily backup** (keeps the last 30 days) — to any folder, e.g. a USB drive
- One-click restore, with a safety copy of the current data first
- Every sale, restock and payment is saved all-or-nothing

### 🌍 Three languages, auto-updates
- English, Kinyarwanda and French — switch any time in Settings
- The app checks for new versions when online and installs them in one click

> **Tax note:** receipts from this app are **not EBM invoices**. VAT-registered
> businesses must still issue official invoices through RRA's EBM system.

---

## Business logic

### Weighted average cost
Restocking at a new price recalculates the average buy price of all units:
`(old stock × old cost + new qty × new cost) ÷ total units`.

### Stock purchases and profit
Stock you buy is inventory, not an expense. A restock is logged in Transactions as
money out; its cost is counted in Profit & Loss (as cost of goods sold) **when the
items are sold** — never twice.

### Credit sales
Revenue counts on the day of the sale. Only money actually received goes into the
cash ledger (the part paid at the till, then each repayment).

### Profit & Loss
```
Sales (incl. VAT)    = completed sales in the period
− VAT collected      = VAT included in those sales (owed to RRA)
= Net sales
− Cost of goods sold = buy price × quantity of the items sold
= Gross profit
− Operating expenses = Expenses page
± Other income / expenses typed by hand on the Transactions page
= Net profit
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 + Vite, Tailwind CSS 3 |
| Desktop shell | Tauri 2 (Rust) |
| Database | SQLite (tauri-plugin-sql), versioned migrations in `src-tauri/src/database.rs` |
| All-or-nothing saves, backups | Rust commands in `src-tauri/src/commands.rs` |
| Updates | tauri-plugin-updater + GitHub Releases |
| Excel export | Built-in .xlsx writer (`src/utils/excel.js`) |
| Tests | Vitest + better-sqlite3 (real migrations), Rust unit tests |

---

## Development

### Prerequisites
- Node.js 20+ · Rust (stable) · Microsoft C++ Build Tools (Windows)

### Run

```bash
npm install
npm run tauri dev          # starts Vite and the app together
```

### Test

```bash
npm run test:run           # 160+ JavaScript tests (services, migrations, receipts, translations)
npm run lint
cd src-tauri && cargo test --lib   # Rust: transactions, backups, restore checks
```

The translation test fails if any text is missing in Kinyarwanda or French —
add new texts to `src/i18n/rw.js` and `src/i18n/fr.js`.

### Build an installer

```bash
npm run tauri build                                              # normal installer (small)
npm run tauri build -- --config src-tauri/tauri.offline.conf.json # offline installer (includes WebView2, ~130 MB)
```

The installer is created in `src-tauri/target/release/bundle/nsis/`.
For releases with auto-update, see [RELEASING.md](RELEASING.md).

### Project structure

```
src/
  pages/        one file per screen (POS, Sales, Products, Settings, ...)
  services/     all database work (sales, products, customers, P&L, auth, ...)
  components/   sidebar, shared UI, settings sections, date picker
  context/      signed-in user, settings, language
  i18n/         en (keys) · rw · fr
  utils/        money/date formatting, receipts, Excel, permissions
  tests/        unit + integration tests (use the real migrations)
src-tauri/
  src/database.rs   database migrations (never edit an existing one — add a new version)
  src/commands.rs   transactions, backups, restore
  tauri.conf.json   app, security policy, updater, installer
```

---

## Database

- Location (Windows): `%APPDATA%\com.ricabiztrack.app\rica_biztrack.db`
- Automatic backups: `Documents\Rica BizTrack Backups` (or the folder chosen in Settings)
- Safety copies made before a restore: `%APPDATA%\com.ricabiztrack.app\backups\`
- Log file (for support): `%LOCALAPPDATA%\com.ricabiztrack.app\logs\`

---

## License

MIT License — free to use, modify and distribute.

## Author

**Ricardo Tesla**
