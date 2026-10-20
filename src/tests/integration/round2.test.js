// Tests for Round 2: dates/time zones, RWF money, archive-instead-of-delete,
// safe product edits, and P&L agreeing with manual transactions.
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, runInTestDb } from './realDb'
import {
  formatMoney, parseDbDate, formatDate, todayLocal, monthLocal, monthsAgoLocal,
} from '../../utils/format'
import { buildDeleteProductStatements, buildUpdateProductStatements } from '../../services/productService'
import { buildDeleteCustomerStatements } from '../../services/customerService'
import { buildDeleteSupplierStatements } from '../../services/supplierService'
import { OTHER_LEDGER_SQL } from '../../services/plService'
import { completeSale } from '../../services/salesService'
import { buildRestockStatements } from '../../services/restockService'
import { buildAddExpenseStatements } from '../../services/expenseService'

describe('Money (RWF)', () => {
  it('formats with thousands separators and no decimals', () => {
    expect(formatMoney(12500)).toBe('RWF 12,500')
    expect(formatMoney(1234567.6)).toBe('RWF 1,234,568')
    expect(formatMoney('300')).toBe('RWF 300')
    expect(formatMoney(null)).toBe('RWF 0')
  })
})

describe('Dates and time zones', () => {
  it('reads SQLite datetime values as UTC (not 2 hours off)', () => {
    expect(parseDbDate('2026-10-19 12:00:00').toISOString()).toBe('2026-10-19T12:00:00.000Z')
  })

  it('keeps plain dates (expense dates) on the same calendar day', () => {
    const d = parseDbDate('2026-03-01')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1])
    expect(formatDate('2026-03-01')).toBe('1 Mar 2026')
  })

  it('leaves ISO strings that already have a time zone alone', () => {
    expect(parseDbDate('2026-10-19T08:30:00.000Z').toISOString()).toBe('2026-10-19T08:30:00.000Z')
  })

  it('uses the LOCAL date for today, month and the last-6-months window', () => {
    const justAfterMidnight = new Date(2026, 9, 20, 0, 30) // Oct 20, 00:30 local
    expect(todayLocal(justAfterMidnight)).toBe('2026-10-20')
    expect(monthLocal(justAfterMidnight)).toBe('2026-10')
    expect(monthsAgoLocal(6, justAfterMidnight)).toBe('2026-05')
    expect(monthsAgoLocal(6, new Date(2026, 1, 15))).toBe('2025-09') // crosses the year
  })

  it('handles empty values', () => {
    expect(parseDbDate(null)).toBe(null)
    expect(formatDate('', 'Never')).toBe('Never')
  })
})

describe('Archive instead of delete', () => {
  let db, run
  beforeEach(() => { db = createDb(); run = runInTestDb(db) })

  const addProduct = (name, stock = 10) => Number(db.prepare(
    `INSERT INTO products (name, sku, sell_price, stock) VALUES (?, ?, 10, ?)`
  ).run(name, name.toUpperCase(), stock).lastInsertRowid)

  it('really deletes a product with no history', async () => {
    const id = addProduct('Unused')
    const results = await run(buildDeleteProductStatements(id))
    expect(results[0].rowsAffected).toBe(0) // not archived
    expect(db.prepare('SELECT COUNT(*) n FROM products').get().n).toBe(0)
  })

  it('archives a sold product, keeps its sales, and frees its SKU', async () => {
    const id = addProduct('Rice')
    await completeSale([{ id, name: 'Rice', sell_price: 10, quantity: 1 }], { customer: null, paymentMethod: 'Cash' }, run)

    const results = await run(buildDeleteProductStatements(id))

    expect(results[0].rowsAffected).toBe(1)
    const p = db.prepare('SELECT archived, sku FROM products WHERE id = ?').get(id)
    expect(p).toEqual({ archived: 1, sku: `RICE~archived-${id}` })
    expect(db.prepare('SELECT COUNT(*) n FROM sale_items').get().n).toBe(1)
    // The old SKU can be used again
    expect(() => addProduct('Rice')).not.toThrow()
  })

  it('archives a customer with sales, deletes one without', async () => {
    const withSales = Number(db.prepare(`INSERT INTO customers (name) VALUES ('Ann')`).run().lastInsertRowid)
    const without = Number(db.prepare(`INSERT INTO customers (name) VALUES ('Bob')`).run().lastInsertRowid)
    const pid = addProduct('Rice')
    await completeSale([{ id: pid, name: 'Rice', sell_price: 10, quantity: 1 }], { customer: { id: withSales, name: 'Ann' }, paymentMethod: 'Cash' }, run)

    expect((await run(buildDeleteCustomerStatements(withSales)))[0].rowsAffected).toBe(1)
    expect((await run(buildDeleteCustomerStatements(without)))[0].rowsAffected).toBe(0)

    const rows = db.prepare('SELECT name, archived FROM customers').all()
    expect(rows).toEqual([{ name: 'Ann', archived: 1 }])
  })

  it('archives a supplier that products use', async () => {
    const sid = Number(db.prepare(`INSERT INTO suppliers (name) VALUES ('Acme')`).run().lastInsertRowid)
    db.prepare(`INSERT INTO products (name, sku, supplier_id) VALUES ('Oil', 'OIL', ?)`).run(sid)
    expect((await run(buildDeleteSupplierStatements(sid)))[0].rowsAffected).toBe(1)
    expect(db.prepare('SELECT archived FROM suppliers').get().archived).toBe(1)
  })
})

describe('Editing a product', () => {
  let db, run, id
  beforeEach(() => {
    db = createDb(); run = runInTestDb(db)
    id = Number(db.prepare(
      `INSERT INTO products (name, sku, buy_price, sell_price, stock) VALUES ('Rice', 'R1', 6, 10, 10)`
    ).run().lastInsertRowid)
  })

  const form = (over = {}) => ({ name: 'Rice', sku: 'R1', buy_price: 6, sell_price: 12, stock: 10, low_stock_alert: 5, ...over })

  it('logs a stock correction in the stock history', async () => {
    await run(buildUpdateProductStatements(id, form({ stock: 8 }), 10))
    expect(db.prepare('SELECT stock, sell_price FROM products').get()).toEqual({ stock: 8, sell_price: 12 })
    const m = db.prepare('SELECT type, quantity FROM stock_movements').get()
    expect(m).toEqual({ type: 'adjustment', quantity: -2 })
  })

  it('does not log anything when stock is unchanged', async () => {
    await run(buildUpdateProductStatements(id, form(), 10))
    expect(db.prepare('SELECT COUNT(*) n FROM stock_movements').get().n).toBe(0)
  })

  it('refuses to overwrite stock that changed since the form was opened', async () => {
    await completeSale([{ id, name: 'Rice', sell_price: 10, quantity: 3 }], { customer: null, paymentMethod: 'Cash' }, run) // stock 10 → 7
    await expect(run(buildUpdateProductStatements(id, form({ stock: 10 }), 10))).rejects.toMatch('stock changed')
    expect(db.prepare('SELECT stock FROM products').get().stock).toBe(7)
  })

  it('allows a low-stock alert of 0', async () => {
    await run(buildUpdateProductStatements(id, form({ low_stock_alert: '0' }), 10))
    expect(db.prepare('SELECT low_stock_alert FROM products').get().low_stock_alert).toBe(0)
  })
})

describe('P&L includes manual transactions (one source of truth)', () => {
  it('counts manual income/expenses but not linked entries or stock purchases', async () => {
    const db = createDb(); const run = runInTestDb(db)
    const pid = Number(db.prepare(`INSERT INTO products (name, sku, stock) VALUES ('Rice', 'R1', 0)`).run().lastInsertRowid)

    // Linked entries (already counted elsewhere in P&L)
    await run(buildRestockStatements({ product_id: pid, product_name: 'Rice', quantity: 5, unit_cost: 100, date: '2026-10-19' }).statements)
    await completeSale([{ id: pid, name: 'Rice', sell_price: 300, quantity: 1 }], { customer: null, paymentMethod: 'Cash' }, run)
    await run(buildAddExpenseStatements({ description: 'Rent', category: 'Rent', amount: 1000, date: '2026-10-01' }))

    // Manual entries typed on the Transactions page
    db.exec(`
      INSERT INTO transactions (description, type, category, amount, date) VALUES ('Repair job', 'income', 'Other', 500, '2026-10-02');
      INSERT INTO transactions (description, type, category, amount, date) VALUES ('Bank fee', 'expense', 'Other', 50, '2026-10-03');
      INSERT INTO transactions (description, type, category, amount, date) VALUES ('Bought bags', 'expense', 'Stock Purchase', 200, '2026-10-04');
    `)

    expect(db.prepare(OTHER_LEDGER_SQL).get()).toEqual({ other_income: 500, other_expenses: 50 })
  })
})
