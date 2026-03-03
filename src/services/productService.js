import { getDb } from './db'

// Get all products with supplier name joined
export async function getProducts() {
  const db = await getDb()
  return await db.select(`
    SELECT p.*, s.name as supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
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
      parseInt(product.stock) || 0,
      parseInt(product.low_stock_alert) || 5,
      product.supplier_id || null,
    ]
  )
}

// Update a product
export async function updateProduct(id, product) {
  const db = await getDb()
  await db.execute(
    `UPDATE products SET
     name = ?, sku = ?, category = ?, unit = ?,
     buy_price = ?, sell_price = ?, stock = ?,
     low_stock_alert = ?, supplier_id = ?
     WHERE id = ?`,
    [
      product.name,
      product.sku,
      product.category || null,
      product.unit || null,
      parseFloat(product.buy_price) || 0,
      parseFloat(product.sell_price) || 0,
      parseInt(product.stock) || 0,
      parseInt(product.low_stock_alert) || 5,
      product.supplier_id || null,
      id,
    ]
  )
}

// Delete a product
export async function deleteProduct(id) {
  const db = await getDb()
  await db.execute('DELETE FROM products WHERE id = ?', [id])
}