import { getDb, runTransaction, ref } from './db'

// Categories offered when adding an expense.
// "Stock Purchase" is intentionally not here: buying stock is recorded with
// Products → Restock, and its cost is counted as COGS when the items sell.
// Adding it here as well would count the same money twice.
const EXPENSE_CATEGORIES = [
  'Rent', 'Salary', 'Utilities', 'Marketing',
  'Transport', 'Maintenance', 'Other'
]

export { EXPENSE_CATEGORIES }

// Get all expenses
export async function getExpenses() {
  const db = await getDb()
  return await db.select('SELECT * FROM expenses ORDER BY date DESC')
}

export function buildAddExpenseStatements(expense) {
  const amount = parseFloat(expense.amount)
  return [
    // 0 — the expense
    {
      sql: `INSERT INTO expenses (description, category, amount, date)
            VALUES (?, ?, ?, ?)`,
      params: [expense.description, expense.category, amount, expense.date],
    },
    // 1 — matching ledger entry
    {
      sql: `INSERT INTO transactions
            (description, type, category, amount, payment_method, reference_id, reference_type, date)
            VALUES (?, 'expense', ?, ?, ?, ?, 'expense', ?)`,
      params: [
        expense.description,
        expense.category,
        amount,
        expense.payment_method || 'Cash',
        ref(0),
        expense.date,
      ],
    },
  ]
}

export function buildDeleteExpenseStatements(id) {
  return [
    {
      sql: `DELETE FROM transactions WHERE reference_type = 'expense' AND reference_id = ?`,
      params: [id],
    },
    {
      sql: 'DELETE FROM expenses WHERE id = ?',
      params: [id],
    },
  ]
}

// Add an expense (and its transaction record) — both or neither are saved
export async function addExpense(expense) {
  await runTransaction(buildAddExpenseStatements(expense))
}

// Delete an expense (and its transaction record) — both or neither are removed
export async function deleteExpense(id) {
  await runTransaction(buildDeleteExpenseStatements(id))
}
