import { getDb } from './db'

// Generate a unique receipt number
function generateReceiptNumber() {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const time = now.getTime().toString().slice(-4)
  return `RCT-${date}-${time}`
}

// Complete a sale — saves sale + items + deducts stock + logs transaction
export async function completeSale(cart, customer, paymentMethod) {
  const db = await getDb()

  const subtotal = cart.reduce((a, item) => a + item.sell_price * item.quantity, 0)
  const total = subtotal
  const receiptNumber = generateReceiptNumber()
  const customerName = customer ? customer.name : 'Walk-in Customer'
  const customerId = customer ? customer.id : null

  // Insert the sale header
  const result = await db.execute(
    `INSERT INTO sales
     (receipt_number, customer_id, customer_name, subtotal, tax, discount, total, payment_method)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    [receiptNumber, customerId, customerName, subtotal, total, paymentMethod]
  )

  const saleId = result.lastInsertId

  // Insert each sale item and deduct stock
  for (const item of cart) {
    await db.execute(
      `INSERT INTO sale_items
       (sale_id, product_id, product_name, quantity, unit_price, buy_price, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        saleId,
        item.id,
        item.name,
        item.quantity,
        item.sell_price,
        item.buy_price,
        item.sell_price * item.quantity,
      ]
    )

    // Deduct stock
    await db.execute(
      'UPDATE products SET stock = stock - ? WHERE id = ?',
      [item.quantity, item.id]
    )
  }

  // Auto log as income transaction
  await db.execute(
    `INSERT INTO transactions
     (description, type, category, amount, payment_method, reference_id, date)
     VALUES (?, 'income', 'Sales', ?, ?, ?, DATE('now'))`,
    [
      `Sale #${receiptNumber} — ${customerName}`,
      total,
      paymentMethod,
      saleId,
    ]
  )

  return { saleId, receiptNumber, total, customerName }
}

// Get all sales with their items
export async function getSales() {
  const db = await getDb()
  const sales = await db.select(`
    SELECT * FROM sales
    ORDER BY created_at DESC
  `)

  // Attach items to each sale
  for (const sale of sales) {
    sale.items = await db.select(
      'SELECT * FROM sale_items WHERE sale_id = ?',
      [sale.id]
    )
  }

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