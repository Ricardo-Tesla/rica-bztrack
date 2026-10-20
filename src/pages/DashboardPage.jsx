import { useEffect, useState } from 'react'
import { getDashboardData } from '../services/dashboardService'
import { qtyLabel } from '../services/salesService'
import { formatMoney, formatDateTime, formatDate, customerLabel } from '../utils/format'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'
import { DATE_LOCALES, tn } from '../i18n'
import { Alert, StatCard } from '../components/ui'

export default function DashboardPage({ onNavigate }) {
  const { t, user, settings, lang } = useApp()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboardData()
      .then(setData)
      .catch(err => setError(t('Failed to load dashboard') + ': ' + errorText(t, err)))
  }, [t])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('Good morning') : hour < 17 ? t('Good afternoon') : t('Good evening')

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 p-8">
        <Alert onClose={() => setError('')}>{error}</Alert>
        {!error && <div className="text-gray-500 animate-pulse text-sm text-center pt-20">{t('Loading dashboard...')}</div>}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">{greeting}, <span className="text-yellow-400">{user?.name}</span></h1>
        <p className="text-gray-400 mt-1 text-sm">
          {settings.business_name ? `${settings.business_name} · ` : ''}
          {new Date().toLocaleDateString(DATE_LOCALES[lang] || 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard label={t('Today\'s sales')} value={formatMoney(data.today.revenue)} hint={tn(t, data.today.salesCount, '{n} sale today', '{n} sales today')} />
        <StatCard label={t('Profit this month')} value={formatMoney(data.thisMonth.netProfit)} tone={data.thisMonth.netProfit >= 0 ? 'green' : 'red'} hint={t('After cost of goods & expenses')} />
        <StatCard label={t('Sales this month')} value={formatMoney(data.thisMonth.revenue)} hint={data.thisMonth.vat > 0 ? t('incl. VAT {amount}', { amount: formatMoney(data.thisMonth.vat) }) : null} />
        <StatCard label={t('Customers owe you')} value={formatMoney(data.owed.owed)} tone={data.owed.owed > 0 ? 'red' : 'white'} hint={tn(t, data.owed.customers, '{n} customer', '{n} customers')} />
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label={t('All-time sales')} value={formatMoney(data.allTime.revenue)} tone="white" />
        <StatCard label={t('All-time net profit')} value={formatMoney(data.allTime.netProfit)} tone={data.allTime.netProfit >= 0 ? 'green' : 'red'} />
        <StatCard label={t('Products')} value={data.counts.products} tone="white" hint={data.counts.outOfStock ? t('{n} out of stock', { n: data.counts.outOfStock }) : null} />
        <StatCard label={t('Customers')} value={data.counts.customers} tone="white" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
            <div className="text-sm font-bold text-white">⚠️ {t('Low stock')}</div>
            <button onClick={() => onNavigate?.('products')} className="text-xs text-yellow-400 hover:text-yellow-300">{t('Products')} →</button>
          </div>
          <div className="p-5">
            {data.lowStock.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">✅ {t('All products are well stocked')}</div>
            ) : data.lowStock.map((p, i) => (
              <div key={i} className="flex justify-between text-sm mb-2.5">
                <span className="text-gray-300 truncate pr-2">{p.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${p.stock <= 0 ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-yellow-950 text-yellow-400 border border-yellow-800'}`}>
                  {p.stock <= 0 ? t('Out') : t('{qty} left', { qty: qtyLabel(p.stock, p.unit) })}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
            <div className="text-sm font-bold text-white">🧾 {t('Recent sales')}</div>
            <button onClick={() => onNavigate?.('sales')} className="text-xs text-yellow-400 hover:text-yellow-300">{t('Sales History')} →</button>
          </div>
          <div className="p-5">
            {data.recentSales.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">{t('No sales yet')}</div>
            ) : data.recentSales.map(s => (
              <div key={s.receipt_number} className="flex justify-between items-center text-sm mb-3">
                <div className="min-w-0">
                  <div className="text-gray-200 truncate">{customerLabel(s.customer_name, t)}</div>
                  <div className="text-xs text-gray-500">{formatDateTime(s.created_at)}{s.user_name ? ` · ${s.user_name}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className="text-yellow-400 font-semibold">{formatMoney(s.total)}</div>
                  <div className="text-xs text-gray-500">{t(s.payment_method)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
            <div className="text-sm font-bold text-white">🔄 {t('Recent money in / out')}</div>
            <button onClick={() => onNavigate?.('transactions')} className="text-xs text-yellow-400 hover:text-yellow-300">{t('Transactions')} →</button>
          </div>
          <div className="p-5">
            {data.recentTransactions.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">{t('No transactions yet')}</div>
            ) : data.recentTransactions.map((tx, i) => (
              <div key={i} className="flex justify-between items-center text-sm mb-3">
                <div className="min-w-0 pr-2">
                  <div className="text-gray-200 truncate">{tx.description}</div>
                  <div className="text-xs text-gray-500">{t(tx.category)} · {formatDate(tx.date)}</div>
                </div>
                <div className={`font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
