import { useEffect, useState } from 'react'
import { getTransactions, addTransaction, getTransactionSummary } from '../services/transactionService'
import { formatMoney, formatDate, todayLocal } from '../utils/format'
import { PAYMENT_METHODS, TRANSACTION_CATEGORIES } from '../utils/constants'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'
import { initialRange } from '../utils/dateRanges'
import { saveXlsx } from '../utils/excel'
import DateRangePicker from '../components/DateRangePicker'
import { Alert, Button, Field, Modal, PageHeader, StatCard, inputClass } from '../components/ui'

const emptyForm = () => ({
  description: '', type: 'income', category: 'Other', amount: '', payment_method: 'Cash', date: todayLocal(),
})

export default function TransactionsPage() {
  const { t } = useApp()
  const [range, setRange] = useState(() => initialRange('this_month'))
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({ total_income: 0, total_expenses: 0, net: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [method, setMethod] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      setLoading(true)
      const [txns, sum] = await Promise.all([
        getTransactions({ from: range.from, to: range.to }),
        getTransactionSummary({ from: range.from, to: range.to }),
      ])
      setTransactions(txns)
      setSummary(sum || {})
    } catch (err) {
      setError(t('Failed to load transactions') + ': ' + errorText(t, err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!form.description.trim()) return setError(t('Description is required'))
    if (!(parseFloat(form.amount) > 0)) return setError(t('Valid amount is required'))
    if (!form.date) return setError(t('Date is required'))
    try {
      setSaving(true)
      await addTransaction(form)
      setAdding(false)
      await load()
    } catch (err) {
      setError(t('Failed to save transaction') + ': ' + errorText(t, err))
    } finally {
      setSaving(false)
    }
  }

  async function exportExcel() {
    try {
      const path = await saveXlsx(`transactions_${range.from || 'all'}_${range.to || todayLocal()}.xlsx`, [{
        name: t('Transactions'),
        columns: [
          { header: t('Date'), key: 'date' },
          { header: t('Description'), key: 'description', width: 40 },
          { header: t('Category'), value: x => t(x.category) },
          { header: t('Payment Method'), value: x => t(x.payment_method || '') },
          { header: t('Money in'), value: x => (x.type === 'income' ? x.amount : null), type: 'money' },
          { header: t('Money out'), value: x => (x.type === 'expense' ? x.amount : null), type: 'money' },
          { header: t('Recorded by'), key: 'user_name' },
        ],
        rows: filtered,
      }])
      if (path) setNotice(t('Saved to {path}', { path }))
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  const term = search.toLowerCase()
  const filtered = transactions
    .filter(x => filter === 'all' || x.type === filter)
    .filter(x => !method || x.payment_method === method)
    .filter(x => x.description.toLowerCase().includes(term) || x.category.toLowerCase().includes(term))

  // Money in / out per payment method (e.g. how much should be in the cash box)
  const byMethod = PAYMENT_METHODS.map(m => {
    const rows = transactions.filter(x => x.payment_method === m)
    const inn = rows.filter(x => x.type === 'income').reduce((a, x) => a + x.amount, 0)
    const out = rows.filter(x => x.type === 'expense').reduce((a, x) => a + x.amount, 0)
    return { method: m, net: inn - out, count: rows.length }
  }).filter(m => m.count > 0)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <PageHeader title={t('Transactions')} subtitle={t('Cash ledger — all money in and out, including stock purchases. For profit, see Profit & Loss.')}>
        <DateRangePicker value={range} onChange={setRange} />
        <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>⬇ {t('Excel')}</Button>
        <Button onClick={() => { setForm(emptyForm()); setError(''); setAdding(true) }}>+ {t('Add Transaction')}</Button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard label={t('Money In')} value={'+' + formatMoney(summary.total_income)} tone="green" />
        <StatCard label={t('Money Out')} value={'-' + formatMoney(summary.total_expenses)} tone="red" />
        <StatCard label={t('Net Cash')} value={formatMoney(summary.net)} tone={(summary.net || 0) >= 0 ? 'green' : 'red'} />
      </div>
      {byMethod.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {byMethod.map(m => (
            <div key={m.method} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs">
              <span className="text-gray-400">{t(m.method)}</span>{' '}
              <span className={`font-semibold ml-1 ${m.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatMoney(m.net)}</span>
            </div>
          ))}
        </div>
      )}

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      {!adding && <Alert onClose={() => setError('')}>{error}</Alert>}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder={t('Search transactions...')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white transition"
        />
        <select value={filter} onChange={e => setFilter(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
          <option value="all">{t('All')}</option>
          <option value="income">{t('Money In')}</option>
          <option value="expense">{t('Money Out')}</option>
        </select>
        <select value={method} onChange={e => setMethod(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
          <option value="">{t('All payment methods')}</option>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(m)}</option>)}
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-5 py-3">{t('Description')}</th>
              <th className="px-5 py-3">{t('Category')}</th>
              <th className="px-5 py-3">{t('Payment Method')}</th>
              <th className="px-5 py-3">{t('Amount')}</th>
              <th className="px-5 py-3">{t('Date')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500 animate-pulse">{t('Loading...')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">{t('No transactions in this period')}</td></tr>
            ) : filtered.map((x, i) => (
              <tr key={x.id} className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}>
                <td className="px-5 py-3">
                  <div className="text-white">{x.description}</div>
                  {x.user_name && <div className="text-xs text-gray-500">{x.user_name}</div>}
                </td>
                <td className="px-5 py-3"><span className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2.5 py-1 rounded-full">{t(x.category)}</span></td>
                <td className="px-5 py-3 text-gray-400 text-xs">{t(x.payment_method || '—')}</td>
                <td className={`px-5 py-3 font-semibold ${x.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                  {x.type === 'income' ? '+' : '-'}{formatMoney(x.amount)}
                </td>
                <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(x.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <Modal title={t('Add Transaction')} onClose={() => setAdding(false)}>
          <Alert onClose={() => setError('')}>{error}</Alert>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex bg-gray-800 border border-gray-700 rounded-lg p-1">
              {['income', 'expense'].map(type => (
                <button key={type} onClick={() => setForm({ ...form, type })}
                  className={`flex-1 py-2 rounded-md text-xs font-semibold transition ${form.type === type ? (type === 'income' ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'text-gray-400 hover:text-white'}`}>
                  {type === 'income' ? `💰 ${t('Money In')}` : `💸 ${t('Money Out')}`}
                </button>
              ))}
            </div>
            <Field label={t('Description') + ' *'} className="col-span-2">
              <input className={inputClass} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} autoFocus />
            </Field>
            <Field
              label={t('Category')}
              className="col-span-2"
              hint={form.category === 'Stock Purchase'
                ? t('Recorded as money out only. Tip: use Products → Restock so the stock goes up too.')
                : t('Counts in Profit & Loss as Other Income / Other Expenses.')}
            >
              <select className={inputClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {TRANSACTION_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
              </select>
            </Field>
            <Field label={t('Amount') + ' *'}>
              <input type="number" min="0" className={inputClass} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label={t('Date') + ' *'}>
              <input type="date" className={inputClass} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label={t('Payment Method')} className="col-span-2">
              <select className={inputClass} value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(m)}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setAdding(false)}>{t('Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? t('Saving...') : t('Save')}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
