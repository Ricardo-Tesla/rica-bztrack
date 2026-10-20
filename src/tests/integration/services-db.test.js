// Every service function, exactly as the app calls it, against a real
// in-memory database built from the real migrations.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { freshDb } from './appDb'

vi.mock('../../services/db', async () => (await import('./appDb')).dbModule)

import { getSettings, saveSettings, isVatEnabled } from '../../services/settingsService'
import {
  hasOwner, completeSetup, getUsers, createUser, login, changePin, renameUser,
  setUserActive, recoverOwnerPin, regenerateRecoveryCode,
} from '../../services/authService'
import { getProducts, addProduct, updateProduct, deleteProduct } from '../../services/productService'
import { getSuppliers, addSupplier, updateSupplier, deleteSupplier } from '../../services/supplierService'
import {
  getCustomers, getTotalOwed, addCustomer, updateCustomer, deleteCustomer,
  recordPayment, voidPayment, getCustomerStatement,
} from '../../services/customerService'
import { completeSale, getSales, getSaleById, setEbmReceiptNumber, voidSale } from '../../services/salesService'
import { getExpenses, addExpense, updateExpense, deleteExpense } from '../../services/expenseService'
import { getTransactions, addTransaction, getTransactionSummary } from '../../services/transactionService'
import { restockProduct, getStockMovements } from '../../services/restockService'
import { getPLReport } from '../../services/plService'
import { getDashboardData } from '../../services/dashboardService'
import { setCurrentUser } from '../../utils/session'
import { todayLocal } from '../../utils/format'
import { rangeFor } from '../../utils/dateRanges'

let db
const one = (sql, ...p) => db.prepare(sql).get(...p)

beforeEach(() => {
  db = freshDb()
  setCurrentUser({ id: 1, name: 'Owner', role: 'owner' })
})

async function product(fields = {}) {
  await addProduct({ name: 'Rice', sku: `SKU${Math.random()}`, sell_price: 1000, buy_price: 600, stock: 10, ...fields })
  return one('SELECT * FROM products ORDER BY id DESC LIMIT 1')
}
async function customer(name = 'Ann') {
  await addCustomer({ name, phone: '0788000000' })
  return one('SELECT * FROM customers ORDER BY id DESC LIMIT 1')
}
const sell = (p, qty = 1, options = {}) => completeSale([{ ...p, quantity: qty }], { paymentMethod: 'Cash', ...options })
const setSaleTime = (id, utc) => db.prepare('UPDATE sales SET created_at = ? WHERE id = ?').run(utc, id)

// ─────────────────────────────────────────────────────────────
describe('settingsService', () => {
  it('returns defaults for a new shop', async () => {
    const s = await getSettings()
    expect(s).toMatchObject({ business_name: '', vat_enabled: '0', vat_rate: '18', language: 'en', paper_width: '80', backup_keep: '30' })
  })

  it('saves values and never returns the recovery secrets unless asked', async () => {
    await saveSettings({ business_name: 'Duka', vat_enabled: '1', recovery_hash: 'abc', recovery_salt: 'def' })
    const s = await getSettings()
    expect(s.business_name).toBe('Duka')
    expect(isVatEnabled(s)).toBe(true)
    expect(s.recovery_hash).toBeUndefined()
    expect((await getSettings({ includeSecrets: true })).recovery_hash).toBe('abc')
  })

  it('saving nothing does nothing', async () => {
    await saveSettings({ not_a_setting: 1 })
    expect(one('SELECT COUNT(*) n FROM settings').n).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
describe('authService', () => {
  const setup = () => completeSetup({ business: { business_name: 'Duka' }, ownerName: 'Rica', pin: '1234' })

  it('first-run setup creates the owner once', async () => {
    expect(await hasOwner()).toBe(false)
    const code = await setup()
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(await hasOwner()).toBe(true)
    await expect(setup()).rejects.toThrow('already set up')
  })

  it('lists owners first, hides inactive users unless asked', async () => {
    await setup()
    await createUser({ name: 'Zed', role: 'cashier', pin: '1111' })
    await createUser({ name: 'Aline', role: 'cashier', pin: '2222' })
    expect((await getUsers()).map(u => u.name)).toEqual(['Rica', 'Aline', 'Zed'])
    const zed = (await getUsers()).find(u => u.name === 'Zed')
    await setUserActive(zed.id, false)
    expect((await getUsers()).map(u => u.name)).toEqual(['Rica', 'Aline'])
    expect((await getUsers({ includeInactive: true })).length).toBe(3)
    await setUserActive(zed.id, true)
    expect((await getUsers()).length).toBe(3)
  })

  it('never returns PIN hashes in the user list', async () => {
    await setup()
    const [u] = await getUsers()
    expect(u.pin_hash).toBeUndefined()
    expect(u.pin_salt).toBeUndefined()
  })

  it('signs in, records the last sign-in, and accepts a changed PIN', async () => {
    await setup()
    const owner = one(`SELECT id FROM users`)
    const u = await login(owner.id, '1234', { now: 1 })
    expect(u).toEqual({ id: owner.id, name: 'Rica', role: 'owner' })
    expect(one('SELECT last_login FROM users').last_login).toBeTruthy()
    await changePin(owner.id, '9876')
    await expect(login(owner.id, '1234', { now: 2 })).rejects.toThrow('Wrong PIN')
    expect((await login(owner.id, '9876', { now: 3 })).name).toBe('Rica')
  })

  it('renames users and refuses empty names', async () => {
    await setup()
    const id = one('SELECT id FROM users').id
    await renameUser(id, '  Ricardo  ')
    expect(one('SELECT name FROM users').name).toBe('Ricardo')
    await expect(renameUser(id, '   ')).rejects.toThrow('Name is required')
  })

  it('recovers the owner PIN with the recovery code (any case, any dashes)', async () => {
    const code = await setup()
    const id = one('SELECT id FROM users').id
    await expect(recoverOwnerPin('AAAA-BBBB-CCCC', '5555')).rejects.toThrow('Wrong recovery code')
    const owner = await recoverOwnerPin(code.toLowerCase().replace(/-/g, ' '), '5555')
    expect(owner.name).toBe('Rica')
    expect((await login(id, '5555', { now: 10 })).role).toBe('owner')
  })

  it('recovery reactivates a deactivated owner', async () => {
    const code = await setup()
    await createUser({ name: 'Second owner', role: 'owner', pin: '1212' })
    const first = one(`SELECT id FROM users ORDER BY id LIMIT 1`).id
    await setUserActive(first, false)
    await recoverOwnerPin(code, '4321')
    expect(one('SELECT active FROM users WHERE id = ?', first).active).toBe(1)
  })

  it('a new recovery code replaces the old one', async () => {
    const oldCode = await setup()
    const newCode = await regenerateRecoveryCode()
    expect(newCode).not.toBe(oldCode)
    await expect(recoverOwnerPin(oldCode, '1111')).rejects.toThrow('Wrong recovery code')
    await expect(recoverOwnerPin(newCode, '1111')).resolves.toBeTruthy()
  })

  it('recovery is impossible before setup', async () => {
    await expect(recoverOwnerPin('AAAA-BBBB-CCCC', '1111')).rejects.toThrow('No recovery code')
  })

  it('a bad new PIN is refused during recovery', async () => {
    const code = await setup()
    await expect(recoverOwnerPin(code, '12')).rejects.toThrow('4 to 6 digits')
  })
})

// ─────────────────────────────────────────────────────────────
describe('productService', () => {
  it('lists active products alphabetically with their supplier', async () => {
    await addSupplier({ name: 'Acme' })
    const supplierId = one('SELECT id FROM suppliers').id
    await product({ name: 'Zinc', supplier_id: supplierId })
    await product({ name: 'Apple' })
    const list = await getProducts()
    expect(list.map(p => p.name)).toEqual(['Apple', 'Zinc'])
    expect(list[1].supplier_name).toBe('Acme')
  })

  it('stores barcode, VAT exemption, decimal stock and a 0 low-stock alert', async () => {
    const p = await product({ barcode: ' 600123 ', vat_exempt: true, stock: '2.5', unit: 'Kg', low_stock_alert: '0' })
    expect(p).toMatchObject({ barcode: '600123', vat_exempt: 1, stock: 2.5, low_stock_alert: 0 })
  })

  it('empty optional fields become NULL, not empty text', async () => {
    const p = await product({ barcode: '   ', category: '', unit: '' })
    expect(p.barcode).toBe(null)
    expect(p.category).toBe(null)
  })

  it('refuses a duplicate SKU', async () => {
    await product({ sku: 'SAME' })
    await expect(product({ sku: 'SAME' })).rejects.toThrow(/UNIQUE/)
  })

  it('updates a product', async () => {
    const p = await product()
    await updateProduct(p.id, { ...p, name: 'Rice 25kg', sell_price: 1200, stock: 10 }, p.stock)
    expect(one('SELECT name, sell_price FROM products').name).toBe('Rice 25kg')
  })

  it('archives products with history, deletes those without', async () => {
    const used = await product({ name: 'Used' })
    const unused = await product({ name: 'Unused' })
    await sell(used)
    expect(await deleteProduct(used.id)).toBe('archived')
    expect(await deleteProduct(unused.id)).toBe('deleted')
    expect((await getProducts()).length).toBe(0)
    expect(one('SELECT COUNT(*) n FROM products').n).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────
describe('supplierService', () => {
  it('adds, updates, lists and deletes suppliers', async () => {
    await addSupplier({ name: 'B Supplies', phone: '0788' })
    await addSupplier({ name: 'A Traders' })
    expect((await getSuppliers()).map(s => s.name)).toEqual(['A Traders', 'B Supplies'])
    const b = (await getSuppliers())[1]
    await updateSupplier(b.id, { name: 'B Supplies Ltd', contact: 'Jean', notes: 'Pays on Fridays' })
    expect(one('SELECT name, contact, notes, phone FROM suppliers WHERE id = ?', b.id))
      .toEqual({ name: 'B Supplies Ltd', contact: 'Jean', notes: 'Pays on Fridays', phone: null })
    expect(await deleteSupplier(b.id)).toBe('deleted')
    expect((await getSuppliers()).length).toBe(1)
  })

  it('archives a supplier used by a restock', async () => {
    await addSupplier({ name: 'Acme' })
    const s = one('SELECT id FROM suppliers').id
    const p = await product()
    await restockProduct({ product_id: p.id, product_name: p.name, quantity: 5, unit_cost: 500, supplier_id: s, supplier_name: 'Acme', date: todayLocal() })
    db.prepare('UPDATE products SET supplier_id = NULL').run()
    expect(await deleteSupplier(s)).toBe('archived')
    expect(await getSuppliers()).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────
describe('customerService', () => {
  it('shows orders, total spent and last visit — ignoring voided sales', async () => {
    const p = await product()
    const ann = await customer()
    await sell(p, 2, { customer: ann })
    const r = await sell(p, 1, { customer: ann })
    await voidSale(await getSaleById(r.saleId), 'test')
    const [c] = await getCustomers()
    expect(c).toMatchObject({ name: 'Ann', total_orders: 1, total_spent: 2000, balance: 0 })
    expect(c.last_visit).toBeTruthy()
  })

  it('calculates what everyone owes', async () => {
    const p = await product({ sell_price: 5000 })
    const ann = await customer('Ann')
    const bob = await customer('Bob')
    await sell(p, 2, { customer: ann, paymentMethod: 'Credit', amountPaid: 1000 })
    await sell(p, 1, { customer: bob, paymentMethod: 'Credit' })
    expect(await getTotalOwed()).toEqual({ owed: 14000, customers: 2 })
    await recordPayment({ customerId: bob.id, customerName: 'Bob', amount: 5000 })
    expect(await getTotalOwed()).toEqual({ owed: 9000, customers: 1 })
  })

  it('records payments with the cashier name, and can cancel them', async () => {
    setCurrentUser({ id: 2, name: 'Aline', role: 'cashier' })
    const p = await product({ sell_price: 5000 })
    const ann = await customer()
    await sell(p, 1, { customer: ann, paymentMethod: 'Credit' })
    await recordPayment({ customerId: ann.id, customerName: 'Ann', amount: 2000, paymentMethod: 'Mobile Money', reference: 'MP1', note: 'part' })
    const st = await getCustomerStatement(ann.id)
    expect(st.balance).toBe(3000)
    expect(st.credit).toHaveLength(1)
    expect(st.payments[0]).toMatchObject({ amount: 2000, payment_method: 'Mobile Money', reference: 'MP1', note: 'part', user_name: 'Aline' })
    await voidPayment(st.payments[0].id)
    expect((await getCustomerStatement(ann.id)).balance).toBe(5000)
    await expect(voidPayment(st.payments[0].id)).rejects.toMatch('already cancelled')
  })

  it('refuses zero or negative payments', async () => {
    const ann = await customer()
    await expect(recordPayment({ customerId: ann.id, customerName: 'Ann', amount: 0 })).rejects.toThrow('valid amount')
    await expect(recordPayment({ customerId: ann.id, customerName: 'Ann', amount: -5 })).rejects.toThrow('valid amount')
  })

  it('cannot take a payment from someone who owes nothing', async () => {
    const ann = await customer()
    await expect(recordPayment({ customerId: ann.id, customerName: 'Ann', amount: 100 })).rejects.toMatch('more than')
  })

  it('updates customer details including TIN', async () => {
    const ann = await customer()
    await updateCustomer(ann.id, { name: 'Ann U.', phone: '', tin: '123', email: 'a@b.rw', address: 'Kigali' })
    expect(one('SELECT name, phone, tin, email FROM customers')).toEqual({ name: 'Ann U.', phone: null, tin: '123', email: 'a@b.rw' })
  })

  it('archives a customer who only has payments', async () => {
    const p = await product({ sell_price: 5000 })
    const ann = await customer()
    await sell(p, 1, { customer: ann, paymentMethod: 'Credit' })
    expect(await deleteCustomer(ann.id)).toBe('archived')
    expect(await getCustomers()).toEqual([])
    const bob = await customer('Bob')
    expect(await deleteCustomer(bob.id)).toBe('deleted')
  })
})

// ─────────────────────────────────────────────────────────────
describe('salesService (reading and EBM)', () => {
  it('filters sales by LOCAL date and attaches their items', async () => {
    const p = await product()
    const a = await sell(p, 1)
    const b = await sell(p, 2)
    setSaleTime(a.saleId, '2026-10-10 10:00:00')
    setSaleTime(b.saleId, '2026-10-12 10:00:00')
    const oct10 = await getSales({ from: '2026-10-10', to: '2026-10-10' })
    expect(oct10.map(s => s.id)).toEqual([a.saleId])
    expect(oct10[0].items).toHaveLength(1)
    expect((await getSales({ from: '2026-10-11' })).map(s => s.id)).toEqual([b.saleId])
    expect((await getSales({ to: '2026-10-11' })).map(s => s.id)).toEqual([a.saleId])
    expect((await getSales()).map(s => s.id)).toEqual([b.saleId, a.saleId]) // newest first
  })

  it('getSaleById returns the sale with items, or null', async () => {
    const p = await product()
    const r = await sell(p, 3)
    const s = await getSaleById(r.saleId)
    expect(s.items[0]).toMatchObject({ product_name: 'Rice', quantity: 3 })
    expect(await getSaleById(9999)).toBe(null)
  })

  it('saves, changes and clears the EBM receipt number', async () => {
    const p = await product()
    const r = await sell(p)
    await setEbmReceiptNumber(r.saleId, '  EBM-1  ')
    expect(one('SELECT ebm_receipt_no FROM sales').ebm_receipt_no).toBe('EBM-1')
    await setEbmReceiptNumber(r.saleId, '')
    expect(one('SELECT ebm_receipt_no FROM sales').ebm_receipt_no).toBe(null)
    await expect(setEbmReceiptNumber(9999, 'X')).rejects.toBeTruthy()
  })

  it('records the signed-in person as the seller', async () => {
    setCurrentUser({ id: 5, name: 'Eric', role: 'cashier' })
    const p = await product()
    await sell(p)
    expect(one('SELECT user_name FROM sales').user_name).toBe('Eric')
  })

  it('gives up after 5 receipt-number clashes', async () => {
    const p = await product()
    let calls = 0
    const alwaysClash = async () => { calls++; throw 'UNIQUE constraint failed: sales.receipt_number' }
    await expect(completeSale([{ ...p, quantity: 1 }], { paymentMethod: 'Cash' }, alwaysClash)).rejects.toMatch('UNIQUE')
    expect(calls).toBe(5)
  })

  it('other errors are not retried', async () => {
    let calls = 0
    const broken = async () => { calls++; throw 'disk I/O error' }
    await expect(completeSale([{ id: 1, name: 'X', sell_price: 1, quantity: 1 }], {}, broken)).rejects.toMatch('disk')
    expect(calls).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────
describe('expenseService and transactionService', () => {
  it('filters expenses by date and shows how they were paid', async () => {
    await addExpense({ description: 'Rent Sep', category: 'Rent', amount: 100, date: '2026-09-01', payment_method: 'Bank Transfer' })
    await addExpense({ description: 'Rent Oct', category: 'Rent', amount: 100, date: '2026-10-01', payment_method: 'Cash' })
    const oct = await getExpenses({ from: '2026-10-01', to: '2026-10-31' })
    expect(oct.map(e => e.description)).toEqual(['Rent Oct'])
    expect(oct[0].payment_method).toBe('Cash')
    expect(oct[0].user_name).toBe('Owner')
    expect((await getExpenses()).map(e => e.description)).toEqual(['Rent Oct', 'Rent Sep'])
  })

  it('edits and deletes an expense together with its ledger entry', async () => {
    await addExpense({ description: 'Fuel', category: 'Transport', amount: 50, date: '2026-10-02' })
    const e = (await getExpenses())[0]
    await updateExpense(e.id, { ...e, amount: 75, payment_method: 'Mobile Money' })
    expect(one('SELECT amount, payment_method FROM transactions')).toEqual({ amount: 75, payment_method: 'Mobile Money' })
    await deleteExpense(e.id)
    expect(one('SELECT COUNT(*) n FROM transactions').n).toBe(0)
    expect(one('SELECT COUNT(*) n FROM expenses').n).toBe(0)
  })

  it('lists transactions by date with a matching summary', async () => {
    await addTransaction({ description: 'Tip', type: 'income', category: 'Other', amount: 300, date: '2026-10-05' })
    await addTransaction({ description: 'Bank fee', type: 'expense', category: 'Other', amount: 100, date: '2026-10-06', payment_method: 'Bank Transfer' })
    await addTransaction({ description: 'Old', type: 'income', category: 'Other', amount: 999, date: '2026-09-01' })
    const oct = { from: '2026-10-01', to: '2026-10-31' }
    expect((await getTransactions(oct)).map(t => t.description)).toEqual(['Bank fee', 'Tip'])
    expect(await getTransactionSummary(oct)).toEqual({ total_income: 300, total_expenses: 100, net: 200 })
    expect((await getTransactionSummary()).net).toBe(1199)
    expect(one(`SELECT user_name, payment_method FROM transactions WHERE description = 'Tip'`)).toEqual({ user_name: 'Owner', payment_method: 'Cash' })
  })

  it('an empty period has no totals', async () => {
    expect(await getTransactionSummary({ from: '2030-01-01', to: '2030-01-31' }))
      .toEqual({ total_income: null, total_expenses: null, net: null })
  })
})

// ─────────────────────────────────────────────────────────────
describe('restockService', () => {
  it('returns the new average cost and lists stock movements', async () => {
    const a = await product({ name: 'A', stock: 10, buy_price: 100 })
    const b = await product({ name: 'B' })
    const r = await restockProduct({ product_id: a.id, product_name: 'A', quantity: 10, unit_cost: 200, date: todayLocal() })
    expect(r).toEqual({ success: true, totalCost: 2000, newAverageCost: 150 })
    await restockProduct({ product_id: b.id, product_name: 'B', quantity: 1, unit_cost: 0, date: todayLocal() })
    expect((await getStockMovements(a.id)).map(m => m.product_name)).toEqual(['A'])
    expect((await getStockMovements()).length).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────
describe('plService and dashboardService', () => {
  it('groups top products by product (even after a rename) and lists expenses by category', async () => {
    const p = await product({ name: 'Old name', sell_price: 1000, buy_price: 400 })
    await sell(p, 2)
    db.prepare(`UPDATE products SET name = 'New name'`).run()
    await sell({ ...p, name: 'New name' }, 1)
    await addExpense({ description: 'Rent', category: 'Rent', amount: 500, date: todayLocal() })
    await addExpense({ description: 'Bus', category: 'Transport', amount: 800, date: todayLocal() })
    const r = await getPLReport({})
    expect(r.topProducts).toHaveLength(1)
    expect(r.topProducts[0]).toMatchObject({ total_qty: 3, total_revenue: 3000, total_cost: 1200, total_profit: 1800 })
    expect(r.expensesByCategory.map(e => e.category)).toEqual(['Transport', 'Rent'])
  })

  it('reports discounts given', async () => {
    const p = await product()
    await sell(p, 1, { discount: { type: 'amount', value: 150 } })
    expect((await getPLReport({})).discounts).toBe(150)
  })

  it('dashboard: today, this month, all time, debts, counts, low stock and recent activity', async () => {
    const rice = await product({ name: 'Rice', sell_price: 1000, buy_price: 600, stock: 5, low_stock_alert: 5 })
    await product({ name: 'Oil', stock: 0 })
    await product({ name: 'Plenty', stock: 100 })
    const ann = await customer()
    await sell(rice, 1)
    await sell(rice, 1, { customer: ann, paymentMethod: 'Credit', amountPaid: 200 })
    const old = await sell(rice, 1)
    setSaleTime(old.saleId, '2025-01-15 10:00:00') // last year
    await addExpense({ description: 'Rent', category: 'Rent', amount: 300, date: rangeFor('this_month').from })

    const d = await getDashboardData()
    expect(d.today).toEqual({ revenue: 2000, salesCount: 2, onCredit: 800 })
    expect(d.thisMonth).toMatchObject({ revenue: 2000, expenses: 300, netProfit: 2000 - 1200 - 300 })
    expect(d.allTime.revenue).toBe(3000)
    expect(d.owed).toEqual({ owed: 800, customers: 1 })
    expect(d.counts).toEqual({ customers: 1, products: 3, outOfStock: 1 })
    expect(d.lowStock.map(p => p.name)).toEqual(['Oil', 'Rice']) // lowest first; "Plenty" not listed
    expect(d.recentSales).toHaveLength(3)
    expect(d.recentTransactions.length).toBeGreaterThan(0)
  })
})
