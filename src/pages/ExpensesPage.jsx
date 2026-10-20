import { useEffect, useState } from 'react'
import { getExpenses, addExpense, updateExpense, deleteExpense, EXPENSE_CATEGORIES } from '../services/expenseService'
import { formatMoney, formatDate, todayLocal } from '../utils/format'
import { PAYMENT_METHODS } from '../utils/constants'
import { confirmDialog } from '../utils/dialogs'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'
import { initialRange } from '../utils/dateRanges'
import { saveXlsx } from '../utils/excel'
import DateRangePicker from '../components/DateRangePicker'
import { Alert, Button, Field, Modal, PageHeader, StatCard, inputClass } from '../components/ui'

const emptyForm = () => ({
  description: '', category: 'Rent', amount: '', date: todayLocal(), payment_method: 'Cash',
})

export default function ExpensesPage() {
  const { t } = useApp()
  const [range, setRange] = useState(() => initialRange('this_month'))
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | expense
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      setLoading(true)
      setExpenses(await getExpenses({ from: range.from, to: range.to }))
    } catch (err) {
      setError(t('Failed to load expenses') + ': ' + errorText(t, err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps

  function openForm(expense) {
    setError('')
    setEditing(expense || 'new')
    setForm(expense ? {
      description: expense.description, category: expense.category, amount: expense.amount,
      date: expense.date, payment_method: expense.payment_method || 'Cash',
    } : emptyForm())
  }

  async function handleSave() {
    if (!form.description.trim()) return setError(t('Description is required'))
    if (!(parseFloat(form.amount) > 0)) return setError(t('Valid amount is required'))
    if (!form.date) return setError(t('Date is required'))
    try {
      setSaving(true)
      if (editing === 'new') await addExpense(form)
      else await updateExpense(editing.id, form)
      setEditing(null)
      await load()
    } catch (err) {
      setError(t('Failed to save expense') + ': ' + errorText(t, err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(expense) {
    if (!(await confirmDialog(t('Delete this expense?') + `\n\n${expense.description} — ${formatMoney(expense.amount)}`, { okLabel: t('Delete'), danger: true }))) return
    try {
      await deleteExpense(expense.id)
      await load()
    } catch (err) {
      setError(t('Failed to delete expense') + ': ' + errorText(t, err))
    }
  }

  async function exportExcel() {
    try {
      const path = await saveXlsx(`expenses_${range.from || 'all'}_${range.to || todayLocal()}.xlsx`, [{
        name: t('Expenses'),
        columns: [
          { header: t('Date'), key: 'date' },
          { header: t('Description'), key: 'description', width: 36 },
          { header: t('Category'), value: e => t(e.category) },
          { header: t('Payment Method'), value: e => t(e.payment_method || '') },
          { header: t('Amount'), key: 'amount', type: 'money' },
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
  const filtered = expenses.filter(e => e.description.toLowerCase().includes(term) || e.category.toLowerCase().includes(term))
  const total = filtered.reduce((a, e) => a + e.amount, 0)
  const byCategory = [...new Set(filtered.map(e => e.category))]
    .map(category => ({ category, total: filtered.filter(e => e.category === category).reduce((a, e) => a + e.amount, 0) }))
    .sort((a, b) => b.total - a.total)
  const categoryOptions = EXPENSE_CATEGORIES.includes(form.category) ? EXPENSE_CATEGORIES : [...EXPENSE_CATEGORIES, form.category]

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <PageHeader title={t('Expenses')} subtitle={t('Rent, salaries, transport and other running costs')}>
        <DateRangePicker value={range} onChange={setRange} />
        <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>⬇ {t('Excel')}</Button>
        <Button onClick={() => openForm(null)}>+ {t('Add Expense')}</Button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label={t('Total expenses')} value={formatMoney(total)} tone="red" />
        <StatCard label={t('Number of expenses')} value={filtered.length} tone="white" />
        <StatCard label={t('Biggest category')} value={byCategory[0] ? t(byCategory[0].category) : '—'} tone="white" hint={byCategory[0] ? formatMoney(byCategory[0].total) : null} />
      </div>

      {byCategory.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {byCategory.map(c => (
            <div key={c.category} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs">
              <span className="text-gray-400">{t(c.category)}</span> <span className="text-red-400 font-semibold ml-1">{formatMoney(c.total)}</span>
            </div>
          ))}
        </div>
      )}

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      {!editing && <Alert onClose={() => setError('')}>{error}</Alert>}

      <input
        type="text"
        placeholder={t('Search expenses...')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white mb-4 transition"
      />

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-5 py-3">{t('Description')}</th>
              <th className="px-5 py-3">{t('Category')}</th>
              <th className="px-5 py-3">{t('Payment Method')}</th>
              <th className="px-5 py-3">{t('Amount')}</th>
              <th className="px-5 py-3">{t('Date')}</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-500 animate-pulse">{t('Loading...')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-500">{t('No expenses in this period')}</td></tr>
            ) : filtered.map((e, i) => (
              <tr key={e.id} className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}>
                <td className="px-5 py-3">
                  <div className="text-white">{e.description}</div>
                  {e.user_name && <div className="text-xs text-gray-500">{e.user_name}</div>}
                </td>
                <td className="px-5 py-3"><span className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2.5 py-1 rounded-full">{t(e.category)}</span></td>
                <td className="px-5 py-3 text-gray-400 text-xs">{t(e.payment_method || '—')}</td>
                <td className="px-5 py-3 text-red-400 font-semibold">-{formatMoney(e.amount)}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(e.date)}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap space-x-2">
                  <button onClick={() => openForm(e)} className="text-yellow-400 hover:text-yellow-300 text-xs border border-yellow-800 px-2.5 py-1.5 rounded-lg">{t('Edit')}</button>
                  <button onClick={() => handleDelete(e)} className="text-red-400 hover:text-red-300 text-xs border border-red-900 px-2.5 py-1.5 rounded-lg">{t('Delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? t('Add Expense') : t('Edit Expense')} onClose={() => setEditing(null)}>
          <Alert onClose={() => setError('')}>{error}</Alert>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Description') + ' *'} className="col-span-2">
              <input className={inputClass} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} autoFocus placeholder={t('e.g. October rent')} />
            </Field>
            <Field label={t('Category')} hint={t('Buying stock? Use Products → Restock instead, so its cost is counted when the items sell.')} className="col-span-2">
              <select className={inputClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {categoryOptions.map(c => <option key={c} value={c}>{t(c)}</option>)}
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
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? t('Saving...') : t('Save')}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
