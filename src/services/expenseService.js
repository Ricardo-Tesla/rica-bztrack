import { getDb } from './db'

const EXPENSE_CATEGORIES = [
  'Rent', 'Salary', 'Utilities', 'Marketing',
  'Transport', 'Stock Purchase', 'Maintenance', 'Other'
]

export { EXPENSE_CATEGORIES }

// Get all expenses
export async function getExpenses() {
  const db = await getDb()
  return await db.select('SELECT * FROM expenses ORDER BY date DESC')
}

// Add an expense
export async function addExpense(expense) {
  const db = await getDb()

  // Save the expense
  const result = await db.execute(
    `INSERT INTO expenses (description, category, amount, date)
     VALUES (?, ?, ?, ?)`,
    [
      expense.description,
      expense.category,
      parseFloat(expense.amount),
      expense.date,
    ]
  )

  // Auto create a transaction record
  await db.execute(
    `INSERT INTO transactions (description, type, category, amount, payment_method, reference_id, date)
     VALUES (?, 'expense', ?, ?, ?, ?, ?)`,
    [
      expense.description,
      expense.category,
      parseFloat(expense.amount),
      expense.payment_method || 'Cash',
      result.lastInsertId,
      expense.date,
    ]
  )
}

// Delete an expense
export async function deleteExpense(id) {
  const db = await getDb()
  await db.execute('DELETE FROM expenses WHERE id = ?', [id])
  await db.execute('DELETE FROM transactions WHERE reference_id = ? AND type = "expense"', [id])
}