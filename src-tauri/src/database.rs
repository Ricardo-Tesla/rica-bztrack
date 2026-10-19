use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_suppliers_table",
            sql: "
                CREATE TABLE IF NOT EXISTS suppliers (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    name        TEXT NOT NULL,
                    contact     TEXT,
                    phone       TEXT,
                    email       TEXT,
                    address     TEXT,
                    notes       TEXT,
                    created_at  TEXT DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_products_table",
            sql: "
                CREATE TABLE IF NOT EXISTS products (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    name             TEXT NOT NULL,
                    sku              TEXT UNIQUE NOT NULL,
                    category         TEXT,
                    unit             TEXT,
                    buy_price        REAL NOT NULL DEFAULT 0,
                    sell_price       REAL NOT NULL DEFAULT 0,
                    stock            INTEGER NOT NULL DEFAULT 0,
                    low_stock_alert  INTEGER NOT NULL DEFAULT 5,
                    supplier_id      INTEGER,
                    created_at       TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_customers_table",
            sql: "
                CREATE TABLE IF NOT EXISTS customers (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    name        TEXT NOT NULL,
                    phone       TEXT,
                    email       TEXT,
                    address     TEXT,
                    created_at  TEXT DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_sales_table",
            sql: "
                CREATE TABLE IF NOT EXISTS sales (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    receipt_number  TEXT UNIQUE NOT NULL,
                    customer_id     INTEGER,
                    customer_name   TEXT,
                    subtotal        REAL NOT NULL DEFAULT 0,
                    tax             REAL NOT NULL DEFAULT 0,
                    discount        REAL NOT NULL DEFAULT 0,
                    total           REAL NOT NULL DEFAULT 0,
                    payment_method  TEXT DEFAULT 'Cash',
                    status          TEXT DEFAULT 'completed',
                    created_at      TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (customer_id) REFERENCES customers(id)
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_sale_items_table",
            sql: "
                CREATE TABLE IF NOT EXISTS sale_items (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    sale_id      INTEGER NOT NULL,
                    product_id   INTEGER NOT NULL,
                    product_name TEXT NOT NULL,
                    quantity     INTEGER NOT NULL DEFAULT 1,
                    unit_price   REAL NOT NULL DEFAULT 0,
                    buy_price    REAL NOT NULL DEFAULT 0,
                    subtotal     REAL NOT NULL DEFAULT 0,
                    FOREIGN KEY (sale_id) REFERENCES sales(id),
                    FOREIGN KEY (product_id) REFERENCES products(id)
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_expenses_table",
            sql: "
                CREATE TABLE IF NOT EXISTS expenses (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT NOT NULL,
                    category    TEXT NOT NULL,
                    amount      REAL NOT NULL DEFAULT 0,
                    date        TEXT NOT NULL,
                    created_at  TEXT DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_transactions_table",
            sql: "
                CREATE TABLE IF NOT EXISTS transactions (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    description  TEXT NOT NULL,
                    type         TEXT NOT NULL,
                    category     TEXT NOT NULL,
                    amount       REAL NOT NULL DEFAULT 0,
                    payment_method TEXT DEFAULT 'Cash',
                    reference_id INTEGER,
                    date         TEXT NOT NULL,
                    created_at   TEXT DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_stock_movements_table",
            sql: "
                CREATE TABLE IF NOT EXISTS stock_movements (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id   INTEGER NOT NULL,
                    product_name TEXT NOT NULL,
                    type         TEXT NOT NULL,
                    quantity     INTEGER NOT NULL,
                    unit_cost    REAL DEFAULT 0,
                    total_cost   REAL DEFAULT 0,
                    supplier_id  INTEGER,
                    supplier_name TEXT,
                    note         TEXT,
                    date         TEXT NOT NULL,
                    created_at   TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                );
                ",
                kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "restock_cost_as_cogs_and_reference_type",
            // 1. Transactions get a reference_type ('sale', 'expense', 'restock')
            //    so ids from different tables can no longer be confused.
            // 2. Stock bought on restock is inventory, not an expense: its cost is
            //    counted as COGS when the items are sold. Older versions also saved
            //    every restock as an expense, which counted the cost twice in P&L.
            //    Those auto-created "Restock — ..." expenses are removed here; the
            //    matching cash-out entries stay in the transactions ledger.
            sql: "
                ALTER TABLE transactions ADD COLUMN reference_type TEXT;

                UPDATE transactions SET reference_type = 'sale'
                WHERE reference_id IS NOT NULL AND type = 'income' AND category = 'Sales';

                UPDATE transactions SET reference_type = 'restock', reference_id = NULL
                WHERE reference_id IS NOT NULL
                  AND type = 'expense'
                  AND category = 'Stock Purchase'
                  AND reference_id IN (
                      SELECT id FROM expenses
                      WHERE category = 'Stock Purchase' AND description LIKE 'Restock — %'
                  );

                UPDATE transactions SET reference_type = 'expense'
                WHERE reference_id IS NOT NULL AND type = 'expense' AND reference_type IS NULL;

                DELETE FROM expenses
                WHERE category = 'Stock Purchase' AND description LIKE 'Restock — %';

                CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
                CREATE INDEX IF NOT EXISTS idx_transactions_reference
                    ON transactions(reference_type, reference_id);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "archive_instead_of_delete",
            // Products, customers and suppliers that have history (sales, stock
            // movements, linked products) are archived (hidden) instead of
            // deleted, so old sales and reports stay complete.
            sql: "
                ALTER TABLE products  ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE customers ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE suppliers ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
            ",
            kind: MigrationKind::Up,
        },
    ]
}