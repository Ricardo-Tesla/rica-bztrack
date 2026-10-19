import { getDb, runTransaction, ref } from './db'
import { generateReceiptNumber, validateSale } from '../utils/calculations'
import { todayLocal } from '../utils/format'

const MAX_RECEIPT_ATTEMPTS = 5

function round2(n) {
  return Math.round(n * 100) / 100
}

// Build the statements that save one sale. They run as a single transaction:
// either the sale, its items, the stock deductions and the income entry are
// ALL saved, or none of them are.
export function buildSaleStatements(cart, customer, paymentMethod, receiptNumber) {
  const subtotal = round2(cart.reduce((a, item) => a + item.sell_price * item.quantity, 0))
  const total = subtotal
  const customerName = customer ? customer.name : 'Walk-in Customer'
  const customerId = customer ? customer.id : null

  const statements = [
    // 0 — the sale header (its new id is used by the statements below)
    {
      sql: `INSERT INTO sales
            (receipt_number, customer_id, customer_name, subtotal, tax, discount, total, payment_method)
            VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      params: [receiptNumber, customerId, customerName, subtotal, total, paymentMethod],
    },
  ]

  for (const item of cart) {
    // Deduct stock ONLY if there is enough. If not, 0 rows change and the
    // whole sale is cancelled with a clear message.
    statements.push({
      sql: 'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
      params: [item.quantity, item.id, item.quantity],
      expectChanges: 1,
      errorMessage: `Not enough stock for "${item.name}". The stock list has been refreshed — please check the cart and try again.`,
    })

    // Sale line. The buy price (for profit / COGS) is read from the database
    // so it always uses the latest weighted-average cost.
    statements.push({
      sql: `INSERT INTO sale_items
            (sale_id, product_id, product_name, quantity, unit_price, buy_price, subtotal)
            VALUES (?, ?, ?, ?, ?, COALESCE((SELECT buy_price FROM products WHERE id = ?), ?), ?)`,
      params: [
        ref(0),
        item.id,
        item.name,
        item.quantity,
        item.sell_price,
        item.id,
        item.buy_price || 0,
        round2(item.sell_price * item.quantity),
      ],
    })
  }

  // Income entry in the ledger
  statements.push({
    sql: `INSERT INTO transactions
          (description, type, category, amount, payment_method, reference_id, reference_type, date)
          VALUES (?, 'income', 'Sales', ?, ?, ?, 'sale', DATE('now', 'localtime'))`,
    params: [`Sale #${receiptNumber} — ${customerName}`, total, paymentMethod, ref(0)],
  })

  return { statements, total, customerName }
}

function isReceiptClash(err) {
  return String(err).includes('UNIQUE constraint failed: sales.receipt_number')
}

// Complete a sale — saves sale + items + deducts stock + logs transaction,
// all in one transaction.
export async function completeSale(cart, customer, paymentMethod, run = runTransaction) {
  const errors = validateSale(cart).filter(e => !e.includes('exceeds available stock'))
  if (errors.length) throw new Error(errors[0])

  for (let attempt = 1; ; attempt++) {
    const receiptNumber = generateReceiptNumber()
    const { statements, total, customerName } =
      buildSaleStatements(cart, customer, paymentMethod, receiptNumber)

    try {
      const results = await run(statements)
      return { saleId: results[0].lastInsertId, receiptNumber, total, customerName }
    } catch (err) {
      // Extremely rare: the random receipt number already exists. Try a new one.
      if (isReceiptClash(err) && attempt < MAX_RECEIPT_ATTEMPTS) continue
      throw err
    }
  }
}

// Get all sales with their items — two queries in total, however many sales
export async function getSales() {
  const db = await getDb()
  const sales = await db.select(`
    SELECT * FROM sales
    ORDER BY created_at DESC
  `)
  const items = await db.select('SELECT * FROM sale_items ORDER BY id')
  return attachItems(sales, items)
}

export function attachItems(sales, items) {
  const bySale = new Map()
  for (const item of items) {
    if (!bySale.has(item.sale_id)) bySale.set(item.sale_id, [])
    bySale.get(item.sale_id).push(item)
  }
  for (const sale of sales) sale.items = bySale.get(sale.id) || []
  return sales
}

// Get a single sale by id
export async function getSaleById(id) {
  const db = await getDb()
  const sales = await db.select('SELECT * FROM sales WHERE id = ?', [id])
  if (!sales.length) return null
  const sale = sales[0]
  sale.items = await db.select(
    'SELECT * FROM sale_items WHERE sale_id = ?',
    [id]
  )
  return sale
}

// Void (cancel) a sale, all in one transaction:
// - the sale is marked 'voided' (Dashboard, P&L and customer totals ignore it)
// - every item goes back into stock, recorded in the stock history as a return
// - the refund is logged in Transactions as money out
export function buildVoidSaleStatements(sale, reason = '') {
  const today = todayLocal()
  const note = `Sale #${sale.receipt_number} voided${reason ? ` — ${reason}` : ''}`

  const statements = [
    {
      sql: `UPDATE sales SET status = 'voided' WHERE id = ? AND status = 'completed'`,
      params: [sale.id],
      expectChanges: 1,
      errorMessage: 'This sale has already been voided.',
    },
  ]

  for (const item of sale.items || []) {
    statements.push({
      sql: 'UPDATE products SET stock = stock + ? WHERE id = ?',
      params: [item.quantity, item.product_id],
    })
    statements.push({
      sql: `INSERT INTO stock_movements
            (product_id, product_name, type, quantity, unit_cost, total_cost, note, date)
            VALUES (?, ?, 'return', ?, ?, 0, ?, ?)`,
      params: [item.product_id, item.product_name, item.quantity, item.buy_price || 0, note, today],
    })
  }

  statements.push({
    sql: `INSERT INTO transactions
          (description, type, category, amount, payment_method, reference_id, reference_type, date)
          VALUES (?, 'expense', 'Refund', ?, ?, ?, 'sale_void', ?)`,
    params: [`Refund — ${note}`, sale.total, sale.payment_method || 'Cash', sale.id, today],
  })

  return statements
}

export async function voidSale(sale, reason = '', run = runTransaction) {
  await run(buildVoidSaleStatements(sale, reason))
}
