import { useEffect, useState } from 'react'
import { getDashboardData } from '../services/dashboardService'

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    try {
      setLoading(true)
      const result = await getDashboardData()
      setData(result)
    } catch (err) {
      setError('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  function getGreeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 animate-pulse text-sm">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    )
  }

  // Revenue − cost of the goods sold − expenses (restocks are not expenses)
  const monthProfit = data.thisMonth.revenue - data.thisMonth.cogs - data.thisMonth.expenses

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          {getGreeting()} 👋
        </h1>
        <p className="text-gray-400 mt-1 text-sm">
          Here's what's happening in your business today —&nbsp;
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}
        </p>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Today's Revenue</div>
          <div className="text-2xl font-bold text-yellow-400">
            ${data.today.revenue.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {data.today.salesCount} sale{data.today.salesCount !== 1 ? 's' : ''} today
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Month Profit</div>
          <div className={`text-2xl font-bold ${monthProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${monthProfit.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">After cost of goods & expenses</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Net Profit</div>
          <div className={`text-2xl font-bold ${data.allTime.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${data.allTime.netProfit.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">All time</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-yellow-400">
            ${data.allTime.revenue.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">All time sales</div>
        </div>
      </div>

      {/* Second Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Customers</div>
          <div className="text-2xl font-bold text-yellow-400">{data.counts.customers}</div>
          <div className="text-xs text-gray-500 mt-1">Registered</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Products</div>
          <div className="text-2xl font-bold text-yellow-400">{data.counts.products}</div>
          <div className="text-xs text-gray-500 mt-1">In catalog</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Expenses</div>
          <div className="text-2xl font-bold text-red-400">
            ${data.allTime.expenses.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">All time</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Out of Stock</div>
          <div className={`text-2xl font-bold ${data.counts.outOfStock > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {data.counts.outOfStock}
          </div>
          <div className="text-xs text-gray-500 mt-1">Products</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-2 gap-6 mb-6">

        {/* Recent Sales */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-white">Recent Sales</div>
              <div className="text-xs text-gray-500 mt-0.5">Latest completed sales</div>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Receipt</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Customer</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Total</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSales.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-8 text-gray-500 text-xs">
                    No sales yet
                  </td>
                </tr>
              ) : (
                data.recentSales.map((s, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition">
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-yellow-400">{s.receipt_number}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-300 text-xs">{s.customer_name}</td>
                    <td className="px-5 py-3 text-green-400 font-semibold text-xs">
                      ${parseFloat(s.total).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(s.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Recent Transactions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <div className="text-sm font-bold text-white">Recent Transactions</div>
            <div className="text-xs text-gray-500 mt-0.5">Latest financial movements</div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Description</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Category</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan="3" className="text-center py-8 text-gray-500 text-xs">
                    No transactions yet
                  </td>
                </tr>
              ) : (
                data.recentTransactions.map((t, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition">
                    <td className="px-5 py-3 text-gray-300 text-xs">{t.description}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">
                        {t.category}
                      </span>
                    </td>
                    <td className={`px-5 py-3 font-bold text-xs ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                      {t.type === 'income' ? '+' : '-'}${parseFloat(t.amount).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {data.lowStock.length > 0 && (
        <div className="bg-gray-900 border border-yellow-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-yellow-800 flex items-center gap-2">
            <span>⚠️</span>
            <div>
              <div className="text-sm font-bold text-yellow-400">Low Stock Alert</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {data.lowStock.length} product{data.lowStock.length !== 1 ? 's' : ''} need restocking
              </div>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Product</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Current Stock</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Alert Level</th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.lowStock.map((p, i) => (
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition">
                  <td className="px-5 py-3 font-semibold text-white">{p.name}</td>
                  <td className="px-5 py-3 text-gray-300">{p.stock}</td>
                  <td className="px-5 py-3 text-gray-400">{p.low_stock_alert}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border
                      ${p.stock <= 0
                        ? 'bg-red-950 text-red-400 border-red-800'
                        : 'bg-yellow-950 text-yellow-400 border-yellow-800'
                      }`}>
                      {p.stock <= 0 ? 'Out of Stock' : 'Low Stock'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}