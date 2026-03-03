import { useEffect, useState } from 'react'
import { getCustomers, addCustomer, updateCustomer, deleteCustomer } from '../services/customerService'

const emptyForm = { name: '', phone: '', email: '', address: '' }

export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')

  useEffect(() => { loadCustomers() }, [])

  async function loadCustomers() {
    try {
      setLoading(true)
      const data = await getCustomers()
      setCustomers(data)
    } catch (err) {
      setError('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  function openAddModal() {
    setEditingCustomer(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEditModal(customer) {
    setEditingCustomer(customer)
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Customer name is required'); return }
    try {
      setSaving(true)
      setError('')
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, form)
      } else {
        await addCustomer(form)
      }
      setShowModal(false)
      await loadCustomers()
    } catch (err) {
      setError('Failed to save customer')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this customer?')) return
    try {
      await deleteCustomer(id)
      await loadCustomers()
    } catch (err) {
      setError('Failed to delete customer')
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalCustomers = customers.length
  const totalRevenue = customers.reduce((a, c) => a + (c.total_spent || 0), 0)
  const totalOrders = customers.reduce((a, c) => a + (c.total_orders || 0), 0)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">

      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">Customers</h1>
        <p className="text-gray-400 mt-1 text-sm">Manage your customer base</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Customers</div>
          <div className="text-2xl font-bold text-yellow-400">{totalCustomers}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Orders</div>
          <div className="text-2xl font-bold text-yellow-400">{totalOrders}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-yellow-400">${totalRevenue.toFixed(2)}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <input
          type="text"
          placeholder="Search by name, phone or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white w-80 transition"
        />
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-5 py-2.5 rounded-lg transition text-sm"
        >
          <span className="text-lg leading-none">+</span> Add Customer
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
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Name</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Phone</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Email</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Address</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Orders</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Total Spent</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Last Visit</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="text-center py-16 text-gray-500">
                  <div className="animate-pulse">Loading customers...</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center py-16 text-gray-500">
                  <div className="text-5xl mb-4">👥</div>
                  <div className="text-base font-medium text-gray-400">
                    {search ? 'No customers match your search' : 'No customers yet'}
                  </div>
                  <div className="text-sm mt-1">
                    {search ? 'Try a different search term' : 'Click "Add Customer" to get started'}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((c, i) => (
                <tr
                  key={c.id}
                  className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                >
                  <td className="px-5 py-4">
                    <div className="font-semibold text-white">{c.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Since {formatDate(c.created_at)}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-300">{c.phone || <span className="text-gray-600">—</span>}</td>
                  <td className="px-5 py-4 text-gray-300">{c.email || <span className="text-gray-600">—</span>}</td>
                  <td className="px-5 py-4 text-gray-300">{c.address || <span className="text-gray-600">—</span>}</td>
                  <td className="px-5 py-4">
                    <span className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full">
                      {c.total_orders || 0} orders
                    </span>
                  </td>
                  <td className="px-5 py-4 text-yellow-400 font-semibold">
                    ${parseFloat(c.total_spent || 0).toFixed(2)}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {formatDate(c.last_visit)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEditModal(c)}
                        className="text-yellow-400 hover:text-yellow-300 text-xs border border-yellow-800 hover:border-yellow-600 px-3 py-1.5 rounded-lg transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
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

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-800 bg-gray-900">
            <span className="text-xs text-gray-500">
              {filtered.length} customer{filtered.length !== 1 ? 's' : ''} found
            </span>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-md shadow-2xl">

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-yellow-400">
                {editingCustomer ? 'Edit Customer' : 'Add Customer'}
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
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Full Name *</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="e.g. John Doe"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
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
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Address</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="City, Country"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>

            {/* Footer */}
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
                {saving ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Save Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}