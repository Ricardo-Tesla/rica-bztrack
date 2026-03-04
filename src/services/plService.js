import { getDb } from './db'

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

  // Expenses by category
  const expensesByCategory = await db.select(`
    SELECT category, SUM(amount) as total
    FROM expenses
    GROUP BY category
    ORDER BY total DESC
  `)

  // Monthly revenue for last 6 months
  const monthlyRevenue = await db.select(`
    SELECT
      strftime('%Y-%m', created_at) as month,
      SUM(total) as revenue,
      COUNT(*) as sales_count
    FROM sales
    WHERE status = 'completed'
    GROUP BY strftime('%Y-%m', created_at)
    ORDER BY month ASC
    LIMIT 6
  `)

  // Monthly expenses for last 6 months
  const monthlyExpenses = await db.select(`
    SELECT
      strftime('%Y-%m', date) as month,
      SUM(amount) as expenses
    FROM expenses
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month ASC
    LIMIT 6
  `)

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
    GROUP BY si.product_name
    ORDER BY total_revenue DESC
    LIMIT 5
  `)

  const totalRevenue = parseFloat(revenueResult[0].total_revenue) || 0
  const totalCogs = parseFloat(cogsResult[0].total_cogs) || 0
  const totalExpenses = parseFloat(expensesResult[0].total_expenses) || 0
  const grossProfit = totalRevenue - totalCogs
  const netProfit = grossProfit - totalExpenses

  return {
    totalRevenue,
    totalCogs,
    grossProfit,
    totalExpenses,
    netProfit,
    expensesByCategory,
    monthlyRevenue,
    monthlyExpenses,
    topProducts,
  }
}