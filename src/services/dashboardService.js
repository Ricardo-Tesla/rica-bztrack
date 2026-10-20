import { getDb } from './db'
import { todayLocal } from '../utils/format'
import { getPLReport } from './plService'
import { getTotalOwed } from './customerService'
import { rangeFor } from '../utils/dateRanges'

// Everything on the Dashboard. Profit numbers come from the same calculation
// as the Profit & Loss page, so both always agree.
export async function getDashboardData() {
  const db = await getDb()
  const today = todayLocal()
  const month = rangeFor('this_month')

  const [todaySales] = await db.select(`
    SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue,
           COALESCE(SUM(CASE WHEN payment_method = 'Credit' THEN total - COALESCE(amount_paid, total) ELSE 0 END), 0) AS on_credit
    FROM sales WHERE DATE(created_at, 'localtime') = ? AND status = 'completed'`, [today])

  const [thisMonth, allTime, owed] = await Promise.all([
    getPLReport({ from: month.from, to: month.to }),
    getPLReport({}),
    getTotalOwed(),
  ])

  const [counts] = await db.select(`
    SELECT
      (SELECT COUNT(*) FROM customers WHERE archived = 0) AS customers,
      (SELECT COUNT(*) FROM products WHERE archived = 0) AS products,
      (SELECT COUNT(*) FROM products WHERE archived = 0 AND stock <= 0) AS out_of_stock`)

  const lowStock = await db.select(`
    SELECT name, stock, unit, low_stock_alert FROM products
    WHERE stock <= low_stock_alert AND archived = 0
    ORDER BY stock ASC LIMIT 8`)

  const recentTransactions = await db.select(`
    SELECT description, type, amount, category, date FROM transactions
    ORDER BY created_at DESC LIMIT 8`)

  const recentSales = await db.select(`
    SELECT receipt_number, customer_name, total, created_at, payment_method, user_name FROM sales
    WHERE status = 'completed' ORDER BY created_at DESC LIMIT 6`)

  return {
    today: {
      revenue: parseFloat(todaySales.revenue) || 0,
      salesCount: parseInt(todaySales.count) || 0,
      onCredit: parseFloat(todaySales.on_credit) || 0,
    },
    thisMonth: {
      revenue: thisMonth.totalRevenue,
      netProfit: thisMonth.netProfit,
      expenses: thisMonth.totalExpenses + thisMonth.otherExpenses,
      vat: thisMonth.vatCollected,
    },
    allTime: {
      revenue: allTime.totalRevenue,
      netProfit: allTime.netProfit,
      expenses: allTime.totalExpenses + allTime.otherExpenses,
    },
    owed,
    counts: {
      customers: parseInt(counts.customers) || 0,
      products: parseInt(counts.products) || 0,
      outOfStock: parseInt(counts.out_of_stock) || 0,
    },
    lowStock,
    recentTransactions,
    recentSales,
  }
}
