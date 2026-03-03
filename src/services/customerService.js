import { getDb } from './db'

// Get all customers with total purchases calculated
export async function getCustomers() {
  const db = await getDb()
  return await db.select(`
    SELECT 
      c.*,
      COUNT(s.id) as total_orders,
      COALESCE(SUM(s.total), 0) as total_spent,
      MAX(s.created_at) as last_visit
    FROM customers c
    LEFT JOIN sales s ON c.id = s.customer_id
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

// Delete a customer
export async function deleteCustomer(id) {
  const db = await getDb()
  await db.execute('DELETE FROM customers WHERE id = ?', [id])
}