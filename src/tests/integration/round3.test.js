// Tests for Round 3: voiding sales, editing expenses, faster sales loading.
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, runInTestDb } from './realDb'
import { completeSale, voidSale, attachItems } from '../../services/salesService'
import { buildAddExpenseStatements, buildUpdateExpenseStatements } from '../../services/expenseService'
import { OTHER_LEDGER_SQL } from '../../services/plService'

describe('Void a sale', () => {
  let db, run, pid, sale
  beforeEach(async () => {
    db = createDb(); run = runInTestDb(db)
    pid = Number(db.prepare(
      `INSERT INTO products (name, sku, buy_price, sell_price, stock) VALUES ('Rice', 'R1', 600, 1000, 10)`
    ).run().lastInsertRowid)
    const result = await completeSale([{ id: pid, name: 'Rice', sell_price: 1000, quantity: 3 }], null, 'Mobile Money', run)
    sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(result.saleId)
    sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id)
  })

  it('marks the sale voided, returns stock, and records the refund', async () => {
    await voidSale(sale, '', run)

    expect(db.prepare('SELECT status FROM sales').get().status).toBe('voided')
    expect(db.prepare('SELECT stock FROM products').get().stock).toBe(10)
    const movement = db.prepare(`SELECT type, quantity FROM stock_movements`).get()
    expect(movement).toEqual({ type: 'return', quantity: 3 })
    const refund = db.prepare(`SELECT * FROM transactions WHERE category = 'Refund'`).get()
    expect(refund).toMatchObject({ type: 'expense', amount: 3000, payment_method: 'Mobile Money', reference_type: 'sale_void' })
  })

  it('cash balances to zero and profit ignores the voided sale', async () => {
    await voidSale(sale, '', run)

    const net = db.prepare(`SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS n FROM transactions`).get().n
    expect(net).toBe(0)
    const revenue = db.prepare(`SELECT COALESCE(SUM(total), 0) AS v FROM sales WHERE status = 'completed'`).get().v
    expect(revenue).toBe(0)
    // The refund is not counted again as "Other expenses"
    expect(db.prepare(OTHER_LEDGER_SQL).get()).toEqual({ other_income: 0, other_expenses: 0 })
  })

  it('cannot void the same sale twice', async () => {
    await voidSale(sale, '', run)
    await expect(voidSale(sale, '', run)).rejects.toMatch('already been voided')
    expect(db.prepare('SELECT stock FROM products').get().stock).toBe(10) // not 13
  })
})

describe('Edit an expense', () => {
  it('updates the expense and its ledger entry together', async () => {
    const db = createDb(); const run = runInTestDb(db)
    await run(buildAddExpenseStatements({ description: 'Rent', category: 'Rent', amount: 1000, date: '2026-10-01', payment_method: 'Cash' }))
    const id = db.prepare('SELECT id FROM expenses').get().id

    await run(buildUpdateExpenseStatements(id, {
      description: 'Rent October', category: 'Rent', amount: '1200', date: '2026-10-02', payment_method: 'Bank Transfer',
    }))

    expect(db.prepare('SELECT description, amount, date FROM expenses').get())
      .toEqual({ description: 'Rent October', amount: 1200, date: '2026-10-02' })
    expect(db.prepare('SELECT description, amount, payment_method, date FROM transactions').get())
      .toEqual({ description: 'Rent October', amount: 1200, payment_method: 'Bank Transfer', date: '2026-10-02' })
  })

  it('fails cleanly if the expense was deleted', async () => {
    const db = createDb(); const run = runInTestDb(db)
    await expect(run(buildUpdateExpenseStatements(99, { description: 'x', category: 'Rent', amount: 1, date: '2026-10-01' })))
      .rejects.toMatch('no longer exists')
  })
})

describe('Sales history loading', () => {
  it('attaches each sale\'s items from one list', () => {
    const sales = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const items = [{ sale_id: 1, n: 'a' }, { sale_id: 2, n: 'b' }, { sale_id: 1, n: 'c' }]
    attachItems(sales, items)
    expect(sales.map(s => s.items.map(i => i.n))).toEqual([['a', 'c'], ['b'], []])
  })
})
