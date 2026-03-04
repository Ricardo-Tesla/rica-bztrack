import { getDb } from './db'

// Get all transactions
export async function getTransactions() {
  const db = await getDb()
  return await db.select(`
    SELECT * FROM transactions
    ORDER BY date DESC, created_at DESC
  `)
}

// Add a manual transaction
export async function addTransaction(transaction) {
  const db = await getDb()
  await db.execute(
    `INSERT INTO transactions
     (description, type, category, amount, payment_method, date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      transaction.description,
      transaction.type,
      transaction.category,
      parseFloat(transaction.amount),
      transaction.payment_method || 'Cash',
      transaction.date,
    ]
  )
}

// Get transaction summary
export async function getTransactionSummary() {
  const db = await getDb()
  const result = await db.select(`
    SELECT
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses,
      SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as net
    FROM transactions
  `)
  return result[0]
}