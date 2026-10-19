import { getDb, runTransaction } from './db'

// Get all active suppliers (archived ones are hidden)
export async function getSuppliers() {
  const db = await getDb()
  return await db.select('SELECT * FROM suppliers WHERE archived = 0 ORDER BY name ASC')
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

// Delete a supplier — or archive it if products or restocks refer to it,
// so their history keeps the supplier name.
export function buildDeleteSupplierStatements(id) {
  const hasHistory = `(EXISTS (SELECT 1 FROM products WHERE supplier_id = ?)
                       OR EXISTS (SELECT 1 FROM stock_movements WHERE supplier_id = ?))`
  return [
    {
      sql: `UPDATE suppliers SET archived = 1 WHERE id = ? AND archived = 0 AND ${hasHistory}`,
      params: [id, id, id],
    },
    {
      sql: `DELETE FROM suppliers WHERE id = ? AND archived = 0 AND NOT ${hasHistory}`,
      params: [id, id, id],
    },
  ]
}

// Returns 'archived' or 'deleted'
export async function deleteSupplier(id) {
  const results = await runTransaction(buildDeleteSupplierStatements(id))
  return results[0].rowsAffected > 0 ? 'archived' : 'deleted'
}
