import Database from 'better-sqlite3'

let db = null

export function getTestDb() {
  if (!db) {
    db = new Database(':memory:') // in-memory — fresh every test run
    setupTables(db)
  }
  return db
}

export function resetTestDb() {
  if (db) {
    db.close()
    db = null
  }
}

function setupTables(db) {
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS customers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      phone       TEXT,
      email       TEXT,
      address     TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

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

    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      category    TEXT NOT NULL,
      amount      REAL NOT NULL DEFAULT 0,
      date        TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      description    TEXT NOT NULL,
      type           TEXT NOT NULL,
      category       TEXT NOT NULL,
      amount         REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'Cash',
      reference_id   INTEGER,
      date           TEXT NOT NULL,
      created_at     TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL,
  product_name  TEXT NOT NULL,
  type          TEXT NOT NULL,
  quantity      INTEGER NOT NULL,
  unit_cost     REAL DEFAULT 0,
  total_cost    REAL DEFAULT 0,
  supplier_id   INTEGER,
  supplier_name TEXT,
  note          TEXT,
  date          TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);
  `)
}