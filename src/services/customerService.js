import { getDb, runTransaction, ref } from './db'
import { todayLocal, roundMoney } from '../utils/format'
import { currentUserName } from '../utils/session'
import { t } from '../i18n'

// What a customer owes (ideni):
//   unpaid part of their completed credit sales − their repayments
// A negative balance means the shop owes the customer (e.g. a credit sale was
// voided after the customer had paid part of it).
export const balanceSql = customerIdExpr => `(
  COALESCE((SELECT SUM(s.total - COALESCE(s.amount_paid, s.total)) FROM sales s
            WHERE s.customer_id = ${customerIdExpr} AND s.status = 'completed' AND s.payment_method = 'Credit'), 0)
  - COALESCE((SELECT SUM(p.amount) FROM customer_payments p
              WHERE p.customer_id = ${customerIdExpr} AND p.voided = 0), 0)
)`

// Get all active customers with purchase totals and what they owe
export async function getCustomers() {
  const db = await getDb()
  return await db.select(`
    SELECT
      c.*,
      COUNT(s.id) as total_orders,
      COALESCE(SUM(s.total), 0) as total_spent,
      MAX(s.created_at) as last_visit,
      ${balanceSql('c.id')} as balance
    FROM customers c
    LEFT JOIN sales s ON c.id = s.customer_id AND s.status = 'completed'
    WHERE c.archived = 0
    GROUP BY c.id
    ORDER BY c.name ASC
  `)
}

// Total owed to the shop by all customers (only positive balances)
export async function getTotalOwed() {
  const db = await getDb()
  const rows = await db.select(`
    SELECT COALESCE(SUM(CASE WHEN b > 0 THEN b ELSE 0 END), 0) AS owed, COUNT(CASE WHEN b > 0.5 THEN 1 END) AS customers
    FROM (SELECT ${balanceSql('c.id')} AS b FROM customers c)
  `)
  return { owed: parseFloat(rows[0]?.owed) || 0, customers: parseInt(rows[0]?.customers) || 0 }
}

// Add a customer
export async function addCustomer(customer) {
  const db = await getDb()
  await db.execute(
    `INSERT INTO customers (name, phone, email, address, tin)
     VALUES (?, ?, ?, ?, ?)`,
    [
      customer.name,
      customer.phone || null,
      customer.email || null,
      customer.address || null,
      customer.tin || null,
    ]
  )
}

// Update a customer
export async function updateCustomer(id, customer) {
  const db = await getDb()
  await db.execute(
    `UPDATE customers SET
     name = ?, phone = ?, email = ?, address = ?, tin = ?
     WHERE id = ?`,
    [
      customer.name,
      customer.phone || null,
      customer.email || null,
      customer.address || null,
      customer.tin || null,
      id,
    ]
  )
}

// Delete a customer — or archive them if they have sales or payments, so old
// sales, totals and debts stay complete.
export function buildDeleteCustomerStatements(id) {
  const hasHistory = `(EXISTS (SELECT 1 FROM sales WHERE customer_id = ?)
                       OR EXISTS (SELECT 1 FROM customer_payments WHERE customer_id = ?))`
  return [
    {
      sql: `UPDATE customers SET archived = 1 WHERE id = ? AND archived = 0 AND ${hasHistory}`,
      params: [id, id, id],
    },
    {
      sql: `DELETE FROM customers WHERE id = ? AND archived = 0 AND NOT ${hasHistory}`,
      params: [id, id, id],
    },
  ]
}

// Returns 'archived' or 'deleted'
export async function deleteCustomer(id) {
  const results = await runTransaction(buildDeleteCustomerStatements(id))
  return results[0].rowsAffected > 0 ? 'archived' : 'deleted'
}

// ── Debt repayments ──────────────────────────────────────
// Record money a customer paid towards what they owe. Refused if it is more
// than the balance. The money is also logged in Transactions (money in).
export function buildRecordPaymentStatements({ customerId, customerName, amount, paymentMethod = 'Cash', reference = '', note = '', date = todayLocal(), userName = null }) {
  const value = roundMoney(amount)
  if (!(value > 0)) throw new Error('Enter a valid amount')
  return [
    {
      sql: `INSERT INTO customer_payments (customer_id, amount, payment_method, reference, note, date, user_name)
            SELECT ?, ?, ?, ?, ?, ?, ?
            WHERE ${balanceSql('?')} + 0.005 >= ?`,
      params: [customerId, value, paymentMethod, reference || null, note || null, date, userName, customerId, customerId, value],
      expectChanges: 1,
      errorMessage: t('This payment is more than what the customer owes.'),
    },
    {
      sql: `INSERT INTO transactions
            (description, type, category, amount, payment_method, reference_id, reference_type, date, user_name)
            VALUES (?, 'income', 'Debt Repayment', ?, ?, ?, 'customer_payment', ?, ?)`,
      params: [t('Debt repayment — {name}', { name: customerName }), value, paymentMethod, ref(0), date, userName],
    },
  ]
}

export async function recordPayment(payment) {
  await runTransaction(buildRecordPaymentStatements({ userName: currentUserName(), ...payment }))
}

// Undo a repayment entered by mistake (owner): the debt comes back and the
// money is removed from the ledger.
export function buildVoidPaymentStatements(paymentId) {
  return [
    {
      sql: 'UPDATE customer_payments SET voided = 1 WHERE id = ? AND voided = 0',
      params: [paymentId],
      expectChanges: 1,
      errorMessage: t('This payment was already cancelled.'),
    },
    {
      sql: `DELETE FROM transactions WHERE reference_type = 'customer_payment' AND reference_id = ?`,
      params: [paymentId],
    },
  ]
}

export async function voidPayment(paymentId) {
  await runTransaction(buildVoidPaymentStatements(paymentId))
}

// A customer's statement: credit sales and payments, newest first
export async function getCustomerStatement(customerId) {
  const db = await getDb()
  const credit = await db.select(`
    SELECT id, receipt_number, created_at, total, amount_paid, status
    FROM sales WHERE customer_id = ? AND payment_method = 'Credit'
    ORDER BY created_at DESC`, [customerId])
  const payments = await db.select(`
    SELECT * FROM customer_payments WHERE customer_id = ?
    ORDER BY date DESC, id DESC`, [customerId])
  const balance = await db.select(`SELECT ${balanceSql('?')} AS b`, [customerId, customerId])
  return { credit, payments, balance: parseFloat(balance[0]?.b) || 0 }
}
