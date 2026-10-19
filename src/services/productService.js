import { getDb, runTransaction } from './db'
import { todayLocal } from '../utils/format'

// parseInt that keeps 0 (e.g. a low-stock alert of 0) instead of replacing it
function toInt(value, fallback) {
  const n = parseInt(value)
  return Number.isNaN(n) ? fallback : n
}

// Get all active products with supplier name joined (archived ones are hidden)
export async function getProducts() {
  const db = await getDb()
  return await db.select(`
    SELECT p.*, s.name as supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.archived = 0
    ORDER BY p.name ASC
  `)
}

// Add a product
export async function addProduct(product) {
  const db = await getDb()
  await db.execute(
    `INSERT INTO products
     (name, sku, category, unit, buy_price, sell_price, stock, low_stock_alert, supplier_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      product.name,
      product.sku,
      product.category || null,
      product.unit || null,
      parseFloat(product.buy_price) || 0,
      parseFloat(product.sell_price) || 0,
      toInt(product.stock, 0),
      toInt(product.low_stock_alert, 5),
      product.supplier_id || null,
    ]
  )
}

// Build the statements to update a product.
// `originalStock` is the stock when the edit form was opened. If a sale
// happened meanwhile, the update is refused instead of overwriting the stock.
// A changed stock number is recorded in the stock history as an adjustment.
export function buildUpdateProductStatements(id, product, originalStock) {
  const newStock = toInt(product.stock, 0)
  const oldStock = toInt(originalStock, 0)
  const buyPrice = parseFloat(product.buy_price) || 0

  const statements = [
    {
      sql: `UPDATE products SET
            name = ?, sku = ?, category = ?, unit = ?,
            buy_price = ?, sell_price = ?, stock = ?,
            low_stock_alert = ?, supplier_id = ?
            WHERE id = ? AND stock = ?`,
      params: [
        product.name,
        product.sku,
        product.category || null,
        product.unit || null,
        buyPrice,
        parseFloat(product.sell_price) || 0,
        newStock,
        toInt(product.low_stock_alert, 5),
        product.supplier_id || null,
        id,
        oldStock,
      ],
      expectChanges: 1,
      errorMessage: 'The stock changed while you were editing (probably a sale). Close this window, reopen the product and try again.',
    },
  ]

  const diff = newStock - oldStock
  if (diff !== 0) {
    statements.push({
      sql: `INSERT INTO stock_movements
            (product_id, product_name, type, quantity, unit_cost, total_cost, note, date)
            VALUES (?, ?, 'adjustment', ?, ?, 0, ?, ?)`,
      params: [id, product.name, diff, buyPrice, `Stock corrected from ${oldStock} to ${newStock}`, todayLocal()],
    })
  }

  return statements
}

// Update a product
export async function updateProduct(id, product, originalStock) {
  await runTransaction(buildUpdateProductStatements(id, product, originalStock))
}

// Delete a product — or archive it if it has sales or stock history.
// The SKU of an archived product gets a suffix so the code can be reused.
export function buildDeleteProductStatements(id) {
  const hasHistory = `(EXISTS (SELECT 1 FROM sale_items WHERE product_id = ?)
                       OR EXISTS (SELECT 1 FROM stock_movements WHERE product_id = ?))`
  return [
    {
      sql: `UPDATE products SET archived = 1, sku = sku || '~archived-' || id
            WHERE id = ? AND archived = 0 AND ${hasHistory}`,
      params: [id, id, id],
    },
    {
      sql: `DELETE FROM products WHERE id = ? AND archived = 0 AND NOT ${hasHistory}`,
      params: [id, id, id],
    },
  ]
}

// Returns 'archived' or 'deleted'
export async function deleteProduct(id) {
  const results = await runTransaction(buildDeleteProductStatements(id))
  return results[0].rowsAffected > 0 ? 'archived' : 'deleted'
}
