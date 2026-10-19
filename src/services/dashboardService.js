import { getDb } from './db'

export async function getDashboardData() {
  const db = await getDb()

  // Today's date string
  const today = new Date().toISOString().split('T')[0]

  // Today's sales
  const todaySales = await db.select(`
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(total), 0) as revenue
    FROM sales
    WHERE DATE(created_at) = ?
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
    SELECT COUNT(*) as total FROM customers
  `)

  // Total products
  const totalProducts = await db.select(`
    SELECT COUNT(*) as total FROM products
  `)

  // Low stock products
  const lowStock = await db.select(`
    SELECT name, stock, low_stock_alert
    FROM products
    WHERE stock <= low_stock_alert
    ORDER BY stock ASC
    LIMIT 5
  `)

  // Out of stock products
  const outOfStock = await db.select(`
    SELECT COUNT(*) as total
    FROM products
    WHERE stock <= 0
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
  const thisMonth = new Date()
  const monthStr = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}`
  const monthlyRevenue = await db.select(`
    SELECT COALESCE(SUM(total), 0) as total
    FROM sales
    WHERE strftime('%Y-%m', created_at) = ?
    AND status = 'completed'
  `, [monthStr])

  // This month cost of goods sold (buy price of the items sold this month)
  const monthlyCogs = await db.select(`
    SELECT COALESCE(SUM(si.buy_price * si.quantity), 0) as total
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE strftime('%Y-%m', s.created_at) = ?
    AND s.status = 'completed'
  `, [monthStr])

  // This month expenses
  const monthlyExpenses = await db.select(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE strftime('%Y-%m', date) = ?
  `, [monthStr])

  const revenue = parseFloat(totalRevenue[0].total) || 0
  const cogs = parseFloat(totalCogs[0].total) || 0
  const expenses = parseFloat(totalExpenses[0].total) || 0
  const netProfit = revenue - cogs - expenses

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
      revenue: parseFloat(monthlyRevenue[0].total) || 0,
      cogs: parseFloat(monthlyCogs[0].total) || 0,
      expenses: parseFloat(monthlyExpenses[0].total) || 0,
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