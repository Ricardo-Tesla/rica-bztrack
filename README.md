# Rica BizTrack

> A complete offline desktop business management app for small businesses —
> built with Tauri, React, and SQLite.

---

## What is Rica BizTrack?

Rica BizTrack is a desktop business management app designed for small businesses
that need a reliable, fast, and offline tool to run their daily operations.

Most business software is either too expensive, requires a monthly subscription,
or depends on a stable internet connection. Rica BizTrack solves all three problems —
it is free to install, works completely offline, and fits in a 6MB installer.

From managing your product inventory and recording daily sales to tracking expenses
and generating profit and loss reports, Rica BizTrack gives small business owners
a complete financial picture of their business — without needing an accountant.

---

## Who is it for?

Rica BizTrack is built for small business owners who:

- Run a shop, store, or retail business
- Want to track what they sell and how much they earn
- Need to manage suppliers, customers, and inventory
- Want to know if their business is profitable
- Work in areas with unreliable internet connectivity

---

## Features

### 📊 Dashboard
- Live overview of today's revenue and sales count
- Month-to-date profit after expenses
- All-time revenue, net profit, and total expenses
- Low stock and out of stock alerts
- Recent sales and transaction feed

### 🛒 Point of Sale
- Product search and grid view
- Add to cart with quantity controls
- Select customer or sell to walk-in
- Choose payment method — Cash, Card, Mobile Money, Bank Transfer
- Complete sale with one click
- Auto-generated receipt with unique receipt number
- Stock deducted automatically on every sale
- Income transaction recorded automatically

### 💳 Sales History
- Full list of all completed sales
- Search by receipt number, customer, or payment method
- View sale details including itemized breakdown
- Print receipt as thermal-format .txt file
- Void a sale — items go back into stock and the refund is recorded

### 📦 Products
- Add, edit, and delete products
- SKU / product code management
- Buy price, sell price, and profit margin display
- Stock tracking with low stock alerts
- **Weighted average cost** — buy price recalculates automatically on restock
- Restock from supplier with full cost tracking
- Stock movement history per product

### 🏭 Suppliers
- Add and manage suppliers
- Store contact, phone, email, and address
- Link suppliers to products and restocks

### 👥 Customers
- Add and manage customers
- View total orders and total spent per customer
- Last visit date tracking

### 🔄 Transactions
- Complete financial ledger — all money in and out
- Auto-created from every sale and expense
- Manual transaction entry
- Filter by income or expense
- Net balance calculation

### 💸 Expenses
- Record business expenses by category
- Categories: Rent, Salary, Utilities, Marketing, Transport,
  Maintenance, Other (stock purchases are recorded with Restock, not as expenses)
- Monthly expense breakdown
- Edit or delete expenses (the matching transaction is updated too)
- Auto-creates transaction record on every expense

### 📈 Profit & Loss
- Full income statement — Revenue, COGS, Gross Profit, Net Profit
- Expense breakdown by category with progress bars
- Monthly revenue vs expenses bar chart
- Top 5 selling products by revenue with margin rating

### 🖨️ Receipt Printing
- Thermal receipt format — works with standard POS printers
- Grows automatically with number of items
- Includes receipt number, customer, payment method, itemized list, and total
- Save as .txt file from POS modal or Sales History

### 💾 Data Backup
- One click backup from the sidebar
- Saves a complete, consistent copy of the database (safe while the app is running)
- Choose where to save the backup file
- One click restore from the sidebar — the backup is checked first and a safety
  copy of your current data is saved before anything is replaced

---

## How is it different from other apps?

| Feature | Rica BizTrack | Cloud Apps | Excel |
|---------|--------------|------------|-------|
| Works offline | ✅ | ❌ | ✅ |
| No subscription | ✅ | ❌ | ✅ |
| Real-time stock tracking | ✅ | ✅ | ❌ |
| Auto P&L reports | ✅ | ✅ | ❌ |
| Receipt printing | ✅ | ✅ | ❌ |
| Installer size | ~6MB | N/A | ~300MB |
| Internet required | ❌ | ✅ | ❌ |
| Free forever | ✅ | ❌ | ❌ |

---

## Business Logic

### Weighted Average Cost
Every time you restock a product at a different price, Rica BizTrack
automatically recalculates the average buy price across all units:

```
Example:
  10 units bought at $6.00  =  $60.00
  20 units bought at $7.00  =  $140.00
  Total: 30 units           =  $200.00
  New average buy price     =  $6.67
```

This keeps your profit margins and P&L reports accurate over time.

### Auto Transaction Logging
Every financial event creates a transaction automatically:
- Complete a sale → income transaction created
- Add an expense → expense transaction created
- Restock a product → stock purchase transaction (money out) created

Each of these is saved all-or-nothing: if anything fails part-way, nothing is
saved, so stock, sales and the ledger always stay in step. A sale is refused if
there is not enough stock.

### Stock Purchases and Profit
Stock you buy is inventory, not an expense. When you restock, the payment is
logged in Transactions as money out, and the cost goes into the product's
average buy price. In Profit & Loss that cost is counted as COGS when the items
are sold — so it is never counted twice.

### P&L Calculation
```
Total Revenue      =  sum of all completed sales
Total COGS         =  sum of (buy price × quantity) for all sold items
Gross Profit       =  Total Revenue - Total COGS
Operating Expenses =  sum of all recorded expenses
Net Profit         =  Gross Profit - Operating Expenses
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 + Vite |
| Styling | Tailwind CSS v3 |
| Desktop Shell | Tauri 2 (Rust) |
| Database | SQLite via tauri-plugin-sql |
| State Management | React useState / useEffect |
| File System | tauri-plugin-fs |
| Dialogs | tauri-plugin-dialog |
| Testing | Vitest + better-sqlite3 |

### Why Tauri over Electron?

| | Tauri | Electron |
|--|-------|---------|
| Installer size | ~6MB | ~150MB |
| Memory usage | ~50MB | ~200MB |
| Language | Rust | Node.js |
| Security | Higher | Standard |

---

## Testing

Rica BizTrack has 86 automated tests covering all critical business logic.

```bash
npm run test        # watch mode
npm run test:run    # single run
npm run test:ui     # visual browser UI
```

### Test Coverage

| Suite | Tests | What it covers |
|-------|-------|----------------|
| Unit | 48 | Margin, markup, cart total, profit, formatting, validation |
| Integration | 28 | Suppliers, products, customers, sales, expenses |
| Restock | 10 | Weighted average cost, stock movements, cash-out logging |
| **Total** | **86** | **All passing** |

---

## Installation

### Download (Windows)
1. Go to [Releases](https://github.com/Ricardo-Tesla/rica-bztrack/releases)
2. Download `rica-biztrack_1.0.0_x64-setup.exe`
3. Double click and follow the installer
4. Launch Rica BizTrack from your desktop or Start Menu

### System Requirements
```
OS:       Windows 10 or later (64-bit)
RAM:      2GB minimum, 4GB recommended
Storage:  100MB free space
Internet: Not required
```

---

## Development Setup

### Prerequisites
```
Node.js    18+
Rust       latest stable
Cargo      comes with Rust
Microsoft C++ Build Tools (Windows)
WebView2   pre-installed on Windows 11
```

### Install and Run

```bash
# Clone the repository
git clone https://github.com/Ricardo-Tesla/rica-bztrack.git
cd rica-bztrack

# Install JavaScript dependencies
npm install

# Terminal 1 — start Vite dev server
npm run dev

# Terminal 2 — start Tauri
cargo tauri dev
```

First run takes several minutes as Rust compiles dependencies.
Subsequent runs are fast.

### Build Installer

```bash
# Build the frontend
npm run build

# Build the installer
cd src-tauri
cargo tauri build
```

Output:
```
src-tauri/target/release/bundle/nsis/rica-biztrack_1.0.0_x64-setup.exe
```

---

## Database

Rica BizTrack uses SQLite — a single file database that requires no server.

### Location
```
Production:  C:\Users\[name]\AppData\Roaming\com.ricabiztrack.app\rica_biztrack.db
Development: C:\Users\[name]\.cargo\...
```

### Tables
```
suppliers        →  vendor information
products         →  inventory catalog
customers        →  customer profiles
sales            →  sale headers
sale_items       →  individual items per sale
expenses         →  business expenses
transactions     →  complete financial ledger
stock_movements  →  restock history per product
```

### Backup and Restore

**Backup:**
Click **💾 Backup Data** in the sidebar — choose where to save.

**Restore:**
Click **♻️ Restore Backup** in the sidebar and choose a backup file.
The file is checked, a safety copy of your current data is saved to
`AppData\Roaming\com.ricabiztrack.app\backups\pre-restore-<time>.db`,
and the app restarts with the restored data.

---

## Roadmap

```
v1.1.0  →  Direct thermal printer integration
v1.2.0  →  Tax / VAT configuration
v1.3.0  →  Multi-currency support
v1.4.0  →  Monthly PDF reports
v2.0.0  →  Multi-user accounts
v2.1.0  →  Mobile companion app
```

---

## Contributing

Contributions are welcome. Please open an issue first to discuss
what you would like to change.

```bash
# Fork the repository
# Create your feature branch
git checkout -b feature/your-feature

# Commit your changes
git commit -m "Add your feature"

# Push and open a pull request
git push origin feature/your-feature
```

Please make sure all tests pass before submitting:

```bash
npm run test:run
```

---

## License

MIT © 2025 Ricardo Tesla

---

## Author

**Ricardo Tesla**
- GitHub: [@Ricardo-Tesla](https://github.com/Ricardo-Tesla)

---

*Built with ❤️ for small businesses in Rwanda 🇷🇼*
