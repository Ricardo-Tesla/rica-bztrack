import { getDb } from './db'
import { currentUserName } from '../utils/session'

function dateFilter(from, to) {
  const where = []
  const params = []
  if (from) { where.push('date >= ?'); params.push(from) }
  if (to) { where.push('date <= ?'); params.push(to) }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

// Transactions between two dates (YYYY-MM-DD, inclusive). No dates = all.
export async function getTransactions({ from = null, to = null } = {}) {
  const db = await getDb()
  const { clause, params } = dateFilter(from, to)
  return await db.select(`
    SELECT * FROM transactions ${clause}
    ORDER BY date DESC, created_at DESC
  `, params)
}

// Add a manual transaction
export async function addTransaction(transaction) {
  const db = await getDb()
  await db.execute(
    `INSERT INTO transactions
     (description, type, category, amount, payment_method, date, user_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction.description,
      transaction.type,
      transaction.category,
      parseFloat(transaction.amount),
      transaction.payment_method || 'Cash',
      transaction.date,
      currentUserName(),
    ]
  )
}

// Money in / out / net for the same period
export async function getTransactionSummary({ from = null, to = null } = {}) {
  const db = await getDb()
  const { clause, params } = dateFilter(from, to)
  const result = await db.select(`
    SELECT
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses,
      SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as net
    FROM transactions ${clause}
  `, params)
  return result[0]
}