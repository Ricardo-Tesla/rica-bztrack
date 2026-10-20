import { useEffect, useState } from 'react'
import {
  getCustomers, addCustomer, updateCustomer, deleteCustomer,
  recordPayment, voidPayment, getCustomerStatement,
} from '../services/customerService'
import { formatMoney, formatDate, formatDateTime, roundMoney } from '../utils/format'
import { confirmDialog } from '../utils/dialogs'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'
import { saveXlsx } from '../utils/excel'
import { PAYMENT_METHODS, METHODS_WITH_REFERENCE } from '../utils/constants'
import { Alert, Button, Field, Modal, PageHeader, StatCard, inputClass } from '../components/ui'

const emptyForm = { name: '', phone: '', email: '', address: '', tin: '' }

export default function CustomersPage() {
  const { t, can } = useApp()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [onlyOwing, setOnlyOwing] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | customer
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(null) // { customer, amount, method, reference, note }
  const [statement, setStatement] = useState(null) // { customer, credit, payments, balance }

  async function loadCustomers() {
    try {
      setLoading(true)
      setCustomers(await getCustomers())
    } catch (err) {
      setError(t('Failed to load customers') + ': ' + errorText(t, err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadCustomers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openForm(customer) {
    setEditing(customer || 'new')
    setForm(customer ? {
      name: customer.name || '', phone: customer.phone || '', email: customer.email || '',
      address: customer.address || '', tin: customer.tin || '',
    } : emptyForm)
    setError('')
  }

  async function handleSave() {
    if (!form.name.trim()) return setError(t('Customer name is required'))
    try {
      setSaving(true)
      if (editing === 'new') await addCustomer(form)
      else await updateCustomer(editing.id, form)
      setEditing(null)
      await loadCustomers()
    } catch (err) {
      setError(t('Failed to save customer') + ': ' + errorText(t, err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!(await confirmDialog(t('Delete this customer?') + '\n\n' + t('If it has history, it will be archived (hidden) instead, so your past sales and reports stay correct.'), { okLabel: t('Delete'), danger: true }))) return
    try {
      const result = await deleteCustomer(id)
      await loadCustomers()
      if (result === 'archived') setNotice(t('This customer has history, so it was archived (hidden) instead of deleted.'))
    } catch (err) {
      setError(t('Failed to delete customer') + ': ' + errorText(t, err))
    }
  }

  async function openStatement(customer) {
    try {
      setStatement({ customer, ...(await getCustomerStatement(customer.id)) })
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  async function submitPayment() {
    const amount = Number(paying.amount)
    if (!(amount > 0)) return setError(t('Enter a valid amount'))
    if (amount > roundMoney(paying.customer.balance) + 0.005) return setError(t('This payment is more than what the customer owes.'))
    try {
      setSaving(true)
      await recordPayment({
        customerId: paying.customer.id,
        customerName: paying.customer.name,
        amount,
        paymentMethod: paying.method,
        reference: paying.reference,
        note: paying.note,
      })
      setNotice(t('Payment of {amount} recorded for {name}', { amount: formatMoney(amount), name: paying.customer.name }))
      setPaying(null)
      await loadCustomers()
      if (statement?.customer?.id === paying.customer.id) await openStatement(paying.customer)
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setSaving(false)
    }
  }

  async function cancelPayment(payment) {
    if (!(await confirmDialog(t('Cancel this payment of {amount}? The customer will owe it again.', { amount: formatMoney(payment.amount) }), { okLabel: t('Cancel payment'), danger: true }))) return
    try {
      await voidPayment(payment.id)
      await loadCustomers()
      await openStatement(statement.customer)
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  async function exportDebts() {
    try {
      const path = await saveXlsx('customer_debts.xlsx', [{
        name: t('Customers'),
        columns: [
          { header: t('Name'), key: 'name' },
          { header: t('Phone'), key: 'phone' },
          { header: t('TIN'), key: 'tin' },
          { header: t('Orders'), key: 'total_orders', type: 'number' },
          { header: t('Total spent'), key: 'total_spent', type: 'money' },
          { header: t('Owes'), value: c => Math.max(0, roundMoney(c.balance)), type: 'money' },
          { header: t('Last visit'), value: c => formatDate(c.last_visit, '') },
        ],
        rows: customers,
      }])
      if (path) setNotice(t('Saved to {path}', { path }))
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  const term = search.toLowerCase()
  const filtered = customers.filter(c =>
    (!onlyOwing || c.balance > 0.5) && (
      c.name.toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term))
  )
  const totalOwed = customers.reduce((a, c) => a + Math.max(0, c.balance), 0)
  const owingCount = customers.filter(c => c.balance > 0.5).length

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <PageHeader title={t('Customers')} subtitle={t('Customers, what they bought and what they owe')}>
        {can('export') && <Button variant="secondary" onClick={exportDebts} disabled={!customers.length}>⬇ {t('Excel')}</Button>}
        <Button onClick={() => openForm(null)}>+ {t('Add Customer')}</Button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label={t('Customers')} value={customers.length} />
        <StatCard label={t('Customers who owe')} value={owingCount} tone={owingCount ? 'red' : 'white'} />
        <StatCard label={t('Total owed to you')} value={formatMoney(totalOwed)} tone={totalOwed > 0 ? 'red' : 'white'} />
      </div>

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      {!editing && !paying && <Alert onClose={() => setError('')}>{error}</Alert>}

      <div className="flex gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder={t('Search by name, phone or email...')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white transition"
        />
        <label className="flex items-center gap-2 text-sm text-gray-300 whitespace-nowrap">
          <input type="checkbox" checked={onlyOwing} onChange={e => setOnlyOwing(e.target.checked)} />
          {t('Only customers who owe')}
        </label>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-5 py-3">{t('Customer')}</th>
              <th className="px-5 py-3">{t('Phone')}</th>
              <th className="px-5 py-3">{t('Orders')}</th>
              <th className="px-5 py-3">{t('Total spent')}</th>
              <th className="px-5 py-3">{t('Owes')}</th>
              <th className="px-5 py-3">{t('Last visit')}</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500 animate-pulse">{t('Loading...')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">{t('No customers found')}</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                <td className="px-5 py-3">
                  <div className="text-white font-medium">{c.name}</div>
                  {c.tin && <div className="text-xs text-gray-500">TIN {c.tin}</div>}
                </td>
                <td className="px-5 py-3 text-gray-300">{c.phone || '—'}</td>
                <td className="px-5 py-3 text-gray-300">{c.total_orders}</td>
                <td className="px-5 py-3 text-yellow-400">{formatMoney(c.total_spent)}</td>
                <td className={`px-5 py-3 font-bold ${c.balance > 0.5 ? 'text-red-400' : c.balance < -0.5 ? 'text-green-400' : 'text-gray-500'}`}>
                  {c.balance > 0.5 ? formatMoney(c.balance) : c.balance < -0.5 ? `${t('Credit')} ${formatMoney(-c.balance)}` : '—'}
                </td>
                <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(c.last_visit, t('Never'))}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap space-x-2">
                  {c.balance > 0.5 && (
                    <button onClick={() => { setError(''); setPaying({ customer: c, amount: String(roundMoney(c.balance)), method: 'Cash', reference: '', note: '' }) }}
                      className="text-xs text-green-400 hover:text-green-300 border border-green-900 hover:border-green-700 px-2.5 py-1.5 rounded-lg">{t('Record payment')}</button>
                  )}
                  <button onClick={() => openStatement(c)} className="text-xs text-gray-300 hover:text-white border border-gray-700 px-2.5 py-1.5 rounded-lg">{t('Statement')}</button>
                  <button onClick={() => openForm(c)} className="text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-800 px-2.5 py-1.5 rounded-lg">{t('Edit')}</button>
                  {can('delete') && (
                    <button onClick={() => handleDelete(c.id)} className="text-xs text-red-400 hover:text-red-300 border border-red-900 px-2.5 py-1.5 rounded-lg">{t('Delete')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? t('Add Customer') : t('Edit Customer')} onClose={() => setEditing(null)}>
          <Alert onClose={() => setError('')}>{error}</Alert>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Name') + ' *'} className="col-span-2">
              <input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t('Phone')}>
              <input className={inputClass} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="07..." />
            </Field>
            <Field label={t('TIN')} hint={t('For business customers')}>
              <input className={inputClass} value={form.tin} onChange={e => setForm({ ...form, tin: e.target.value })} />
            </Field>
            <Field label={t('Email')}>
              <input className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label={t('Address')}>
              <input className={inputClass} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? t('Saving...') : t('Save')}</Button>
          </div>
        </Modal>
      )}

      {paying && (
        <Modal title={t('Record payment')} subtitle={`${paying.customer.name} — ${t('owes')} ${formatMoney(paying.customer.balance)}`} onClose={() => setPaying(null)} width="max-w-md">
          <Alert onClose={() => setError('')}>{error}</Alert>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Amount')}>
              <input type="number" min="0" className={inputClass} value={paying.amount} onChange={e => setPaying({ ...paying, amount: e.target.value })} autoFocus />
            </Field>
            <Field label={t('Payment Method')}>
              <select className={inputClass} value={paying.method} onChange={e => setPaying({ ...paying, method: e.target.value })}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(m)}</option>)}
              </select>
            </Field>
            {METHODS_WITH_REFERENCE.includes(paying.method) && (
              <Field label={t('Reference')} className="col-span-2">
                <input className={inputClass} value={paying.reference} onChange={e => setPaying({ ...paying, reference: e.target.value })} />
              </Field>
            )}
            <Field label={t('Note')} className="col-span-2">
              <input className={inputClass} value={paying.note} onChange={e => setPaying({ ...paying, note: e.target.value })} placeholder={t('Optional')} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setPaying(null)}>{t('Cancel')}</Button>
            <Button onClick={submitPayment} disabled={saving}>{saving ? t('Saving...') : t('Save payment')}</Button>
          </div>
        </Modal>
      )}

      {statement && (
        <Modal title={t('Statement')} subtitle={statement.customer.name} onClose={() => setStatement(null)} width="max-w-2xl">
          <div className={`text-lg font-bold mb-4 ${statement.balance > 0.5 ? 'text-red-400' : 'text-green-400'}`}>
            {statement.balance > 0.5 ? t('Owes {amount}', { amount: formatMoney(statement.balance) }) : t('Nothing owed')}
          </div>
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">{t('Credit sales')}</h3>
          {statement.credit.length === 0 ? <p className="text-sm text-gray-500 mb-4">—</p> : (
            <table className="w-full text-sm mb-5">
              <tbody>
                {statement.credit.map(s => (
                  <tr key={s.id} className={`border-b border-gray-800 ${s.status === 'voided' ? 'opacity-50 line-through' : ''}`}>
                    <td className="py-2 font-mono text-xs text-yellow-400">{s.receipt_number}</td>
                    <td className="text-xs text-gray-400">{formatDateTime(s.created_at)}</td>
                    <td className="text-right text-gray-300">{formatMoney(s.total)}</td>
                    <td className="text-right text-red-400">{formatMoney(s.total - (s.amount_paid ?? s.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">{t('Payments')}</h3>
          {statement.payments.length === 0 ? <p className="text-sm text-gray-500">—</p> : (
            <table className="w-full text-sm">
              <tbody>
                {statement.payments.map(p => (
                  <tr key={p.id} className={`border-b border-gray-800 ${p.voided ? 'opacity-50 line-through' : ''}`}>
                    <td className="py-2 text-xs text-gray-400">{formatDate(p.date)}</td>
                    <td className="text-gray-300">{t(p.payment_method)}{p.reference ? ` · ${p.reference}` : ''}</td>
                    <td className="text-xs text-gray-500">{p.user_name || ''}</td>
                    <td className="text-right text-green-400">{formatMoney(p.amount)}</td>
                    <td className="text-right">
                      {!p.voided && can('delete') && (
                        <button onClick={() => cancelPayment(p)} className="text-xs text-red-400 hover:text-red-300">{t('Cancel')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  )
}
