import { useEffect, useState } from 'react'
import { getExpenses, addExpense, deleteExpense, EXPENSE_CATEGORIES } from '../services/expenseService'
import { formatMoney, parseDbDate, todayLocal } from '../utils/format'

const PAYMENT_METHODS = ['Cash', 'Card', 'Mobile Money', 'Bank Transfer']

const emptyForm = () => ({
  description: '', category: 'Rent',
  amount: '', date: todayLocal(),
  payment_method: 'Cash'
})

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')

  useEffect(() => { loadExpenses() }, [])

  async function loadExpenses() {
    try {
      setLoading(true)
      const data = await getExpenses()
      setExpenses(data)
    } catch (err) {
      setError('Failed to load expenses')
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
      await addExpense(form)
      setForm(emptyForm())
      setShowModal(false)
      await loadExpenses()
    } catch (err) {
      setError('Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this expense?')) return
    try {
      await deleteExpense(id)
      await loadExpenses()
    } catch (err) {
      setError('Failed to delete expense')
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return parseDbDate(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  }

  const filtered = expenses.filter(e =>
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.category.toLowerCase().includes(search.toLowerCase())
  )

  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0)
  const thisMonth = expenses.filter(e => {
    const d = parseDbDate(e.date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((a, e) => a + e.amount, 0)

  // Category breakdown
  // Built from the saved data so older categories (e.g. a manual "Stock Purchase") still show
  const byCategory = [...new Set(expenses.map(e => e.category))].map(cat => ({
    category: cat,
    total: expenses.filter(e => e.category === cat).reduce((a, e) => a + e.amount, 0)
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">

      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">Expenses</h1>
        <p className="text-gray-400 mt-1 text-sm">Track your business expenditures</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Expenses</div>
          <div className="text-2xl font-bold text-red-400">{formatMoney(totalExpenses)}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">This Month</div>
          <div className="text-2xl font-bold text-red-400">{formatMoney(thisMonth)}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Records</div>
          <div className="text-2xl font-bold text-yellow-400">{expenses.length}</div>
        </div>
      </div>

      {/* Category Breakdown */}
      {byCategory.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-4">Breakdown by Category</div>
          <div className="grid grid-cols-4 gap-3">
            {byCategory.map(c => (
              <div key={c.category} className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
                <div className="text-xs text-gray-400 mb-1">{c.category}</div>
                <div className="text-red-400 font-bold">{formatMoney(c.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <input
          type="text"
          placeholder="Search by description or category..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white w-80 transition"
        />
        <button
          onClick={() => { setForm(emptyForm()); setShowModal(true); setError('') }}
          className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-5 py-2.5 rounded-lg transition text-sm"
        >
          <span className="text-lg leading-none">+</span> Add Expense
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
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Category</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Amount</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Date</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="text-center py-16 text-gray-500">
                  <div className="animate-pulse">Loading expenses...</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-16 text-gray-500">
                  <div className="text-5xl mb-4">💸</div>
                  <div className="text-base font-medium text-gray-400">
                    {search ? 'No expenses match your search' : 'No expenses yet'}
                  </div>
                  <div className="text-sm mt-1">
                    {search ? 'Try a different search term' : 'Click "Add Expense" to get started'}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((e, i) => (
                <tr
                  key={e.id}
                  className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                >
                  <td className="px-5 py-4 text-white font-medium">{e.description}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2.5 py-1 rounded-full">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-red-400 font-bold">
                    -{formatMoney(parseFloat(e.amount))}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">{formatDate(e.date)}</td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-red-400 hover:text-red-300 text-xs border border-red-900 hover:border-red-700 px-3 py-1.5 rounded-lg transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-800 bg-gray-900 flex justify-between">
            <span className="text-xs text-gray-500">
              {filtered.length} expense{filtered.length !== 1 ? 's' : ''} found
            </span>
            <span className="text-xs text-gray-500">
              Total: <span className="text-red-400 font-semibold">
                -{formatMoney(filtered.reduce((a, e) => a + e.amount, 0))}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-md shadow-2xl">

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-yellow-400">Add Expense</h2>
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
                  placeholder="e.g. Monthly office rent"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Category</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                >
                  {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1.5">
                  Buying stock? Use Products → Restock instead, so its cost is counted when the items sell.
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
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Date *</label>
                <input
                  type="date"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
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
                {saving ? 'Saving...' : 'Save Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}