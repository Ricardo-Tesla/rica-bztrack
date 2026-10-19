import { getDb } from './db'
import { monthsAgoLocal } from '../utils/format'

// Money you typed in by hand on the Transactions page (not linked to a sale,
// expense or restock). It counts in Profit & Loss as "Other income" and
// "Other expenses" so P&L, Dashboard and Transactions all agree.
// Manual "Stock Purchase" entries are excluded: buying stock is not an expense
// (its cost is counted when the items are sold).
export const OTHER_LEDGER_SQL = `
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS other_income,
    COALESCE(SUM(CASE WHEN type = 'expense' AND category <> 'Stock Purchase' THEN amount END), 0) AS other_expenses
  FROM transactions
  WHERE reference_type IS NULL
`

export async function getPLReport() {
  const db = await getDb()

  // Total revenue from all sales
  const revenueResult = await db.select(`
    SELECT COALESCE(SUM(total), 0) as total_revenue
    FROM sales
    WHERE status = 'completed'
  `)

  // Total COGS from sale items
  const cogsResult = await db.select(`
    SELECT COALESCE(SUM(si.buy_price * si.quantity), 0) as total_cogs
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.status = 'completed'
  `)

  // Total expenses
  const expensesResult = await db.select(`
    SELECT COALESCE(SUM(amount), 0) as total_expenses
    FROM expenses
  `)

  // Manual income / expenses from the Transactions page
  const otherResult = await db.select(OTHER_LEDGER_SQL)

  // Expenses by category
  const expensesByCategory = await db.select(`
    SELECT category, SUM(amount) as total
    FROM expenses
    GROUP BY category
    ORDER BY total DESC
  `)

  // Chart: the LAST 6 months, including this one (local time)
  const sinceMonth = monthsAgoLocal(6)

  const monthlyRevenue = await db.select(`
    SELECT
      strftime('%Y-%m', created_at, 'localtime') as month,
      SUM(total) as revenue,
      COUNT(*) as sales_count
    FROM sales
    WHERE status = 'completed'
      AND strftime('%Y-%m', created_at, 'localtime') >= ?
    GROUP BY month
    ORDER BY month ASC
  `, [sinceMonth])

  const monthlyExpenses = await db.select(`
    SELECT
      strftime('%Y-%m', date) as month,
      SUM(amount) as expenses
    FROM expenses
    WHERE strftime('%Y-%m', date) >= ?
    GROUP BY month
    ORDER BY month ASC
  `, [sinceMonth])

  // Top selling products by revenue
  const topProducts = await db.select(`
    SELECT
      si.product_name,
      SUM(si.quantity) as total_qty,
      SUM(si.subtotal) as total_revenue,
      SUM(si.buy_price * si.quantity) as total_cost,
      SUM(si.subtotal) - SUM(si.buy_price * si.quantity) as total_profit
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.status = 'completed'
    GROUP BY si.product_id
    ORDER BY total_revenue DESC
    LIMIT 5
  `)

  const totalRevenue = parseFloat(revenueResult[0].total_revenue) || 0
  const totalCogs = parseFloat(cogsResult[0].total_cogs) || 0
  const totalExpenses = parseFloat(expensesResult[0].total_expenses) || 0
  const otherIncome = parseFloat(otherResult[0].other_income) || 0
  const otherExpenses = parseFloat(otherResult[0].other_expenses) || 0
  const grossProfit = totalRevenue - totalCogs
  const netProfit = grossProfit + otherIncome - totalExpenses - otherExpenses

  return {
    totalRevenue,
    totalCogs,
    grossProfit,
    totalExpenses,
    otherIncome,
    otherExpenses,
    netProfit,
    expensesByCategory,
    monthlyRevenue,
    monthlyExpenses,
    topProducts,
  }
}
