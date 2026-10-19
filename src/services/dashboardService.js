import { getDb } from './db'
import { todayLocal, monthLocal } from '../utils/format'
import { OTHER_LEDGER_SQL } from './plService'

export async function getDashboardData() {
  const db = await getDb()

  // Today's LOCAL date (sales times are saved in UTC, so compare in local time)
  const today = todayLocal()

  // Today's sales
  const todaySales = await db.select(`
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(total), 0) as revenue
    FROM sales
    WHERE DATE(created_at, 'localtime') = ?
    AND status = 'completed'
  `, [today])

  // Total revenue all time
  const totalRevenue = await db.select(`
    SELECT COALESCE(SUM(total), 0) as total
    FROM sales
    WHERE status = 'completed'
  `)

  // Total COGS
  const totalCogs = await db.select(`
    SELECT COALESCE(SUM(si.buy_price * si.quantity), 0) as total
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.status = 'completed'
  `)

  // Total expenses
  const totalExpenses = await db.select(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
  `)

  // Total customers
  const totalCustomers = await db.select(`
    SELECT COUNT(*) as total FROM customers WHERE archived = 0
  `)

  // Total products
  const totalProducts = await db.select(`
    SELECT COUNT(*) as total FROM products WHERE archived = 0
  `)

  // Low stock products
  const lowStock = await db.select(`
    SELECT name, stock, low_stock_alert
    FROM products
    WHERE stock <= low_stock_alert AND archived = 0
    ORDER BY stock ASC
    LIMIT 5
  `)

  // Out of stock products
  const outOfStock = await db.select(`
    SELECT COUNT(*) as total
    FROM products
    WHERE stock <= 0 AND archived = 0
  `)

  // Recent transactions
  const recentTransactions = await db.select(`
    SELECT description, type, amount, category, date
    FROM transactions
    ORDER BY created_at DESC
    LIMIT 8
  `)

  // Recent sales
  const recentSales = await db.select(`
    SELECT receipt_number, customer_name, total, created_at
    FROM sales
    WHERE status = 'completed'
    ORDER BY created_at DESC
    LIMIT 5
  `)

  // This month revenue
  const monthStr = monthLocal()
  const monthlyRevenue = await db.select(`
    SELECT COALESCE(SUM(total), 0) as total
    FROM sales
    WHERE strftime('%Y-%m', created_at, 'localtime') = ?
    AND status = 'completed'
  `, [monthStr])

  // This month cost of goods sold (buy price of the items sold this month)
  const monthlyCogs = await db.select(`
    SELECT COALESCE(SUM(si.buy_price * si.quantity), 0) as total
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE strftime('%Y-%m', s.created_at, 'localtime') = ?
    AND s.status = 'completed'
  `, [monthStr])

  // This month expenses
  const monthlyExpenses = await db.select(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE strftime('%Y-%m', date) = ?
  `, [monthStr])

  // Manual income / expenses from the Transactions page (same rules as P&L)
  const otherAll = await db.select(OTHER_LEDGER_SQL)
  const otherMonth = await db.select(
    `${OTHER_LEDGER_SQL} AND strftime('%Y-%m', date) = ?`,
    [monthStr]
  )

  const revenue = parseFloat(totalRevenue[0].total) || 0
  const cogs = parseFloat(totalCogs[0].total) || 0
  const otherIncome = parseFloat(otherAll[0].other_income) || 0
  // Expenses shown on the Dashboard include manual expense transactions
  const expenses = (parseFloat(totalExpenses[0].total) || 0) + (parseFloat(otherAll[0].other_expenses) || 0)
  const netProfit = revenue + otherIncome - cogs - expenses

  return {
    today: {
      revenue: parseFloat(todaySales[0].revenue) || 0,
      salesCount: parseInt(todaySales[0].count) || 0,
    },
    allTime: {
      revenue,
      cogs,
      expenses,
      netProfit,
    },
    thisMonth: {
      // Sales + manual income this month
      revenue: (parseFloat(monthlyRevenue[0].total) || 0) + (parseFloat(otherMonth[0].other_income) || 0),
      cogs: parseFloat(monthlyCogs[0].total) || 0,
      expenses: (parseFloat(monthlyExpenses[0].total) || 0) + (parseFloat(otherMonth[0].other_expenses) || 0),
    },
    counts: {
      customers: parseInt(totalCustomers[0].total) || 0,
      products: parseInt(totalProducts[0].total) || 0,
      outOfStock: parseInt(outOfStock[0].total) || 0,
    },
    lowStock,
    recentTransactions,
    recentSales,
  }
}