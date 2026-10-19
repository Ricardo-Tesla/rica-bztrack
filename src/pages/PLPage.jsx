import { useEffect, useState } from 'react'
import { getPLReport } from '../services/plService'
import { formatMoney } from '../utils/format'

export default function PLPage() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadReport() }, [])

  async function loadReport() {
    try {
      setLoading(true)
      const data = await getPLReport()
      setReport(data)
    } catch {
      setError('Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  function formatMonth(monthStr) {
    if (!monthStr) return ''
    const [year, month] = monthStr.split('-')
    const date = new Date(year, month - 1)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  // Merge monthly revenue and expenses into one list
  function getMergedMonthly() {
    if (!report) return []
    const months = {}
    report.monthlyRevenue.forEach(r => {
      months[r.month] = { month: r.month, revenue: r.revenue, expenses: 0 }
    })
    report.monthlyExpenses.forEach(e => {
      if (months[e.month]) {
        months[e.month].expenses = e.expenses
      } else {
        months[e.month] = { month: e.month, revenue: 0, expenses: e.expenses }
      }
    })
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month))
  }

  // Get bar height as percentage
  function barHeight(value, max) {
    if (!max || max === 0) return 0
    return Math.round((value / max) * 100)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 animate-pulse">Loading report...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    )
  }

  const monthly = getMergedMonthly()
  const maxMonthlyValue = Math.max(
    ...monthly.map(m => Math.max(m.revenue, m.expenses)), 1
  )

  const grossMargin = report.totalRevenue > 0
    ? ((report.grossProfit / report.totalRevenue) * 100).toFixed(1)
    : 0

  const netMargin = report.totalRevenue > 0
    ? ((report.netProfit / report.totalRevenue) * 100).toFixed(1)
    : 0

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">

      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">Profit & Loss</h1>
        <p className="text-gray-400 mt-1 text-sm">Complete financial overview of your business</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-yellow-400">
            {formatMoney(report.totalRevenue)}
          </div>
          <div className="text-xs text-gray-500 mt-1">From all sales</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total COGS</div>
          <div className="text-2xl font-bold text-red-400">
            -{formatMoney(report.totalCogs)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Cost of goods sold</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Gross Profit</div>
          <div className={`text-2xl font-bold ${report.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatMoney(report.grossProfit)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Margin: {grossMargin}%</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Net Profit</div>
          <div className={`text-2xl font-bold ${report.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatMoney(report.netProfit)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Margin: {netMargin}%</div>
        </div>
      </div>

      {/* P&L Statement */}
      <div className="grid grid-cols-2 gap-6 mb-8">

        {/* Income Statement */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <div className="text-sm font-bold text-white">Income Statement</div>
            <div className="text-xs text-gray-500 mt-0.5">Revenue and cost breakdown</div>
          </div>
          <div className="p-5">
            <div className="flex justify-between text-sm py-2.5 border-b border-gray-800">
              <span className="text-gray-300">Gross Revenue</span>
              <span className="text-green-400 font-semibold">+{formatMoney(report.totalRevenue)}</span>
            </div>
            <div className="flex justify-between text-sm py-2.5 border-b border-gray-800">
              <span className="text-gray-300">Cost of Goods Sold</span>
              <span className="text-red-400 font-semibold">-{formatMoney(report.totalCogs)}</span>
            </div>
            <div className="flex justify-between text-sm py-2.5 border-b border-gray-800 bg-gray-800 px-3 rounded-lg my-1">
              <span className="text-white font-bold">Gross Profit</span>
              <span className={`font-bold ${report.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatMoney(report.grossProfit)}
              </span>
            </div>
            <div className="flex justify-between text-sm py-2.5 border-b border-gray-800">
              <span className="text-gray-300">Operating Expenses</span>
              <span className="text-red-400 font-semibold">-{formatMoney(report.totalExpenses)}</span>
            </div>
            {report.otherIncome > 0 && (
              <div className="flex justify-between text-sm py-2.5 border-b border-gray-800">
                <span className="text-gray-300">Other Income <span className="text-xs text-gray-500">(manual transactions)</span></span>
                <span className="text-green-400 font-semibold">+{formatMoney(report.otherIncome)}</span>
              </div>
            )}
            {report.otherExpenses > 0 && (
              <div className="flex justify-between text-sm py-2.5 border-b border-gray-800">
                <span className="text-gray-300">Other Expenses <span className="text-xs text-gray-500">(manual transactions)</span></span>
                <span className="text-red-400 font-semibold">-{formatMoney(report.otherExpenses)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm py-3 bg-gray-800 px-3 rounded-lg mt-2">
              <span className="text-white font-bold">Net Profit / Loss</span>
              <span className={`font-bold text-lg ${report.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {report.netProfit >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(report.netProfit))}
              </span>
            </div>
          </div>
        </div>

        {/* Expenses Breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <div className="text-sm font-bold text-white">Expenses Breakdown</div>
            <div className="text-xs text-gray-500 mt-0.5">By category</div>
          </div>
          <div className="p-5">
            {report.expensesByCategory.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">No expenses recorded</div>
            ) : (
              report.expensesByCategory.map(e => {
                const pct = report.totalExpenses > 0
                  ? ((e.total / report.totalExpenses) * 100).toFixed(1)
                  : 0
                return (
                  <div key={e.category} className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{e.category}</span>
                      <span className="text-red-400 font-semibold">
                        {formatMoney(parseFloat(e.total))}
                        <span className="text-gray-500 font-normal ml-1">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Monthly Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
        <div className="text-sm font-bold text-white mb-1">Monthly Revenue vs Expenses</div>
        <div className="text-xs text-gray-500 mb-6">Last 6 months</div>

        {monthly.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">No data yet</div>
        ) : (
          <>
            <div className="flex items-end gap-4 h-40 px-4">
              {monthly.map(m => (
                <div key={m.month} className="flex-1 flex gap-1 items-end">
                  {/* Revenue bar */}
                  <div className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-yellow-400 rounded-t-sm opacity-90 transition-all"
                      style={{ height: `${barHeight(m.revenue, maxMonthlyValue) * 1.4}px` }}
                      title={`Revenue: ${formatMoney(parseFloat(m.revenue))}`}
                    />
                  </div>
                  {/* Expenses bar */}
                  <div className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-red-500 rounded-t-sm opacity-80 transition-all"
                      style={{ height: `${barHeight(m.expenses, maxMonthlyValue) * 1.4}px` }}
                      title={`Expenses: ${formatMoney(parseFloat(m.expenses || 0))}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            {/* Month Labels */}
            <div className="flex gap-4 px-4 mt-2">
              {monthly.map(m => (
                <div key={m.month} className="flex-1 text-center text-xs text-gray-500">
                  {formatMonth(m.month)}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-6 mt-4 px-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
                <span className="text-xs text-gray-400">Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                <span className="text-xs text-gray-400">Expenses</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Top Products */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <div className="text-sm font-bold text-white">Top Selling Products</div>
          <div className="text-xs text-gray-500 mt-0.5">By revenue generated</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Product</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Units Sold</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Revenue</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Cost</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Profit</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Margin</th>
            </tr>
          </thead>
          <tbody>
            {report.topProducts.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-12 text-gray-500">
                  <div className="text-4xl mb-3">📦</div>
                  <div>No sales data yet</div>
                </td>
              </tr>
            ) : (
              report.topProducts.map((p, i) => {
                const margin = p.total_revenue > 0
                  ? ((p.total_profit / p.total_revenue) * 100).toFixed(1)
                  : 0
                return (
                  <tr
                    key={i}
                    className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                  >
                    <td className="px-5 py-3 font-semibold text-white">{p.product_name}</td>
                    <td className="px-5 py-3 text-gray-300">{p.total_qty}</td>
                    <td className="px-5 py-3 text-yellow-400 font-semibold">
                      {formatMoney(parseFloat(p.total_revenue))}
                    </td>
                    <td className="px-5 py-3 text-red-400">
                      {formatMoney(parseFloat(p.total_cost))}
                    </td>
                    <td className={`px-5 py-3 font-semibold ${p.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatMoney(parseFloat(p.total_profit))}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border
                        ${margin >= 30
                          ? 'bg-green-950 text-green-400 border-green-800'
                          : margin >= 15
                          ? 'bg-yellow-950 text-yellow-400 border-yellow-800'
                          : 'bg-red-950 text-red-400 border-red-800'
                        }`}>
                        {margin}%
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}