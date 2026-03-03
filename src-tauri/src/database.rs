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
    ]
}