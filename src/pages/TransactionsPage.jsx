import { useEffect, useState } from 'react'
import { getTransactions, addTransaction, getTransactionSummary } from '../services/transactionService'
import { formatMoney, todayLocal, formatDate } from '../utils/format'
import { PAYMENT_METHODS, TRANSACTION_CATEGORIES } from '../utils/constants'


const emptyForm = () => ({
  description: '', type: 'income', category: 'Sales',
  amount: '', payment_method: 'Cash',
  date: todayLocal()
})

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({ total_income: 0, total_expenses: 0, net: 0 })
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [txns, sum] = await Promise.all([
        getTransactions(),
        getTransactionSummary()
      ])
      setTransactions(txns)
      setSummary(sum)
    } catch {
      setError('Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!form.description.trim()) { setError('Description is required'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Valid amount is required'); return }
    if (!form.date) { setError('Date is required'); return }
    try {
      setSaving(true)
      setError('')
      await addTransaction(form)
      setForm(emptyForm())
      setShowModal(false)
      await loadData()
    } catch {
      setError('Failed to save transaction')
    } finally {
      setSaving(false)
    }
  }

  const filtered = transactions
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t =>
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
    )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">

      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">Transactions</h1>
        <p className="text-gray-400 mt-1 text-sm">Cash ledger — all money in and out, including stock purchases. For profit, see Profit & Loss.</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Money In</div>
          <div className="text-2xl font-bold text-green-400">
            +{formatMoney(parseFloat(summary.total_income || 0))}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Money Out</div>
          <div className="text-2xl font-bold text-red-400">
            -{formatMoney(parseFloat(summary.total_expenses || 0))}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Net Cash</div>
          <div className={`text-2xl font-bold ${parseFloat(summary.net || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatMoney(parseFloat(summary.net || 0))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white w-64 transition"
          />
          {/* Filter Tabs */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1">
            {['all', 'income', 'expense'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold capitalize transition
                  ${filter === f
                    ? 'bg-yellow-400 text-black'
                    : 'text-gray-400 hover:text-white'
                  }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => { setForm(emptyForm()); setShowModal(true); setError('') }}
          className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-5 py-2.5 rounded-lg transition text-sm"
        >
          <span className="text-lg leading-none">+</span> Add Transaction
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-5 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Description</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Type</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Category</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Payment</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Amount</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="text-center py-16 text-gray-500">
                  <div className="animate-pulse">Loading transactions...</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-16 text-gray-500">
                  <div className="text-5xl mb-4">🔄</div>
                  <div className="text-base font-medium text-gray-400">
                    {search ? 'No transactions match your search' : 'No transactions yet'}
                  </div>
                  <div className="text-sm mt-1">
                    {search ? 'Try a different search term' : 'Transactions are created automatically from sales and expenses'}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((t, i) => (
                <tr
                  key={t.id}
                  className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                >
                  <td className="px-5 py-4 text-white font-medium">{t.description}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border
                      ${t.type === 'income'
                        ? 'bg-green-950 text-green-400 border-green-800'
                        : 'bg-red-950 text-red-400 border-red-800'
                      }`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2.5 py-1 rounded-full">
                      {t.category}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">{t.payment_method}</td>
                  <td className={`px-5 py-4 font-bold ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatMoney(parseFloat(t.amount))}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">{formatDate(t.date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-800 bg-gray-900">
            <span className="text-xs text-gray-500">
              {filtered.length} transaction{filtered.length !== 1 ? 's' : ''} found
            </span>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-md shadow-2xl">

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-yellow-400">Add Transaction</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-300 text-xl leading-none transition"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="bg-red-950 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Description *</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="e.g. Cash sale to John"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>

              {/* Type Toggle */}
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Type</label>
                <div className="flex bg-gray-800 border border-gray-700 rounded-lg p-1">
                  {['income', 'expense'].map(t => (
                    <button
                      key={t}
                      onClick={() => setForm({ ...form, type: t })}
                      className={`flex-1 py-2 rounded-md text-xs font-semibold capitalize transition
                        ${form.type === t
                          ? t === 'income' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                          : 'text-gray-400 hover:text-white'
                        }`}
                    >
                      {t === 'income' ? '💰 Income' : '💸 Expense'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Category</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                >
                  {TRANSACTION_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1.5">
                  {form.category === 'Stock Purchase'
                    ? 'Recorded as money out only. Tip: use Products → Restock so the stock goes up too.'
                    : 'Counts in Profit & Loss as Other Income / Other Expenses.'}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Amount *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Payment Method</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={form.payment_method}
                  onChange={e => setForm({ ...form, payment_method: e.target.value })}
                >
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Date *</label>
                <input
                  type="date"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => { setShowModal(false); setError('') }}
                className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-5 py-2 rounded-lg text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-bold px-6 py-2 rounded-lg text-sm transition"
              >
                {saving ? 'Saving...' : 'Save Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}