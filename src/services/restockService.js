import { getDb, runTransaction, ref } from './db'
import { formatMoney, roundQty } from '../utils/format'
import { allowsDecimal } from '../utils/constants'
import { currentUserName } from '../utils/session'
import { t } from '../i18n'

// Get all stock movements
export async function getStockMovements(productId = null) {
  const db = await getDb()
  if (productId) {
    return await db.select(
      'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC',
      [productId]
    )
  }
  return await db.select('SELECT * FROM stock_movements ORDER BY created_at DESC')
}

// Build the statements for one restock. They run as a single transaction.
//
// Accounting: stock you buy is INVENTORY, not an expense. Its cost goes into the
// product's weighted-average buy price and is counted as COGS when the items are
// sold (P&L and Dashboard). The payment is still logged in the Transactions
// ledger as money going out, so the cash view stays complete.
export function buildRestockStatements(restock) {
  const quantity = roundQty(parseFloat(restock.quantity))
  const unitCost = parseFloat(restock.unit_cost) || 0
  const totalCost = Math.round(unitCost * quantity * 100) / 100
  const userName = restock.user_name ?? currentUserName()

  if (!(quantity > 0)) throw new Error('Valid quantity is required')
  if (!allowsDecimal(restock.unit) && !Number.isInteger(quantity)) throw new Error('This product can only be stocked in whole units')
  if (unitCost < 0) throw new Error('Unit cost cannot be negative')

  const statements = [
    // 0 — add stock and recalculate the weighted average cost in ONE update:
    // (current stock × current cost + new qty × new cost) / total units
    // SQLite evaluates every SET expression with the row's OLD values.
    {
      sql: `UPDATE products SET
              buy_price = CASE WHEN ? > 0
                THEN ROUND((MAX(stock, 0) * buy_price + ? * ?) / (MAX(stock, 0) + ?), 2)
                ELSE buy_price END,
              stock = ROUND(stock + ?, 3)
            WHERE id = ?`,
      params: [unitCost, quantity, unitCost, quantity, quantity, restock.product_id],
      expectChanges: 1,
      errorMessage: t('Product not found — it may have been deleted.'),
    },
    // 1 — stock movement history
    {
      sql: `INSERT INTO stock_movements
            (product_id, product_name, type, quantity, unit_cost, total_cost, supplier_id, supplier_name, note, date, user_name)
            VALUES (?, ?, 'restock', ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        restock.product_id,
        restock.product_name,
        quantity,
        unitCost,
        totalCost,
        restock.supplier_id || null,
        restock.supplier_name || null,
        restock.note || null,
        restock.date,
        userName,
      ],
    },
  ]

  // 2 — money paid to the supplier (ledger only, NOT an expense)
  if (totalCost > 0) {
    statements.push({
      sql: `INSERT INTO transactions
            (description, type, category, amount, payment_method, reference_id, reference_type, date, user_name)
            VALUES (?, 'expense', 'Stock Purchase', ?, ?, ?, 'restock', ?, ?)`,
      params: [
        t('Restock — {name} ({qty} @ {cost})', { name: restock.product_name, qty: quantity, cost: formatMoney(unitCost) }),
        totalCost,
        restock.payment_method || 'Cash',
        ref(1),
        restock.date,
        userName,
      ],
    })
  }

  return { statements, totalCost }
}

// Restock a product using weighted average cost
export async function restockProduct(restock) {
  const { statements, totalCost } = buildRestockStatements(restock)
  await runTransaction(statements)

  const db = await getDb()
  const rows = await db.select('SELECT buy_price FROM products WHERE id = ?', [restock.product_id])
  const newAverageCost = rows.length ? parseFloat(rows[0].buy_price) : 0

  return { success: true, totalCost, newAverageCost }
}
