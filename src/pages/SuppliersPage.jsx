import { useEffect, useState } from 'react'
import { getSuppliers, addSupplier, deleteSupplier } from '../services/supplierService'

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingSupplier, setEditingSupplier] = useState(null)

  const emptyForm = { name: '', contact: '', phone: '', email: '', address: '', notes: '' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { loadSuppliers() }, [])

  async function loadSuppliers() {
    try {
      setLoading(true)
      const data = await getSuppliers()
      setSuppliers(data)
    } catch (err) {
      setError('Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }

  function openAddModal() {
    setEditingSupplier(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEditModal(supplier) {
    setEditingSupplier(supplier)
    setForm({
      name: supplier.name || '',
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Supplier name is required'); return }
    try {
      setSaving(true)
      setError('')
      await addSupplier(form)
      setForm(emptyForm)
      setShowModal(false)
      await loadSuppliers()
    } catch (err) {
      setError('Failed to save supplier')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this supplier?')) return
    try {
      await deleteSupplier(id)
      await loadSuppliers()
    } catch (err) {
      setError('Failed to delete supplier')
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">

      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">Suppliers</h1>
        <p className="text-gray-400 mt-1 text-sm">Manage your suppliers and vendors</p>
      </div>
      <div className="flex justify-end mb-5">
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-5 py-2.5 rounded-lg transition text-sm"
        >
          <span className="text-lg leading-none">+</span> Add Supplier
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
            <tr className="border-b border-gray-800 bg-gray-900">
              <th className="text-left px-5 py-4 text-gray-400 font-medium tracking-wide text-xs uppercase">Name</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium tracking-wide text-xs uppercase">Contact Person</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium tracking-wide text-xs uppercase">Phone</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium tracking-wide text-xs uppercase">Email</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium tracking-wide text-xs uppercase">Address</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="text-center py-16 text-gray-500">
                  <div className="animate-pulse">Loading suppliers...</div>
                </td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-16 text-gray-500">
                  <div className="text-5xl mb-4">🏭</div>
                  <div className="text-base font-medium text-gray-400">No suppliers yet</div>
                  <div className="text-sm mt-1">Click "Add Supplier" to get started</div>
                </td>
              </tr>
            ) : (
              suppliers.map((s, i) => (
                <tr
                  key={s.id}
                  className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                >
                  <td className="px-5 py-4 font-semibold text-white">{s.name}</td>
                  <td className="px-5 py-4 text-gray-300">{s.contact || <span className="text-gray-600">—</span>}</td>
                  <td className="px-5 py-4 text-gray-300">{s.phone || <span className="text-gray-600">—</span>}</td>
                  <td className="px-5 py-4 text-gray-300">{s.email || <span className="text-gray-600">—</span>}</td>
                  <td className="px-5 py-4 text-gray-300">{s.address || <span className="text-gray-600">—</span>}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEditModal(s)}
                        className="text-yellow-400 hover:text-yellow-300 text-xs border border-yellow-800 hover:border-yellow-600 px-3 py-1.5 rounded-lg transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-red-400 hover:text-red-300 text-xs border border-red-900 hover:border-red-700 px-3 py-1.5 rounded-lg transition"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Table Footer */}
        {suppliers.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-800 bg-gray-900">
            <span className="text-xs text-gray-500">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''} total</span>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-lg shadow-2xl">

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-yellow-400">
                {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-300 text-xl leading-none transition"
              >
                ✕
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            {/* Form */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Supplier Name *</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="e.g. Acme Supplies Co."
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Contact Person</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="Full name"
                  value={form.contact}
                  onChange={e => setForm({ ...form, contact: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Phone</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="+1 234 567 890"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Email</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="email@supplier.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Address</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="City, Country"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Notes</label>
                <textarea
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition resize-none"
                  placeholder="Any additional notes..."
                  rows={3}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            {/* Modal Footer */}
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
                {saving ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Save Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}