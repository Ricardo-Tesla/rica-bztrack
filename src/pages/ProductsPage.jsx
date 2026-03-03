import { useEffect, useState } from 'react'
import { getProducts, addProduct, updateProduct, deleteProduct } from '../services/productService'
import { getSuppliers } from '../services/supplierService'

const CATEGORIES = ['Electronics', 'Clothing', 'Food', 'Hardware', 'Furniture', 'Other']
const UNITS = ['Piece', 'Kg', 'Litre', 'Box', 'Pack', 'Dozen']

const emptyForm = {
  name: '', sku: '', category: 'Other', unit: 'Piece',
  buy_price: '', sell_price: '', stock: '', low_stock_alert: '5',
  supplier_id: ''
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [prods, sups] = await Promise.all([getProducts(), getSuppliers()])
      setProducts(prods)
      setSuppliers(sups)
    } catch (err) {
      setError('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  function openAddModal() {
    setEditingProduct(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEditModal(product) {
    setEditingProduct(product)
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || 'Other',
      unit: product.unit || 'Piece',
      buy_price: product.buy_price || '',
      sell_price: product.sell_price || '',
      stock: product.stock || '',
      low_stock_alert: product.low_stock_alert || '5',
      supplier_id: product.supplier_id || ''
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Product name is required'); return }
    if (!form.sku.trim()) { setError('SKU is required'); return }
    if (!form.sell_price) { setError('Sell price is required'); return }
    try {
      setSaving(true)
      setError('')
      if (editingProduct) {
        await updateProduct(editingProduct.id, form)
      } else {
        await addProduct(form)
      }
      setShowModal(false)
      await loadData()
    } catch (err) {
      setError(err.includes?.('UNIQUE') ? 'SKU already exists' : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this product?')) return
    try {
      await deleteProduct(id)
      await loadData()
    } catch (err) {
      setError('Failed to delete product')
    }
  }

  function getStockStatus(product) {
    if (product.stock <= 0) return { label: 'Out of Stock', class: 'bg-red-950 text-red-400 border border-red-800' }
    if (product.stock <= product.low_stock_alert) return { label: 'Low Stock', class: 'bg-yellow-950 text-yellow-400 border border-yellow-800' }
    return { label: 'In Stock', class: 'bg-green-950 text-green-400 border border-green-800' }
  }

  function getMargin(buy, sell) {
    if (!buy || !sell || buy === 0) return null
    return (((sell - buy) / sell) * 100).toFixed(1)
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">

      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">Products</h1>
        <p className="text-gray-400 mt-1 text-sm">Manage your product inventory</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <input
          type="text"
          placeholder="Search by name, SKU or category..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white w-80 transition"
        />
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-5 py-2.5 rounded-lg transition text-sm"
        >
          <span className="text-lg leading-none">+</span> Add Product
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
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">SKU</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Category</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Buy Price</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Sell Price</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Margin</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Stock</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" className="text-center py-16 text-gray-500">
                  <div className="animate-pulse">Loading products...</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="9" className="text-center py-16 text-gray-500">
                  <div className="text-5xl mb-4">📦</div>
                  <div className="text-base font-medium text-gray-400">
                    {search ? 'No products match your search' : 'No products yet'}
                  </div>
                  <div className="text-sm mt-1">
                    {search ? 'Try a different search term' : 'Click "Add Product" to get started'}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((p, i) => {
                const status = getStockStatus(p)
                const margin = getMargin(p.buy_price, p.sell_price)
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white">{p.name}</div>
                      {p.supplier_name && (
                        <div className="text-xs text-gray-500 mt-0.5">{p.supplier_name}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
                        {p.sku}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-300">{p.category || '—'}</td>
                    <td className="px-5 py-4 text-gray-300">${parseFloat(p.buy_price).toFixed(2)}</td>
                    <td className="px-5 py-4 text-yellow-400 font-semibold">${parseFloat(p.sell_price).toFixed(2)}</td>
                    <td className="px-5 py-4">
                      {margin !== null ? (
                        <span className="text-green-400 text-xs font-semibold">{margin}%</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-300">{p.stock} {p.unit}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.class}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-yellow-400 hover:text-yellow-300 text-xs border border-yellow-800 hover:border-yellow-600 px-3 py-1.5 rounded-lg transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-red-400 hover:text-red-300 text-xs border border-red-900 hover:border-red-700 px-3 py-1.5 rounded-lg transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-800 bg-gray-900 flex items-center justify-between">
            <span className="text-xs text-gray-500">{filtered.length} product{filtered.length !== 1 ? 's' : ''} found</span>
            <span className="text-xs text-gray-500">
              Total inventory value: <span className="text-yellow-400 font-semibold">
                ${products.reduce((a, p) => a + (p.buy_price * p.stock), 0).toFixed(2)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-yellow-400">
                {editingProduct ? 'Edit Product' : 'Add Product'}
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
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Product Name *</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="e.g. Wireless Headphones"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">SKU / Code *</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition font-mono"
                  placeholder="e.g. WH-001"
                  value={form.sku}
                  onChange={e => setForm({ ...form, sku: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Category</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Unit</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                >
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Buy Price (Cost) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="0.00"
                  value={form.buy_price}
                  onChange={e => setForm({ ...form, buy_price: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Sell Price *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="0.00"
                  value={form.sell_price}
                  onChange={e => setForm({ ...form, sell_price: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Initial Stock</label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="0"
                  value={form.stock}
                  onChange={e => setForm({ ...form, stock: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Low Stock Alert</label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="5"
                  value={form.low_stock_alert}
                  onChange={e => setForm({ ...form, low_stock_alert: e.target.value })}
                />
              </div>

              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Supplier (optional)</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={form.supplier_id}
                  onChange={e => setForm({ ...form, supplier_id: e.target.value })}
                >
                  <option value="">No Supplier</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Live Margin Preview */}
            {form.buy_price && form.sell_price && (
              <div className="mt-4 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">Profit margin preview</span>
                <span className="text-green-400 font-bold text-sm">
                  {getMargin(parseFloat(form.buy_price), parseFloat(form.sell_price))}%
                  &nbsp;·&nbsp; ${(parseFloat(form.sell_price) - parseFloat(form.buy_price)).toFixed(2)} per unit
                </span>
              </div>
            )}

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
                {saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Save Product'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}