import { getDb } from './db'

// Get all suppliers
export async function getSuppliers() {
  const db = await getDb()
  return await db.select('SELECT * FROM suppliers ORDER BY name ASC')
}

// Add a supplier
export async function addSupplier(supplier) {
  const db = await getDb()
  await db.execute(
    `INSERT INTO suppliers (name, contact, phone, email, address, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      supplier.name,
      supplier.contact || null,
      supplier.phone || null,
      supplier.email || null,
      supplier.address || null,
      supplier.notes || null,
    ]
  )
}

// Delete a supplier
export async function deleteSupplier(id) {
  const db = await getDb()
  await db.execute('DELETE FROM suppliers WHERE id = ?', [id])
}