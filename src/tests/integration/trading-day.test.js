// Random trading days.
//
// Each test runs a long random mix of what really happens in a shop — sales
// (cash, MoMo, credit, discounts, VAT), stock deliveries, voided sales, debt
// repayments and cancellations, expenses and manual cash entries — against the
// REAL services and a REAL database.
//
// Next to it, a very simple model (plain JavaScript numbers) keeps track of what
// the stock, the cash, each customer's debt and the profit SHOULD be. After
// every step the database must agree with the model, and some rules must
// always hold (stock never negative, a refused action changes nothing, ...).
//
// The random sequence is "seeded": if a seed fails, the same seed always
// replays the same day, so the bug can be reproduced.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { freshDb } from './appDb'

vi.mock('../../services/db', async () => (await import('./appDb')).dbModule)

import { completeSale, getSaleById, voidSale, calculateTotals } from '../../services/salesService'
import { restockProduct } from '../../services/restockService'
import { recordPayment, voidPayment, getCustomers, getTotalOwed } from '../../services/customerService'
import { addExpense } from '../../services/expenseService'
import { addTransaction, getTransactionSummary } from '../../services/transactionService'
import { getPLReport } from '../../services/plService'
import { getDashboardData } from '../../services/dashboardService'
import { roundMoney, roundQty, todayLocal } from '../../utils/format'

// Small, fast, seedable random generator (mulberry32)
function rng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: list => list[Math.floor(next() * list.length)],
    chance: p => next() < p,
  }
}

const near = (actual, expected, tolerance = 0.011) => {
  expect(Math.abs(Number(actual) - Number(expected)), `${actual} ≠ ${expected}`).toBeLessThanOrEqual(tolerance)
}

let db
const one = (sql, ...p) => db.prepare(sql).get(...p)
const tableCounts = () => Object.fromEntries(
  ['sales', 'sale_items', 'transactions', 'customer_payments', 'stock_movements', 'expenses']
    .map(t => [t, one(`SELECT COUNT(*) AS n FROM ${t}`).n])
)
const stockSnapshot = () => db.prepare('SELECT id, stock, buy_price FROM products ORDER BY id').all()

const PRODUCTS = [
  { name: 'Rice', unit: 'Kg', sell_price: 1200, buy_price: 900, stock: 25 },
  { name: 'Sugar', unit: 'Kg', sell_price: 1500, buy_price: 1100, stock: 8.5 },
  { name: 'Soap', unit: 'Piece', sell_price: 1000, buy_price: 500, stock: 6 },
  { name: 'Milk', unit: 'Litre', sell_price: 800, buy_price: 600, stock: 4 },
  { name: 'Bread', unit: 'Piece', sell_price: 1300, buy_price: 1000, stock: 2, vat_exempt: 1 },
  { name: 'Phone credit', unit: 'Piece', sell_price: 500, buy_price: 480, stock: 50 },
]
const CUSTOMERS = ['Ann', 'Bob', 'Claude', 'Divine']
const DECIMAL = new Set(['Kg', 'Litre'])

function seedShop(vatRate) {
  db.prepare(`INSERT INTO settings (key, value) VALUES ('vat_enabled', ?), ('vat_rate', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(vatRate ? '1' : '0', String(vatRate || 18))
  for (const p of PRODUCTS) {
    db.prepare(`INSERT INTO products (name, sku, unit, sell_price, buy_price, stock, vat_exempt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(p.name, p.name.toUpperCase(), p.unit, p.sell_price, p.buy_price, p.stock, p.vat_exempt || 0)
  }
  for (const c of CUSTOMERS) db.prepare('INSERT INTO customers (name) VALUES (?)').run(c)
  const products = db.prepare('SELECT * FROM products ORDER BY id').all()
  const customers = db.prepare('SELECT * FROM customers ORDER BY id').all()
  return { products, customers }
}

// ── One random trading day ───────────────────────────────
async function tradingDay(seed, steps) {
  const r = rng(seed)
  const vatRate = r.chance(0.5) ? 18 : 0
  const { products, customers } = seedShop(vatRate)

  // The model
  const m = {
    stock: Object.fromEntries(products.map(p => [p.id, p.stock])),
    cost: Object.fromEntries(products.map(p => [p.id, p.buy_price])),
    debt: Object.fromEntries(customers.map(c => [c.id, 0])),
    cash: 0, // money in − money out, from the ledger's point of view
    revenue: 0, vat: 0, cogs: 0, expenses: 0, otherIncome: 0, otherExpenses: 0,
    sales: [], // { id, total, paid, credit, customerId, voided, lines: [{ id, qty, cost }] }
    payments: [], // { id, customerId, amount, voided }
  }
  const log = []

  const actions = {
    async sale() {
      const count = r.int(1, 3)
      const chosen = [...products].sort(() => r.next() - 0.5).slice(0, count)
      const cart = chosen.map(p => {
        const max = Math.max(1, Math.ceil(m.stock[p.id] + 1))
        const quantity = DECIMAL.has(p.unit) ? r.int(1, max * 4) / 4 : r.int(1, max)
        return { ...p, quantity }
      })
      const credit = r.chance(0.3)
      const customer = credit || r.chance(0.3) ? r.pick(customers) : null
      const discount = r.chance(0.25) ? (r.chance(0.5) ? { type: 'amount', value: r.int(0, 3000) } : { type: 'percent', value: r.int(0, 50) }) : null
      const paymentMethod = credit ? 'Credit' : r.pick(['Cash', 'Mobile Money', 'Card', 'Bank Transfer'])
      const totals = calculateTotals(cart, { discount, vatRate })
      const amountPaid = credit ? r.pick([0, r.int(0, totals.total), totals.total + 500]) : null

      const enough = cart.every(i => m.stock[i.id] + 0.0005 >= roundQty(i.quantity))
      const before = tableCounts()
      const stockBefore = stockSnapshot()
      log.push(`sale ${cart.map(i => `${i.name}×${i.quantity}`).join(', ')} ${paymentMethod}${enough ? '' : ' (not enough stock)'}`)

      if (!enough) {
        await expect(completeSale(cart, { customer, paymentMethod, discount, vatRate, amountPaid })).rejects.toThrow('Not enough stock')
        expect(tableCounts()).toEqual(before)
        expect(stockSnapshot()).toEqual(stockBefore)
        return
      }
      const res = await completeSale(cart, { customer, paymentMethod, discount, vatRate, amountPaid, paidNowMethod: 'Cash' })
      const paid = credit ? roundMoney(Math.min(totals.total, Math.max(0, amountPaid))) : totals.total
      expect(res.total).toBe(totals.total)
      expect(res.amountPaid).toBe(paid)

      const lines = cart.map(i => ({ id: i.id, qty: roundQty(i.quantity), cost: m.cost[i.id] }))
      for (const l of lines) m.stock[l.id] = roundQty(m.stock[l.id] - l.qty)
      m.sales.push({ id: res.saleId, total: totals.total, vat: totals.vat, paid, credit, customerId: customer?.id, voided: false, lines })
      m.cash += paid
      m.revenue += totals.total
      m.vat += totals.vat
      m.cogs += lines.reduce((a, l) => a + l.qty * l.cost, 0)
      if (credit) m.debt[customer.id] += totals.total - paid
    },

    async restock() {
      const p = r.pick(products)
      const quantity = DECIMAL.has(p.unit) ? r.int(1, 40) / 4 : r.int(1, 20)
      const unitCost = r.chance(0.1) ? 0 : r.int(Math.round(p.buy_price * 0.8), Math.round(p.buy_price * 1.2))
      log.push(`restock ${p.name} ${quantity} @ ${unitCost}`)
      await restockProduct({ product_id: p.id, product_name: p.name, unit: p.unit, quantity, unit_cost: unitCost, date: todayLocal() })
      if (unitCost > 0) {
        const s = Math.max(m.stock[p.id], 0)
        m.cost[p.id] = Math.round((s * m.cost[p.id] + quantity * unitCost) / (s + quantity) * 100) / 100
      }
      m.stock[p.id] = roundQty(m.stock[p.id] + quantity)
      m.cash -= Math.round(unitCost * quantity * 100) / 100
    },

    async voidSale() {
      const open = m.sales.filter(s => !s.voided)
      const already = m.sales.filter(s => s.voided)
      if (already.length && r.chance(0.2)) {
        // voiding twice must be refused and change nothing
        const s = r.pick(already)
        log.push(`void again #${s.id}`)
        const sale = await getSaleById(s.id)
        sale.status = 'completed' // a stale screen still shows it as completed
        const before = tableCounts()
        const stockBefore = stockSnapshot()
        await expect(voidSale(sale, 'again')).rejects.toThrow('already been voided')
        expect(tableCounts()).toEqual(before)
        expect(stockSnapshot()).toEqual(stockBefore)
        return
      }
      if (!open.length) return
      const s = r.pick(open)
      log.push(`void #${s.id}`)
      await voidSale(await getSaleById(s.id), 'mistake')
      s.voided = true
      for (const l of s.lines) m.stock[l.id] = roundQty(m.stock[l.id] + l.qty)
      m.cash -= s.paid
      m.revenue -= s.total
      m.vat -= s.vat
      m.cogs -= s.lines.reduce((a, l) => a + l.qty * l.cost, 0)
      if (s.credit) m.debt[s.customerId] -= s.total - s.paid
    },

    async payment() {
      const c = r.pick(customers)
      const owed = roundMoney(m.debt[c.id])
      const amount = r.pick([r.int(1, Math.max(1, owed)), owed, owed + r.int(1, 5000)])
      log.push(`payment ${c.name} ${amount} (owes ${owed})`)
      if (!(amount > 0)) return
      if (amount > owed + 0.005) {
        const before = tableCounts()
        await expect(recordPayment({ customerId: c.id, customerName: c.name, amount })).rejects.toThrow('more than what the customer owes')
        expect(tableCounts()).toEqual(before)
        return
      }
      await recordPayment({ customerId: c.id, customerName: c.name, amount, paymentMethod: r.pick(['Cash', 'Mobile Money']) })
      const id = one('SELECT MAX(id) AS id FROM customer_payments').id
      m.payments.push({ id, customerId: c.id, amount, voided: false })
      m.debt[c.id] -= amount
      m.cash += amount
    },

    async voidPayment() {
      const open = m.payments.filter(p => !p.voided)
      if (!open.length) return
      const p = r.pick(open)
      log.push(`cancel payment #${p.id}`)
      await voidPayment(p.id)
      p.voided = true
      m.debt[p.customerId] += p.amount
      m.cash -= p.amount
      // cancelling twice is refused
      await expect(voidPayment(p.id)).rejects.toThrow('already cancelled')
    },

    async expense() {
      const amount = r.int(100, 20000)
      log.push(`expense ${amount}`)
      await addExpense({ description: 'Random', category: r.pick(['Rent', 'Transport', 'Electricity']), amount, date: todayLocal() })
      m.expenses += amount
      m.cash -= amount
    },

    async manual() {
      const type = r.pick(['income', 'expense'])
      const category = type === 'expense' && r.chance(0.3) ? 'Stock Purchase' : 'Other'
      const amount = r.int(100, 10000)
      log.push(`manual ${type} ${category} ${amount}`)
      await addTransaction({ description: 'Manual', type, category, amount, date: todayLocal() })
      if (type === 'income') { m.otherIncome += amount; m.cash += amount } else {
        m.cash -= amount
        if (category !== 'Stock Purchase') m.otherExpenses += amount
      }
    },
  }

  const weighted = [
    ...Array(8).fill('sale'), ...Array(2).fill('restock'), 'voidSale', ...Array(2).fill('payment'),
    'voidPayment', 'expense', 'manual',
  ]

  try {
    for (let step = 0; step < steps; step++) {
      await actions[r.pick(weighted)]()
      await checkInvariants(m, products, customers)
    }
    await checkReports(m, customers)
  } catch (err) {
    err.message = `Seed ${seed}, after: \n  ${log.slice(-8).join('\n  ')}\n${err.message}`
    throw err
  }
  return m
}

// Checked after EVERY step
async function checkInvariants(m, products, customers) {
  for (const p of products) {
    const row = one('SELECT stock, buy_price FROM products WHERE id = ?', p.id)
    near(row.stock, m.stock[p.id], 0.0011)
    expect(row.stock).toBeGreaterThanOrEqual(-0.0005)
    near(row.buy_price, m.cost[p.id])

    // stock = start + deliveries + returns − everything ever sold
    const moved = one(`SELECT COALESCE(SUM(quantity), 0) AS q FROM stock_movements WHERE product_id = ? AND type IN ('restock', 'return')`, p.id).q
    const sold = one(`SELECT COALESCE(SUM(quantity), 0) AS q FROM sale_items WHERE product_id = ?`, p.id).q
    near(row.stock, p.stock + moved - sold, 0.0011)
  }

  // cash ledger
  const { net } = one(`SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS net FROM transactions`)
  near(net, m.cash, 0.02)

  // every sale is consistent with its lines
  const bad = db.prepare(`
    SELECT s.id FROM sales s
    WHERE ABS(s.subtotal - (SELECT COALESCE(SUM(subtotal), 0) FROM sale_items WHERE sale_id = s.id)) > 0.011
       OR ABS(s.total - (s.subtotal - s.discount)) > 0.011
       OR s.amount_paid > s.total + 0.005 OR s.amount_paid < 0
       OR s.tax > s.total OR s.tax < 0
       OR (s.payment_method <> 'Credit' AND ABS(s.amount_paid - s.total) > 0.005)`).all()
  expect(bad).toEqual([])

  // one ledger entry per completed (or voided) sale with money paid, one refund per voided paid sale
  const ledger = one(`SELECT
      (SELECT COUNT(*) FROM sales WHERE amount_paid > 0) AS paidSales,
      (SELECT COUNT(*) FROM transactions WHERE reference_type = 'sale') AS saleRows,
      (SELECT COUNT(*) FROM sales WHERE status = 'voided' AND amount_paid > 0) AS voidedPaid,
      (SELECT COUNT(*) FROM transactions WHERE reference_type = 'sale_void') AS refundRows`)
  expect(ledger.saleRows).toBe(ledger.paidSales)
  expect(ledger.refundRows).toBe(ledger.voidedPaid)

  // debts
  for (const c of customers) {
    const { balance } = one(`SELECT ${(await import('../../services/customerService')).balanceSql('?')} AS balance`, c.id, c.id)
    near(balance, m.debt[c.id], 0.02)
  }
}

// Checked at the end of the day: every report agrees with the model
async function checkReports(m, customers) {
  const pl = await getPLReport()
  near(pl.totalRevenue, m.revenue, 0.05)
  near(pl.vatCollected, m.vat, 0.05)
  near(pl.totalCogs, m.cogs, 0.05)
  near(pl.totalExpenses, m.expenses)
  near(pl.otherIncome, m.otherIncome)
  near(pl.otherExpenses, m.otherExpenses)
  near(pl.netProfit, m.revenue - m.vat - m.cogs + m.otherIncome - m.expenses - m.otherExpenses, 0.1)
  expect(pl.salesCount).toBe(m.sales.filter(s => !s.voided).length)

  const summary = await getTransactionSummary()
  near(summary.net ?? 0, m.cash, 0.02)

  const list = await getCustomers()
  for (const c of customers) near(list.find(x => x.id === c.id).balance, m.debt[c.id], 0.02)
  const owed = await getTotalOwed()
  near(owed.owed, Object.values(m.debt).reduce((a, d) => a + Math.max(0, d), 0), 0.05)

  const dash = await getDashboardData()
  expect(dash).toBeTruthy()
}

// ─────────────────────────────────────────────────────────
describe('Random trading days: stock, cash, debts and profit always reconcile', () => {
  beforeEach(() => { db = freshDb() })

  const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 7919)
  for (const seed of SEEDS) {
    it(`seed ${seed}`, async () => {
      const m = await tradingDay(seed, 60)
      expect(m.sales.length).toBeGreaterThan(0)
    })
  }

  it('a very long day (400 steps)', async () => {
    const m = await tradingDay(424242, 400)
    expect(m.sales.length).toBeGreaterThan(50)
    expect(m.sales.filter(s => s.voided).length).toBeGreaterThan(0)
    expect(m.sales.filter(s => s.credit).length).toBeGreaterThan(0)
    expect(m.payments.length).toBeGreaterThan(0)
  }, 60000)
})
