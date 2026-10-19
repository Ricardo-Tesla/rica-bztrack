// Tests for the REAL service code (sales, restock, expenses) and the REAL
// database migrations from src-tauri/src/database.rs.
//
// `runInTestDb` behaves like the Rust `db_transaction` command: all statements
// run in one transaction, `{ $ref: n }` params become statement n's new row id,
// and `expectChanges` cancels everything when not met.
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { completeSale, buildSaleStatements } from '../../services/salesService'
import { buildRestockStatements } from '../../services/restockService'
import { buildAddExpenseStatements, buildDeleteExpenseStatements } from '../../services/expenseService'

// Tests run from the project root
const migrationsFile = resolve(process.cwd(), 'src-tauri/src/database.rs')
const MIGRATIONS = [...readFileSync(migrationsFile, 'utf8').matchAll(/sql:\s*"([\s\S]*?)",\s*kind:/g)]
  .map(m => m[1])

function createDb(upToVersion = MIGRATIONS.length) {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  MIGRATIONS.slice(0, upToVersion).forEach(sql => db.exec(sql))
  return db
}

function runInTestDb(db) {
  return async (statements) => {
    const tx = db.transaction(() => {
      const results = []
      for (const s of statements) {
        const params = (s.params || []).map(p =>
          p && typeof p === 'object' && '$ref' in p ? results[p.$ref].lastInsertId : p
        )
        const r = db.prepare(s.sql).run(...params)
        if (s.expectChanges !== undefined && r.changes !== s.expectChanges) {
          throw s.errorMessage || 'Operation cancelled'
        }
        results.push({ rowsAffected: r.changes, lastInsertId: Number(r.lastInsertRowid) })
      }
      return results
    })
    return tx()
  }
}

function addProduct(db, { name, stock, buy = 6, sell = 10 }) {
  return Number(db.prepare(
    `INSERT INTO products (name, sku, buy_price, sell_price, stock) VALUES (?, ?, ?, ?, ?)`
  ).run(name, name.toUpperCase(), buy, sell, stock).lastInsertRowid)
}

const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
const product = (db, id) => db.prepare('SELECT * FROM products WHERE id = ?').get(id)

describe('Migrations', () => {
  it('all migrations run on an empty database', () => {
    const db = createDb()
    const cols = db.prepare('PRAGMA table_info(transactions)').all().map(c => c.name)
    expect(cols).toContain('reference_type')
  })

  it('migration 9 removes old auto-created restock expenses but keeps the cash-out entries', () => {
    const db = createDb(8)
    // Old data: a sale, a real expense, and a restock that was saved as an expense
    db.exec(`
      INSERT INTO sales (receipt_number, total) VALUES ('RCT-1', 50);
      INSERT INTO transactions (description, type, category, amount, reference_id, date)
        VALUES ('Sale #RCT-1', 'income', 'Sales', 50, 1, '2026-01-01');
      INSERT INTO expenses (description, category, amount, date) VALUES ('Rent', 'Rent', 100, '2026-01-01');
      INSERT INTO transactions (description, type, category, amount, reference_id, date)
        VALUES ('Rent', 'expense', 'Rent', 100, 1, '2026-01-01');
      INSERT INTO expenses (description, category, amount, date)
        VALUES ('Restock — Rice (10 units @ $6)', 'Stock Purchase', 60, '2026-01-02');
      INSERT INTO transactions (description, type, category, amount, reference_id, date)
        VALUES ('Restock — Rice (10 units @ $6)', 'expense', 'Stock Purchase', 60, 2, '2026-01-02');
      INSERT INTO expenses (description, category, amount, date)
        VALUES ('Bags bought by hand', 'Stock Purchase', 5, '2026-01-03');
    `)

    db.exec(MIGRATIONS[8])

    const expenses = db.prepare('SELECT description FROM expenses ORDER BY id').all().map(e => e.description)
    expect(expenses).toEqual(['Rent', 'Bags bought by hand']) // manual entries are kept

    const txns = db.prepare('SELECT category, reference_id, reference_type FROM transactions ORDER BY id').all()
    expect(txns).toEqual([
      { category: 'Sales', reference_id: 1, reference_type: 'sale' },
      { category: 'Rent', reference_id: 1, reference_type: 'expense' },
      { category: 'Stock Purchase', reference_id: null, reference_type: 'restock' },
    ])
  })
})

describe('Sales (real salesService)', () => {
  let db, run
  beforeEach(() => { db = createDb(); run = runInTestDb(db) })

  it('saves sale, items, stock and income together', async () => {
    const id = addProduct(db, { name: 'Rice', stock: 10, buy: 6, sell: 10 })
    const cart = [{ id, name: 'Rice', sell_price: 10, buy_price: 6, quantity: 3, stock: 10 }]

    const result = await completeSale(cart, null, 'Cash', run)

    expect(result.total).toBe(30)
    expect(result.receiptNumber).toMatch(/^RCT-\d{8}-[A-Z0-9]{6}$/)
    expect(product(db, id).stock).toBe(7)
    const item = db.prepare('SELECT * FROM sale_items').get()
    expect(item.sale_id).toBe(result.saleId)
    const txn = db.prepare('SELECT * FROM transactions').get()
    expect(txn).toMatchObject({ type: 'income', amount: 30, reference_id: result.saleId, reference_type: 'sale' })
  })

  it('uses the current buy price from the database for COGS', async () => {
    const id = addProduct(db, { name: 'Rice', stock: 10, buy: 7.5 })
    const cart = [{ id, name: 'Rice', sell_price: 10, buy_price: 6 /* stale */, quantity: 1 }]
    await completeSale(cart, null, 'Cash', run)
    expect(db.prepare('SELECT buy_price FROM sale_items').get().buy_price).toBe(7.5)
  })

  it('refuses to oversell and saves NOTHING (even items that had enough stock)', async () => {
    const a = addProduct(db, { name: 'Rice', stock: 10 })
    const b = addProduct(db, { name: 'Oil', stock: 1 })
    const cart = [
      { id: a, name: 'Rice', sell_price: 10, quantity: 2 },
      { id: b, name: 'Oil', sell_price: 10, quantity: 5 }, // only 1 in stock
    ]

    await expect(completeSale(cart, null, 'Cash', run)).rejects.toMatch('Not enough stock for "Oil"')

    expect(product(db, a).stock).toBe(10)
    expect(product(db, b).stock).toBe(1)
    expect(count(db, 'sales')).toBe(0)
    expect(count(db, 'sale_items')).toBe(0)
    expect(count(db, 'transactions')).toBe(0)
  })

  it('retries with a new receipt number if one already exists', async () => {
    const id = addProduct(db, { name: 'Rice', stock: 10 })
    const cart = [{ id, name: 'Rice', sell_price: 10, quantity: 1 }]
    const tried = []
    const flaky = async (statements) => {
      tried.push(statements[0].params[0])
      if (tried.length === 1) throw 'error returned from database: (code: 2067) UNIQUE constraint failed: sales.receipt_number'
      return run(statements)
    }

    const result = await completeSale(cart, null, 'Cash', flaky)

    expect(tried).toHaveLength(2)
    expect(tried[0]).not.toBe(tried[1])
    expect(result.receiptNumber).toBe(tried[1])
    expect(count(db, 'sales')).toBe(1)
  })

  it('rejects an empty cart', async () => {
    await expect(completeSale([], null, 'Cash', run)).rejects.toThrow('Cart is empty')
  })

  it('links every sale line to its sale', () => {
    const { statements } = buildSaleStatements(
      [{ id: 1, name: 'A', sell_price: 1, quantity: 1 }, { id: 2, name: 'B', sell_price: 2, quantity: 2 }],
      { id: 9, name: 'Ann' }, 'Card', 'RCT-X'
    )
    const lines = statements.filter(s => s.sql.includes('INSERT INTO sale_items'))
    expect(lines.every(s => s.params[0].$ref === 0)).toBe(true)
  })
})

describe('Restock (real restockService)', () => {
  let db, run
  beforeEach(() => { db = createDb(); run = runInTestDb(db) })

  it('adds stock, updates weighted average cost, logs cash-out — and creates NO expense', async () => {
    const id = addProduct(db, { name: 'Rice', stock: 10, buy: 6 })

    const { statements, totalCost } = buildRestockStatements({
      product_id: id, product_name: 'Rice', quantity: '10', unit_cost: '8',
      payment_method: 'Mobile Money', date: '2026-10-19'
    })
    await run(statements)

    expect(totalCost).toBe(80)
    expect(product(db, id).stock).toBe(20)
    expect(product(db, id).buy_price).toBe(7) // (10×6 + 10×8) / 20
    expect(count(db, 'expenses')).toBe(0)
    const movement = db.prepare('SELECT * FROM stock_movements').get()
    const txn = db.prepare('SELECT * FROM transactions').get()
    expect(txn).toMatchObject({
      type: 'expense', category: 'Stock Purchase', amount: 80,
      payment_method: 'Mobile Money', reference_type: 'restock', reference_id: movement.id
    })
  })

  it('keeps the buy price when no cost is entered, and logs no payment', async () => {
    const id = addProduct(db, { name: 'Rice', stock: 5, buy: 6 })
    const { statements } = buildRestockStatements({ product_id: id, product_name: 'Rice', quantity: 5, unit_cost: '', date: '2026-10-19' })
    await run(statements)
    expect(product(db, id)).toMatchObject({ stock: 10, buy_price: 6 })
    expect(count(db, 'transactions')).toBe(0)
  })

  it('handles products whose stock went negative in older versions', async () => {
    const id = addProduct(db, { name: 'Rice', stock: -3, buy: 6 })
    const { statements } = buildRestockStatements({ product_id: id, product_name: 'Rice', quantity: 10, unit_cost: 8, date: '2026-10-19' })
    await run(statements)
    expect(product(db, id)).toMatchObject({ stock: 7, buy_price: 8 })
  })

  it('fails cleanly for a deleted product', async () => {
    const { statements } = buildRestockStatements({ product_id: 999, product_name: 'Ghost', quantity: 1, unit_cost: 1, date: '2026-10-19' })
    await expect(run(statements)).rejects.toMatch('Product not found')
    expect(count(db, 'stock_movements')).toBe(0)
  })

  it('profit counts stock cost once — when sold', async () => {
    const id = addProduct(db, { name: 'Rice', stock: 0, buy: 0 })
    await run(buildRestockStatements({ product_id: id, product_name: 'Rice', quantity: 10, unit_cost: 6, date: '2026-10-19' }).statements)
    await completeSale([{ id, name: 'Rice', sell_price: 10, quantity: 4 }], null, 'Cash', run)

    const revenue = db.prepare(`SELECT SUM(total) AS v FROM sales`).get().v
    const cogs = db.prepare(`SELECT SUM(buy_price * quantity) AS v FROM sale_items`).get().v
    const expenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS v FROM expenses`).get().v
    expect(revenue - cogs - expenses).toBe(16) // 40 − 24 − 0 (was −44 before the fix)
  })
})

describe('Expenses (real expenseService)', () => {
  let db, run
  beforeEach(() => { db = createDb(); run = runInTestDb(db) })

  it('adds the expense and its ledger entry together', async () => {
    await run(buildAddExpenseStatements({ description: 'Rent', category: 'Rent', amount: '100', date: '2026-10-01' }))
    const exp = db.prepare('SELECT * FROM expenses').get()
    const txn = db.prepare('SELECT * FROM transactions').get()
    expect(txn).toMatchObject({ amount: 100, reference_id: exp.id, reference_type: 'expense' })
  })

  it('deleting an expense never removes a restock entry with the same id number', async () => {
    const id = addProduct(db, { name: 'Rice', stock: 0 })
    await run(buildRestockStatements({ product_id: id, product_name: 'Rice', quantity: 1, unit_cost: 5, date: '2026-10-19' }).statements)
    await run(buildAddExpenseStatements({ description: 'Rent', category: 'Rent', amount: 100, date: '2026-10-01' }))
    // stock movement #1 and expense #1 share the number 1
    await run(buildDeleteExpenseStatements(1))

    expect(count(db, 'expenses')).toBe(0)
    const left = db.prepare('SELECT reference_type FROM transactions').all()
    expect(left).toEqual([{ reference_type: 'restock' }])
  })
})
