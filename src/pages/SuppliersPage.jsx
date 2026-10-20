import { useEffect, useState } from 'react'
import { getSuppliers, addSupplier, updateSupplier, deleteSupplier } from '../services/supplierService'
import { confirmDialog } from '../utils/dialogs'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'
import { Alert, Button, Field, Modal, PageHeader, inputClass } from '../components/ui'

const emptyForm = { name: '', contact: '', phone: '', email: '', address: '', notes: '' }

export default function SuppliersPage() {
  const { t } = useApp()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | supplier
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      setLoading(true)
      setSuppliers(await getSuppliers())
    } catch (err) {
      setError(t('Failed to load suppliers') + ': ' + errorText(t, err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openForm(supplier) {
    setError('')
    setEditing(supplier || 'new')
    setForm(supplier ? Object.fromEntries(Object.keys(emptyForm).map(k => [k, supplier[k] || ''])) : emptyForm)
  }

  async function handleSave() {
    if (!form.name.trim()) return setError(t('Supplier name is required'))
    try {
      setSaving(true)
      if (editing === 'new') await addSupplier(form)
      else await updateSupplier(editing.id, form)
      setEditing(null)
      await load()
    } catch (err) {
      setError(t('Failed to save supplier') + ': ' + errorText(t, err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(supplier) {
    if (!(await confirmDialog(t('Delete {name}?', { name: supplier.name }) + '\n\n' + t('If it has history, it will be archived (hidden) instead, so your past sales and reports stay correct.'), { okLabel: t('Delete'), danger: true }))) return
    try {
      const result = await deleteSupplier(supplier.id)
      await load()
      if (result === 'archived') setNotice(t('This supplier has history, so it was archived (hidden) instead of deleted.'))
    } catch (err) {
      setError(t('Failed to delete supplier') + ': ' + errorText(t, err))
    }
  }

  const term = search.toLowerCase()
  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(term) || (s.contact || '').toLowerCase().includes(term) || (s.phone || '').includes(term)
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <PageHeader title={t('Suppliers')} subtitle={t('The people and companies you buy stock from')}>
        <Button onClick={() => openForm(null)}>+ {t('Add Supplier')}</Button>
      </PageHeader>

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      {!editing && <Alert onClose={() => setError('')}>{error}</Alert>}

      <input
        type="text"
        placeholder={t('Search suppliers...')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white mb-4 transition"
      />

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-5 py-3">{t('Name')}</th>
              <th className="px-5 py-3">{t('Contact person')}</th>
              <th className="px-5 py-3">{t('Phone')}</th>
              <th className="px-5 py-3">{t('Email')}</th>
              <th className="px-5 py-3">{t('Address')}</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-500 animate-pulse">{t('Loading...')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-500">{search ? t('No suppliers match your search') : t('No suppliers yet')}</td></tr>
            ) : filtered.map((s, i) => (
              <tr key={s.id} className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}>
                <td className="px-5 py-3">
                  <div className="font-semibold text-white">{s.name}</div>
                  {s.notes && <div className="text-xs text-gray-500 truncate max-w-xs">{s.notes}</div>}
                </td>
                <td className="px-5 py-3 text-gray-300">{s.contact || '—'}</td>
                <td className="px-5 py-3 text-gray-300">{s.phone || '—'}</td>
                <td className="px-5 py-3 text-gray-300">{s.email || '—'}</td>
                <td className="px-5 py-3 text-gray-300">{s.address || '—'}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap space-x-2">
                  <button onClick={() => openForm(s)} className="text-yellow-400 hover:text-yellow-300 text-xs border border-yellow-800 px-2.5 py-1.5 rounded-lg">{t('Edit')}</button>
                  <button onClick={() => handleDelete(s)} className="text-red-400 hover:text-red-300 text-xs border border-red-900 px-2.5 py-1.5 rounded-lg">{t('Delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? t('Add Supplier') : t('Edit Supplier')} onClose={() => setEditing(null)}>
          <Alert onClose={() => setError('')}>{error}</Alert>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Supplier name') + ' *'} className="col-span-2">
              <input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t('Contact person')}>
              <input className={inputClass} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} />
            </Field>
            <Field label={t('Phone')}>
              <input className={inputClass} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={t('Email')}>
              <input className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label={t('Address')}>
              <input className={inputClass} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label={t('Notes')} className="col-span-2">
              <textarea rows={3} className={inputClass} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
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
