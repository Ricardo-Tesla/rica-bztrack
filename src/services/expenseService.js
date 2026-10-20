import { getDb, runTransaction, ref } from './db'
import { currentUserName } from '../utils/session'
import { t } from '../i18n'

import { EXPENSE_CATEGORIES } from '../utils/constants'

export { EXPENSE_CATEGORIES }

// Expenses between two dates (YYYY-MM-DD, inclusive), with the payment method
// from the linked transaction. No dates = all.
export async function getExpenses({ from = null, to = null } = {}) {
  const db = await getDb()
  const where = []
  const params = []
  if (from) { where.push('e.date >= ?'); params.push(from) }
  if (to) { where.push('e.date <= ?'); params.push(to) }
  return await db.select(`
    SELECT e.*, t.payment_method
    FROM expenses e
    LEFT JOIN transactions t ON t.reference_type = 'expense' AND t.reference_id = e.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.date DESC, e.id DESC
  `, params)
}

export function buildAddExpenseStatements(expense) {
  const amount = parseFloat(expense.amount)
  return [
    // 0 — the expense
    {
      sql: `INSERT INTO expenses (description, category, amount, date, user_name)
            VALUES (?, ?, ?, ?, ?)`,
      params: [expense.description, expense.category, amount, expense.date, currentUserName()],
    },
    // 1 — matching ledger entry
    {
      sql: `INSERT INTO transactions
            (description, type, category, amount, payment_method, reference_id, reference_type, date, user_name)
            VALUES (?, 'expense', ?, ?, ?, ?, 'expense', ?, ?)`,
      params: [
        expense.description,
        expense.category,
        amount,
        expense.payment_method || 'Cash',
        ref(0),
        expense.date,
        currentUserName(),
      ],
    },
  ]
}

// Update an expense and its ledger entry together
export function buildUpdateExpenseStatements(id, expense) {
  const amount = parseFloat(expense.amount)
  return [
    {
      sql: `UPDATE expenses SET description = ?, category = ?, amount = ?, date = ? WHERE id = ?`,
      params: [expense.description, expense.category, amount, expense.date, id],
      expectChanges: 1,
      errorMessage: t('This expense no longer exists.'),
    },
    {
      sql: `UPDATE transactions SET description = ?, category = ?, amount = ?, payment_method = ?, date = ?
            WHERE reference_type = 'expense' AND reference_id = ?`,
      params: [expense.description, expense.category, amount, expense.payment_method || 'Cash', expense.date, id],
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

// Update an expense (and its transaction record) — both or neither are changed
export async function updateExpense(id, expense) {
  await runTransaction(buildUpdateExpenseStatements(id, expense))
}

// Delete an expense (and its transaction record) — both or neither are removed
export async function deleteExpense(id) {
  await runTransaction(buildDeleteExpenseStatements(id))
}
