import { useEffect, useState } from 'react'
import { getPLReport } from '../services/plService'
import { formatMoney, formatDate, formatQty, todayLocal } from '../utils/format'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'
import { initialRange, PRESET_LABELS } from '../utils/dateRanges'
import { saveXlsx } from '../utils/excel'
import { DATE_LOCALES, tn } from '../i18n'
import DateRangePicker from '../components/DateRangePicker'
import { Alert, Button, PageHeader, StatCard } from '../components/ui'

export default function PLPage() {
  const { t, lang } = useApp()
  const [range, setRange] = useState(() => initialRange('this_month'))
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    try {
      setLoading(true)
      setReport(await getPLReport({ from: range.from, to: range.to }))
    } catch (err) {
      setError(t('Failed to load report') + ': ' + errorText(t, err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const periodLabel = range.preset === 'custom'
    ? `${formatDate(range.from)} – ${formatDate(range.to)}`
    : t(PRESET_LABELS[range.preset])

  function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-')
    return new Date(year, month - 1).toLocaleDateString(DATE_LOCALES[lang] || 'en-GB', { month: 'short', year: 'numeric' })
  }

  function statementLines(r) {
    const lines = [[t('Sales (what customers paid)'), r.totalRevenue]]
    if (r.vatCollected > 0) {
      lines.push([t('VAT collected (owed to RRA)'), -r.vatCollected])
      lines.push([t('Net sales'), r.netSales])
    }
    lines.push([t('Cost of goods sold'), -r.totalCogs])
    lines.push([t('Gross profit'), r.grossProfit])
    lines.push([t('Operating expenses'), -r.totalExpenses])
    if (r.otherIncome > 0) lines.push([t('Other income (manual transactions)'), r.otherIncome])
    if (r.otherExpenses > 0) lines.push([t('Other expenses (manual transactions)'), -r.otherExpenses])
    lines.push([t('Net profit / loss'), r.netProfit])
    return lines
  }

  async function exportExcel() {
    try {
      const path = await saveXlsx(`profit_and_loss_${range.from || 'all'}_${range.to || todayLocal()}.xlsx`, [
        {
          name: t('Profit & Loss'),
          columns: [{ header: periodLabel, key: 'label', width: 40 }, { header: 'RWF', key: 'amount', type: 'money' }],
          rows: statementLines(report).map(([label, amount]) => ({ label, amount })),
        },
        {
          name: t('Expenses'),
          columns: [{ header: t('Category'), value: e => t(e.category) }, { header: 'RWF', key: 'total', type: 'money' }],
          rows: report.expensesByCategory,
        },
        {
          name: t('Top products'),
          columns: [
            { header: t('Product'), key: 'product_name' },
            { header: t('Quantity'), key: 'total_qty', type: 'number' },
            { header: t('Revenue'), key: 'total_revenue', type: 'money' },
            { header: t('Cost'), key: 'total_cost', type: 'money' },
            { header: t('Profit'), key: 'total_profit', type: 'money' },
          ],
          rows: report.topProducts,
        },
      ])
      if (path) setNotice(t('Saved to {path}', { path }))
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  // Merge monthly revenue and expenses for the chart
  const monthly = (() => {
    if (!report) return []
    const months = {}
    report.monthlyRevenue.forEach(r => { months[r.month] = { month: r.month, revenue: r.revenue, expenses: 0 } })
    report.monthlyExpenses.forEach(e => {
      months[e.month] = { ...(months[e.month] || { month: e.month, revenue: 0 }), expenses: e.expenses }
    })
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month))
  })()
  const maxMonthly = Math.max(...monthly.map(m => Math.max(m.revenue, m.expenses)), 1)
  const pct = (part, whole) => (whole > 0 ? ((part / whole) * 100).toFixed(1) : '0.0')

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <PageHeader title={t('Profit & Loss')} subtitle={t('How much your business really earned')}>
        <DateRangePicker value={range} onChange={setRange} />
        <Button variant="secondary" onClick={exportExcel} disabled={!report}>⬇ {t('Excel')}</Button>
      </PageHeader>

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <Alert onClose={() => setError('')}>{error}</Alert>

      {loading || !report ? (
        <div className="text-center py-20 text-gray-500 animate-pulse">{t('Loading report...')}</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard label={t('Sales')} value={formatMoney(report.totalRevenue)} hint={tn(t, report.salesCount, '{n} sale', '{n} sales')} />
            <StatCard label={t('Cost of goods sold')} value={formatMoney(report.totalCogs)} tone="red" />
            <StatCard label={t('Gross profit')} value={formatMoney(report.grossProfit)} tone={report.grossProfit >= 0 ? 'green' : 'red'}
              hint={t('Margin: {p}%', { p: pct(report.grossProfit, report.netSales) })} />
            <StatCard label={t('Net profit')} value={formatMoney(report.netProfit)} tone={report.netProfit >= 0 ? 'green' : 'red'}
              hint={t('Margin: {p}%', { p: pct(report.netProfit, report.netSales) })} />
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <div className="text-sm font-bold text-white">{t('Income statement')}</div>
                <div className="text-xs text-gray-500 mt-0.5">{periodLabel}</div>
              </div>
              <div className="p-5">
                {statementLines(report).map(([label, amount], i, all) => {
                  const isTotal = i === all.length - 1 || label === t('Gross profit') || label === t('Net sales')
                  return (
                    <div key={label} className={`flex justify-between text-sm py-2.5 ${isTotal ? 'bg-gray-800 px-3 rounded-lg my-1 font-bold' : 'border-b border-gray-800'}`}>
                      <span className={isTotal ? 'text-white' : 'text-gray-300'}>{label}</span>
                      <span className={amount < 0 ? 'text-red-400' : isTotal ? (amount >= 0 ? 'text-green-400' : 'text-red-400') : 'text-green-400'}>
                        {amount < 0 ? '-' : ''}{formatMoney(Math.abs(amount))}
                      </span>
                    </div>
                  )
                })}
                {report.discounts > 0 && (
                  <p className="text-xs text-gray-500 mt-3">{t('Discounts given in this period: {amount}', { amount: formatMoney(report.discounts) })}</p>
                )}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <div className="text-sm font-bold text-white">{t('Expenses by category')}</div>
                <div className="text-xs text-gray-500 mt-0.5">{periodLabel}</div>
              </div>
              <div className="p-5">
                {report.expensesByCategory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">{t('No expenses recorded')}</div>
                ) : report.expensesByCategory.map(e => (
                  <div key={e.category} className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{t(e.category)}</span>
                      <span className="text-red-400 font-semibold">{formatMoney(e.total)} <span className="text-gray-500 font-normal">({pct(e.total, report.totalExpenses)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct(e.total, report.totalExpenses)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
            <div className="text-sm font-bold text-white mb-1">{t('Monthly sales vs expenses')}</div>
            <div className="text-xs text-gray-500 mb-6">{t('Last 6 months')}</div>
            {monthly.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">{t('No data yet')}</div>
            ) : (
              <>
                <div className="flex items-end gap-4 h-40 px-4">
                  {monthly.map(m => (
                    <div key={m.month} className="flex-1 flex gap-1 items-end h-full">
                      <div className="flex-1 bg-yellow-400 rounded-t-sm" style={{ height: `${(m.revenue / maxMonthly) * 100}%` }} title={`${t('Sales')}: ${formatMoney(m.revenue)}`} />
                      <div className="flex-1 bg-red-500 rounded-t-sm opacity-80" style={{ height: `${(m.expenses / maxMonthly) * 100}%` }} title={`${t('Expenses')}: ${formatMoney(m.expenses)}`} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 px-4 mt-2">
                  {monthly.map(m => <div key={m.month} className="flex-1 text-center text-xs text-gray-500">{formatMonth(m.month)}</div>)}
                </div>
                <div className="flex items-center gap-6 mt-4 px-4 text-xs text-gray-400">
                  <span className="flex items-center gap-2"><span className="w-3 h-3 bg-yellow-400 rounded-sm" />{t('Sales')}</span>
                  <span className="flex items-center gap-2"><span className="w-3 h-3 bg-red-500 rounded-sm" />{t('Expenses')}</span>
                </div>
              </>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <div className="text-sm font-bold text-white">{t('Top selling products')}</div>
              <div className="text-xs text-gray-500 mt-0.5">{periodLabel}</div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wide">
                  <th className="px-5 py-3">{t('Product')}</th>
                  <th className="px-5 py-3">{t('Units sold')}</th>
                  <th className="px-5 py-3">{t('Revenue')}</th>
                  <th className="px-5 py-3">{t('Cost')}</th>
                  <th className="px-5 py-3">{t('Profit')}</th>
                  <th className="px-5 py-3">{t('Margin')}</th>
                </tr>
              </thead>
              <tbody>
                {report.topProducts.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-500">{t('No sales in this period')}</td></tr>
                ) : report.topProducts.map((p, i) => {
                  const margin = Number(pct(p.total_profit, p.total_revenue))
                  return (
                    <tr key={i} className={`border-b border-gray-800 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}>
                      <td className="px-5 py-3 font-semibold text-white">{p.product_name}</td>
                      <td className="px-5 py-3 text-gray-300">{formatQty(p.total_qty)}</td>
                      <td className="px-5 py-3 text-yellow-400 font-semibold">{formatMoney(p.total_revenue)}</td>
                      <td className="px-5 py-3 text-red-400">{formatMoney(p.total_cost)}</td>
                      <td className={`px-5 py-3 font-semibold ${p.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatMoney(p.total_profit)}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${margin >= 30 ? 'bg-green-950 text-green-400 border-green-800' : margin >= 15 ? 'bg-yellow-950 text-yellow-400 border-yellow-800' : 'bg-red-950 text-red-400 border-red-800'}`}>{margin}%</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 px-5 py-3">{t('Product revenue is before sale discounts.')}</p>
          </div>
        </>
      )}
    </div>
  )
}
