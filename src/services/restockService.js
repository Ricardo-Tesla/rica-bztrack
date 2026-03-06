import { getDb } from './db'

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

// Restock a product using weighted average cost
export async function restockProduct(restock) {
  const db = await getDb()

  const newQuantity = parseInt(restock.quantity)
  const newUnitCost = parseFloat(restock.unit_cost) || 0
  const totalCost = newUnitCost * newQuantity

  // Get current product stock and buy price
  const products = await db.select(
    'SELECT stock, buy_price FROM products WHERE id = ?',
    [restock.product_id]
  )
  const current = products[0]
  const currentStock = parseInt(current.stock) || 0
  const currentBuyPrice = parseFloat(current.buy_price) || 0

  // Weighted average cost formula:
  // (old stock × old price + new qty × new price) / total units
  let newAverageCost = currentBuyPrice
  if (newUnitCost > 0) {
    const totalUnits = currentStock + newQuantity
    const totalValue = (currentStock * currentBuyPrice) + (newQuantity * newUnitCost)
    newAverageCost = totalUnits > 0 ? totalValue / totalUnits : newUnitCost
    newAverageCost = parseFloat(newAverageCost.toFixed(2))
  }

  // Update stock and recalculate average buy price
  await db.execute(
    'UPDATE products SET stock = stock + ?, buy_price = ? WHERE id = ?',
    [newQuantity, newAverageCost, restock.product_id]
  )

  // Record stock movement
  await db.execute(
    `INSERT INTO stock_movements
     (product_id, product_name, type, quantity, unit_cost, total_cost, supplier_id, supplier_name, note, date)
     VALUES (?, ?, 'restock', ?, ?, ?, ?, ?, ?, ?)`,
    [
      restock.product_id,
      restock.product_name,
      newQuantity,
      newUnitCost,
      totalCost,
      restock.supplier_id || null,
      restock.supplier_name || null,
      restock.note || null,
      restock.date,
    ]
  )

  // Record as expense and transaction if cost is provided
  if (totalCost > 0) {
    const description = `Restock — ${restock.product_name} (${newQuantity} units @ $${newUnitCost})`

    const result = await db.execute(
      `INSERT INTO expenses (description, category, amount, date)
       VALUES (?, 'Stock Purchase', ?, ?)`,
      [description, totalCost, restock.date]
    )

    await db.execute(
      `INSERT INTO transactions
       (description, type, category, amount, payment_method, reference_id, date)
       VALUES (?, 'expense', 'Stock Purchase', ?, ?, ?, ?)`,
      [description, totalCost, restock.payment_method || 'Cash', result.lastInsertId, restock.date]
    )
  }

  return { success: true, totalCost, newAverageCost }
}