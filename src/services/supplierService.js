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

// Update a supplier
export async function updateSupplier(id, supplier) {
  const db = await getDb()
  await db.execute(
    `UPDATE suppliers SET
     name = ?, contact = ?, phone = ?, email = ?, address = ?, notes = ?
     WHERE id = ?`,
    [
      supplier.name,
      supplier.contact || null,
      supplier.phone || null,
      supplier.email || null,
      supplier.address || null,
      supplier.notes || null,
      id,
    ]
  )
}

// Delete a supplier
export async function deleteSupplier(id) {
  const db = await getDb()
  await db.execute('DELETE FROM suppliers WHERE id = ?', [id])
}