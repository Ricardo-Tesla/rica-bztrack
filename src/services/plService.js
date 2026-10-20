import { getDb } from './db'
import { monthsAgoLocal } from '../utils/format'

// Money you typed in by hand on the Transactions page (not linked to a sale,
// expense, restock, refund or debt repayment). It counts in Profit & Loss as
// "Other income" and "Other expenses" so P&L, Dashboard and Transactions agree.
// Manual "Stock Purchase" entries are excluded: buying stock is not an expense
// (its cost is counted when the items are sold).
export const OTHER_LEDGER_SQL = `
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS other_income,
    COALESCE(SUM(CASE WHEN type = 'expense' AND category <> 'Stock Purchase' THEN amount END), 0) AS other_expenses
  FROM transactions
  WHERE reference_type IS NULL
`

// SQL filters for a LOCAL date range (inclusive). Sales store UTC times;
// expenses and transactions store plain local dates.
export function rangeFilters(from, to) {
  const sale = []
  const day = []
  const saleParams = []
  const dayParams = []
  if (from) { sale.push(`DATE(s.created_at, 'localtime') >= ?`); saleParams.push(from); day.push('date >= ?'); dayParams.push(from) }
  if (to) { sale.push(`DATE(s.created_at, 'localtime') <= ?`); saleParams.push(to); day.push('date <= ?'); dayParams.push(to) }
  return {
    sale: sale.length ? ' AND ' + sale.join(' AND ') : '',
    day: day.length ? ' AND ' + day.join(' AND ') : '',
    saleParams,
    dayParams,
  }
}

// Profit & Loss for a period. With VAT on, VAT collected is not your money:
// net sales = sales − VAT, and profit is calculated on net sales.
export async function getPLReport({ from = null, to = null, select } = {}) {
  const run = select || (async (sql, params) => (await getDb()).select(sql, params))
  const f = rangeFilters(from, to)

  const [sales] = await run(`
    SELECT COALESCE(SUM(s.total), 0) AS revenue, COALESCE(SUM(s.tax), 0) AS vat,
           COALESCE(SUM(s.discount), 0) AS discounts, COUNT(*) AS count
    FROM sales s WHERE s.status = 'completed'${f.sale}`, f.saleParams)

  const [cogs] = await run(`
    SELECT COALESCE(SUM(si.buy_price * si.quantity), 0) AS total
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE s.status = 'completed'${f.sale}`, f.saleParams)

  const [expenses] = await run(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE 1 = 1${f.day}`, f.dayParams)

  const [other] = await run(`${OTHER_LEDGER_SQL}${f.day}`, f.dayParams)

  const expensesByCategory = await run(`
    SELECT category, SUM(amount) AS total FROM expenses WHERE 1 = 1${f.day}
    GROUP BY category ORDER BY total DESC`, f.dayParams)

  const topProducts = await run(`
    SELECT
      si.product_name,
      SUM(si.quantity) AS total_qty,
      SUM(si.subtotal) AS total_revenue,
      SUM(si.buy_price * si.quantity) AS total_cost,
      SUM(si.subtotal) - SUM(si.buy_price * si.quantity) AS total_profit
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE s.status = 'completed'${f.sale}
    GROUP BY si.product_id
    ORDER BY total_revenue DESC
    LIMIT 10`, f.saleParams)

  // Chart: always the last 6 months (local time)
  const sinceMonth = monthsAgoLocal(6)
  const monthlyRevenue = await run(`
    SELECT strftime('%Y-%m', created_at, 'localtime') AS month, SUM(total) AS revenue, COUNT(*) AS sales_count
    FROM sales WHERE status = 'completed' AND strftime('%Y-%m', created_at, 'localtime') >= ?
    GROUP BY month ORDER BY month ASC`, [sinceMonth])
  const monthlyExpenses = await run(`
    SELECT strftime('%Y-%m', date) AS month, SUM(amount) AS expenses
    FROM expenses WHERE strftime('%Y-%m', date) >= ?
    GROUP BY month ORDER BY month ASC`, [sinceMonth])

  const totalRevenue = parseFloat(sales.revenue) || 0
  const vatCollected = parseFloat(sales.vat) || 0
  const netSales = totalRevenue - vatCollected
  const totalCogs = parseFloat(cogs.total) || 0
  const totalExpenses = parseFloat(expenses.total) || 0
  const otherIncome = parseFloat(other.other_income) || 0
  const otherExpenses = parseFloat(other.other_expenses) || 0
  const grossProfit = netSales - totalCogs
  const netProfit = grossProfit + otherIncome - totalExpenses - otherExpenses

  return {
    from, to,
    salesCount: parseInt(sales.count) || 0,
    discounts: parseFloat(sales.discounts) || 0,
    totalRevenue,
    vatCollected,
    netSales,
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
