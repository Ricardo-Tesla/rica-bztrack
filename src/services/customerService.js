import { getDb, runTransaction } from './db'

// Get all active customers with total purchases calculated
export async function getCustomers() {
  const db = await getDb()
  return await db.select(`
    SELECT
      c.*,
      COUNT(s.id) as total_orders,
      COALESCE(SUM(s.total), 0) as total_spent,
      MAX(s.created_at) as last_visit
    FROM customers c
    LEFT JOIN sales s ON c.id = s.customer_id AND s.status = 'completed'
    WHERE c.archived = 0
    GROUP BY c.id
    ORDER BY c.name ASC
  `)
}

// Add a customer
export async function addCustomer(customer) {
  const db = await getDb()
  await db.execute(
    `INSERT INTO customers (name, phone, email, address)
     VALUES (?, ?, ?, ?)`,
    [
      customer.name,
      customer.phone || null,
      customer.email || null,
      customer.address || null,
    ]
  )
}

// Update a customer
export async function updateCustomer(id, customer) {
  const db = await getDb()
  await db.execute(
    `UPDATE customers SET
     name = ?, phone = ?, email = ?, address = ?
     WHERE id = ?`,
    [
      customer.name,
      customer.phone || null,
      customer.email || null,
      customer.address || null,
      id,
    ]
  )
}

// Delete a customer — or archive them if they have sales, so old sales and
// totals stay complete.
export function buildDeleteCustomerStatements(id) {
  const hasHistory = 'EXISTS (SELECT 1 FROM sales WHERE customer_id = ?)'
  return [
    {
      sql: `UPDATE customers SET archived = 1 WHERE id = ? AND archived = 0 AND ${hasHistory}`,
      params: [id, id],
    },
    {
      sql: `DELETE FROM customers WHERE id = ? AND archived = 0 AND NOT ${hasHistory}`,
      params: [id, id],
    },
  ]
}

// Returns 'archived' or 'deleted'
export async function deleteCustomer(id) {
  const results = await runTransaction(buildDeleteCustomerStatements(id))
  return results[0].rowsAffected > 0 ? 'archived' : 'deleted'
}
