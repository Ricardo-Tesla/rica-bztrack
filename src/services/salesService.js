import { getDb, runTransaction, ref } from './db'
import { generateReceiptNumber } from '../utils/calculations'
import { todayLocal, roundMoney, roundQty, formatQty, customerLabel } from '../utils/format'
import { allowsDecimal, CREDIT } from '../utils/constants'
import { currentUserName } from '../utils/session'
import { errorWithVars } from '../utils/errors'
import { t } from '../i18n'

const MAX_RECEIPT_ATTEMPTS = 5

// ── Totals ───────────────────────────────────────────────
// All the money numbers of a cart, in one place (used by the till and by the
// statements below, so the screen and the saved sale always agree).
//   discount:  { type: 'amount' | 'percent', value }
//   vatRate:   e.g. 18 (prices INCLUDE VAT); 0 when the shop is not VAT-registered
export function calculateTotals(cart, { discount = null, vatRate = 0 } = {}) {
  const lines = cart.map(item => ({
    ...item,
    quantity: roundQty(item.quantity),
    lineTotal: roundMoney(item.sell_price * item.quantity),
    vatRate: vatRate > 0 && !item.vat_exempt ? vatRate : 0,
  }))
  const subtotal = roundMoney(lines.reduce((a, l) => a + l.lineTotal, 0))

  let discountAmount = 0
  if (discount && Number(discount.value) > 0) {
    discountAmount = discount.type === 'percent'
      ? subtotal * Math.min(100, Number(discount.value)) / 100
      : Number(discount.value)
  }
  discountAmount = roundMoney(Math.min(subtotal, Math.max(0, discountAmount)))
  const total = roundMoney(subtotal - discountAmount)

  // VAT included in the prices; a sale discount reduces it proportionally
  const factor = subtotal > 0 ? total / subtotal : 0
  const vat = roundMoney(lines.reduce((a, l) => a + (l.vatRate ? l.lineTotal * factor * l.vatRate / (100 + l.vatRate) : 0), 0))

  return { lines, subtotal, discountAmount, total, vat }
}

// Cart checks before saving (stock is checked again by the database)
export function validateCart(cart) {
  if (!cart || cart.length === 0) return 'Cart is empty'
  for (const item of cart) {
    const q = Number(item.quantity)
    if (!(q > 0)) return errorWithVars('{name} has an invalid quantity', { name: item.name })
    if (!allowsDecimal(item) && !Number.isInteger(q)) {
      return errorWithVars('{name} can only be sold in whole units', { name: item.name })
    }
  }
  return null
}

// ── Saving a sale ────────────────────────────────────────
// options: {
//   customer, paymentMethod, receiptNumber,
//   discount, vatRate,
//   paymentReference,            // MoMo / card / bank reference
//   amountPaid, paidNowMethod,   // credit sales: what was paid today, and how
//   userName
// }
// All statements run as ONE transaction: sale, items, stock, and the money
// received are saved together or not at all.
export function buildSaleStatements(cart, options) {
  const {
    customer = null, paymentMethod = 'Cash', receiptNumber,
    discount = null, vatRate = 0, paymentReference = '',
    amountPaid = null, paidNowMethod = 'Cash', userName = null,
  } = options
  const { lines, subtotal, discountAmount, total, vat } = calculateTotals(cart, { discount, vatRate })
  const isCredit = paymentMethod === CREDIT
  const customerName = customer ? customer.name : 'Walk-in Customer'
  const customerId = customer ? customer.id : null

  if (isCredit && !customer) throw new Error('Choose a customer for a credit sale')
  const paid = isCredit ? roundMoney(Math.min(total, Math.max(0, Number(amountPaid) || 0))) : total

  const statements = [
    // 0 — the sale header (its new id is used by the statements below)
    {
      sql: `INSERT INTO sales
            (receipt_number, customer_id, customer_name, subtotal, tax, discount, total,
             payment_method, amount_paid, payment_reference, user_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [receiptNumber, customerId, customerName, subtotal, vat, discountAmount, total,
        paymentMethod, paid, paymentReference || null, userName],
    },
  ]

  for (const item of lines) {
    // Deduct stock ONLY if there is enough. If not, 0 rows change and the
    // whole sale is cancelled with a clear message.
    statements.push({
      sql: 'UPDATE products SET stock = ROUND(stock - ?, 3) WHERE id = ? AND stock + 0.0005 >= ?',
      params: [item.quantity, item.id, item.quantity],
      expectChanges: 1,
      errorMessage: t('Not enough stock for "{name}". The stock list has been refreshed — please check the cart and try again.', { name: item.name }),
    })

    // Sale line. The buy price (for profit / COGS) is read from the database
    // so it always uses the latest weighted-average cost.
    statements.push({
      sql: `INSERT INTO sale_items
            (sale_id, product_id, product_name, quantity, unit_price, buy_price, subtotal, vat_rate)
            VALUES (?, ?, ?, ?, ?, COALESCE((SELECT buy_price FROM products WHERE id = ?), ?), ?, ?)`,
      params: [ref(0), item.id, item.name, item.quantity, item.sell_price, item.id,
        item.buy_price || 0, item.lineTotal, item.vatRate],
    })
  }

  // Money received today goes in the cash ledger (all of it, or for a credit
  // sale only what was paid now; the rest is recorded when the customer pays).
  if (paid > 0) {
    statements.push({
      sql: `INSERT INTO transactions
            (description, type, category, amount, payment_method, reference_id, reference_type, date, user_name)
            VALUES (?, 'income', 'Sales', ?, ?, ?, 'sale', DATE('now', 'localtime'), ?)`,
      params: [
        isCredit
          ? t('Credit sale #{r} — {name} (paid now)', { r: receiptNumber, name: customerLabel(customerName, t) })
          : t('Sale #{r} — {name}', { r: receiptNumber, name: customerLabel(customerName, t) }),
        paid, isCredit ? paidNowMethod : paymentMethod, ref(0), userName,
      ],
    })
  }

  return { statements, total, subtotal, discountAmount, vat, amountPaid: paid, customerName }
}

function isReceiptClash(err) {
  return String(err).includes('UNIQUE constraint failed: sales.receipt_number')
}

// Complete a sale. Returns { saleId, receiptNumber, total, ... }
export async function completeSale(cart, options = {}, run = runTransaction) {
  const problem = validateCart(cart)
  if (problem) throw typeof problem === 'string' ? new Error(problem) : problem

  for (let attempt = 1; ; attempt++) {
    const receiptNumber = generateReceiptNumber()
    const built = buildSaleStatements(cart, { userName: currentUserName(), ...options, receiptNumber })
    try {
      const results = await run(built.statements)
      return { saleId: results[0].lastInsertId, receiptNumber, ...built, statements: undefined }
    } catch (err) {
      // Extremely rare: the random receipt number already exists. Try a new one.
      if (isReceiptClash(err) && attempt < MAX_RECEIPT_ATTEMPTS) continue
      throw err
    }
  }
}

// ── Reading sales ────────────────────────────────────────
export function attachItems(sales, items) {
  const bySale = new Map()
  for (const item of items) {
    if (!bySale.has(item.sale_id)) bySale.set(item.sale_id, [])
    bySale.get(item.sale_id).push(item)
  }
  for (const sale of sales) sale.items = bySale.get(sale.id) || []
  return sales
}

// Sales between two LOCAL dates (YYYY-MM-DD, inclusive). No dates = all.
// Two queries in total, however many sales.
export async function getSales({ from = null, to = null } = {}) {
  const db = await getDb()
  const where = []
  const params = []
  if (from) { where.push(`DATE(created_at, 'localtime') >= ?`); params.push(from) }
  if (to) { where.push(`DATE(created_at, 'localtime') <= ?`); params.push(to) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const sales = await db.select(`SELECT * FROM sales ${clause} ORDER BY created_at DESC`, params)
  const items = await db.select(
    `SELECT si.* FROM sale_items si JOIN sales s ON s.id = si.sale_id ${clause.replaceAll('created_at', 's.created_at')} ORDER BY si.id`,
    params
  )
  return attachItems(sales, items)
}

export async function getSaleById(id) {
  const db = await getDb()
  const sales = await db.select('SELECT * FROM sales WHERE id = ?', [id])
  if (!sales.length) return null
  const sale = sales[0]
  sale.items = await db.select('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [id])
  return sale
}

// Record the official EBM receipt number for a sale (owner)
export async function setEbmReceiptNumber(saleId, ebmNumber) {
  await runTransaction([{
    sql: 'UPDATE sales SET ebm_receipt_no = ? WHERE id = ?',
    params: [String(ebmNumber || '').trim() || null, saleId],
    expectChanges: 1,
  }])
}

// ── Voiding ──────────────────────────────────────────────
// Void (cancel) a sale, all in one transaction:
// - the sale is marked 'voided' (Dashboard, P&L and customer totals ignore it)
// - every item goes back into stock, recorded in the stock history as a return
// - money that was received is logged as a refund (money out)
//   (for a credit sale, only what was paid at the time of sale)
export function buildVoidSaleStatements(sale, reason = '', userName = null) {
  const today = todayLocal()
  const note = t('Sale #{r} voided', { r: sale.receipt_number }) + (reason ? ` — ${reason}` : '')
  const refund = roundMoney(sale.amount_paid ?? sale.total)

  const statements = [
    {
      sql: `UPDATE sales SET status = 'voided', voided_at = datetime('now'), voided_by = ?, void_reason = ?
            WHERE id = ? AND status = 'completed'`,
      params: [userName, reason || null, sale.id],
      expectChanges: 1,
      errorMessage: t('This sale has already been voided.'),
    },
  ]

  for (const item of sale.items || []) {
    statements.push({
      sql: 'UPDATE products SET stock = ROUND(stock + ?, 3) WHERE id = ?',
      params: [item.quantity, item.product_id],
    })
    statements.push({
      sql: `INSERT INTO stock_movements
            (product_id, product_name, type, quantity, unit_cost, total_cost, note, date, user_name)
            VALUES (?, ?, 'return', ?, ?, 0, ?, ?, ?)`,
      params: [item.product_id, item.product_name, item.quantity, item.buy_price || 0, note, today, userName],
    })
  }

  if (refund > 0) {
    statements.push({
      sql: `INSERT INTO transactions
            (description, type, category, amount, payment_method, reference_id, reference_type, date, user_name)
            VALUES (?, 'expense', 'Refund', ?, ?, ?, 'sale_void', ?, ?)`,
      params: [`${t('Refund')} — ${note}`, refund, sale.payment_method === CREDIT ? 'Cash' : (sale.payment_method || 'Cash'),
        sale.id, today, userName],
    })
  }

  return statements
}

export async function voidSale(sale, reason = '', run = runTransaction) {
  await run(buildVoidSaleStatements(sale, reason, currentUserName()))
}

// Text for a quantity with its unit, e.g. "1.5 kg"
export function qtyLabel(quantity, unit) {
  const u = { Kg: 'kg', Litre: 'L', Metre: 'm' }[unit]
  return u ? `${formatQty(quantity)} ${u}` : formatQty(quantity)
}
