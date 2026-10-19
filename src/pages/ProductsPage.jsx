import { useEffect, useState } from 'react'
import { getProducts, addProduct, updateProduct, deleteProduct } from '../services/productService'
import { getSuppliers } from '../services/supplierService'
import { restockProduct, getStockMovements } from '../services/restockService'
import { formatMoney, todayLocal } from '../utils/format'
import { PAYMENT_METHODS, PRODUCT_CATEGORIES, PRODUCT_UNITS } from '../utils/constants'
import { confirmDialog } from '../utils/dialogs'


const emptyForm = {
  name: '', sku: '', category: 'Other', unit: 'Piece',
  buy_price: '', sell_price: '', stock: '', low_stock_alert: '5',
  supplier_id: ''
}

const emptyRestock = () => ({
  quantity: '', unit_cost: '', supplier_id: '',
  supplier_name: '', payment_method: 'Cash',
  note: '', date: todayLocal()
})

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
  const [notice, setNotice] = useState('')

  // Restock state
  const [showRestockModal, setShowRestockModal] = useState(false)
  const [restockingProduct, setRestockingProduct] = useState(null)
  const [restockSaving, setRestockSaving] = useState(false)
  const [restockError, setRestockError] = useState('')
  const [restockForm, setRestockForm] = useState(emptyRestock)
  const [stockMovements, setStockMovements] = useState([])
  const [showMovements, setShowMovements] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [prods, sups] = await Promise.all([getProducts(), getSuppliers()])
      setProducts(prods)
      setSuppliers(sups)
    } catch {
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
      stock: product.stock ?? '',
      low_stock_alert: product.low_stock_alert ?? '5',
      supplier_id: product.supplier_id || ''
    })
    setError('')
    setShowModal(true)
  }

  function openRestockModal(product) {
    setRestockingProduct(product)
    setRestockForm({
      ...emptyRestock(),
      unit_cost: product.buy_price || '',
      supplier_id: product.supplier_id || '',
      supplier_name: suppliers.find(s => s.id == product.supplier_id)?.name || ''
    })
    setRestockError('')
    setShowRestockModal(true)
  }

  async function openMovementsModal(product) {
    const movements = await getStockMovements(product.id)
    setStockMovements(movements)
    setRestockingProduct(product)
    setShowMovements(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Product name is required'); return }
    if (!form.sku.trim()) { setError('SKU is required'); return }
    if (!form.sell_price) { setError('Sell price is required'); return }
    if (form.stock !== '' && (parseInt(form.stock) < 0 || Number.isNaN(parseInt(form.stock)))) {
      setError('Stock cannot be negative'); return
    }
    try {
      setSaving(true)
      setError('')
      if (editingProduct) {
        await updateProduct(editingProduct.id, form, editingProduct.stock)
      } else {
        await addProduct(form)
      }
      setShowModal(false)
      await loadData()
    } catch (err) {
      const msg = String(err?.message || err)
      setError(msg.includes('UNIQUE') ? 'SKU already exists' : 'Failed to save product: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!(await confirmDialog('Delete this product?\n\nIf it has history, it will be archived (hidden) instead, so your past sales and reports stay correct.', { okLabel: 'Delete', danger: true }))) return
    try {
      const result = await deleteProduct(id)
      await loadData()
      if (result === 'archived') setNotice('This product has history, so it was archived (hidden) instead of deleted.')
    } catch {
      setError('Failed to delete product')
    }
  }

  async function handleRestock() {
    if (!restockForm.quantity || parseInt(restockForm.quantity) <= 0) {
      setRestockError('Valid quantity is required'); return
    }
    if (!restockForm.date) { setRestockError('Date is required'); return }
    try {
      setRestockSaving(true)
      setRestockError('')
      await restockProduct({
        ...restockForm,
        product_id: restockingProduct.id,
        product_name: restockingProduct.name,
      })
      setShowRestockModal(false)
      await loadData()
    } catch (err) {
      setRestockError('Failed to restock product: ' + (err?.message || err))
    } finally {
      setRestockSaving(false)
    }
  }

  function getStockStatus(product) {
    if (product.stock <= 0) return { label: 'Out of Stock', class: 'bg-red-950 text-red-400 border border-red-800' }
    if (product.stock <= product.low_stock_alert) return { label: 'Low Stock', class: 'bg-yellow-950 text-yellow-400 border border-yellow-800' }
    return { label: 'In Stock', class: 'bg-green-950 text-green-400 border border-green-800' }
  }

  function getMargin(buy, sell) {
    if (!buy || !sell || sell === 0) return null
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
      {notice && (
        <div className="bg-blue-950 border border-blue-800 text-blue-300 px-4 py-3 rounded-lg mb-4 text-sm flex justify-between items-center">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-blue-400 hover:text-white ml-4">✕</button>
        </div>
      )}
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
                    <td className="px-5 py-4 text-gray-300">{formatMoney(parseFloat(p.buy_price))}</td>
                    <td className="px-5 py-4 text-yellow-400 font-semibold">{formatMoney(parseFloat(p.sell_price))}</td>
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
                          onClick={() => openMovementsModal(p)}
                          className="text-gray-400 hover:text-gray-300 text-xs border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition"
                        >
                          History
                        </button>
                        <button
                          onClick={() => openRestockModal(p)}
                          className="text-green-400 hover:text-green-300 text-xs border border-green-900 hover:border-green-700 px-3 py-1.5 rounded-lg transition"
                        >
                          Restock
                        </button>
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
            <span className="text-xs text-gray-500">
              {filtered.length} product{filtered.length !== 1 ? 's' : ''} found
            </span>
            <span className="text-xs text-gray-500">
              Total inventory value: <span className="text-yellow-400 font-semibold">
                {formatMoney(products.reduce((a, p) => a + (p.buy_price * p.stock), 0))}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Add/Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
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
            {error && (
              <div className="bg-red-950 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}
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
                  {PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Unit</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                >
                  {PRODUCT_UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Buy Price *</label>
                <input
                  type="number" min="0" step="0.01"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="0.00"
                  value={form.buy_price}
                  onChange={e => setForm({ ...form, buy_price: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Sell Price *</label>
                <input
                  type="number" min="0" step="0.01"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="0.00"
                  value={form.sell_price}
                  onChange={e => setForm({ ...form, sell_price: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">{editingProduct ? 'Stock (correction)' : 'Initial Stock'}</label>
                <input
                  type="number" min="0"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="0"
                  value={form.stock}
                  onChange={e => setForm({ ...form, stock: e.target.value })}
                />
                {editingProduct && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Only change this to fix a count. Use Restock for new stock. Changes are saved in the stock history.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Low Stock Alert</label>
                <input
                  type="number" min="0"
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
                  &nbsp;·&nbsp; {formatMoney((parseFloat(form.sell_price) - parseFloat(form.buy_price)))} per unit
                </span>
              </div>
            )}

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

      {/* Restock Modal */}
      {showRestockModal && restockingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-yellow-400">Restock Product</h2>
              <button
                onClick={() => setShowRestockModal(false)}
                className="text-gray-500 hover:text-gray-300 text-xl leading-none transition"
              >
                ✕
              </button>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-5">
              <div className="text-sm font-semibold text-white">{restockingProduct.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                Current stock:
                <span className="text-yellow-400 font-semibold ml-1">
                  {restockingProduct.stock} {restockingProduct.unit}
                </span>
              </div>
            </div>
            {restockError && (
              <div className="bg-red-950 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">
                {restockError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Quantity to Add *</label>
                <input
                  type="number" min="1"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="e.g. 50"
                  value={restockForm.quantity}
                  onChange={e => setRestockForm({ ...restockForm, quantity: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Unit Cost</label>
                <input
                  type="number" min="0" step="0.01"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="0.00"
                  value={restockForm.unit_cost}
                  onChange={e => setRestockForm({ ...restockForm, unit_cost: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Supplier</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={restockForm.supplier_id}
                  onChange={e => {
                    const s = suppliers.find(s => s.id == e.target.value)
                    setRestockForm({ ...restockForm, supplier_id: e.target.value, supplier_name: s ? s.name : '' })
                  }}
                >
                  <option value="">No Supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Payment Method</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={restockForm.payment_method}
                  onChange={e => setRestockForm({ ...restockForm, payment_method: e.target.value })}
                >
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Date *</label>
                <input
                  type="date"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  value={restockForm.date}
                  onChange={e => setRestockForm({ ...restockForm, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block uppercase tracking-wide">Note</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition"
                  placeholder="Optional note"
                  value={restockForm.note}
                  onChange={e => setRestockForm({ ...restockForm, note: e.target.value })}
                />
              </div>
            </div>

            {/* Total Cost Preview */}
            {restockForm.quantity && restockForm.unit_cost && (
              <div className="mt-4 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Total restock cost</span>
                  <span className="text-red-400 font-bold text-sm">
                    {formatMoney((parseFloat(restockForm.unit_cost) * parseInt(restockForm.quantity || 0)))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">New average buy price</span>
                  <span className="text-yellow-400 font-bold text-sm">
                    {formatMoney((() => {
                      const currentStock = restockingProduct.stock || 0
                      const currentPrice = restockingProduct.buy_price || 0
                      const newQty = parseInt(restockForm.quantity) || 0
                      const newPrice = parseFloat(restockForm.unit_cost) || 0
                      const totalUnits = currentStock + newQty
                      const totalValue = (currentStock * currentPrice) + (newQty * newPrice)
                      return totalUnits > 0 ? totalValue / totalUnits : newPrice
                    })())}
                  </span>
                </div>
                <p className="text-xs text-gray-500 pt-1">
                  Logged as money out in Transactions. In Profit &amp; Loss the cost is counted when these items are sold.
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => { setShowRestockModal(false); setRestockError('') }}
                className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-5 py-2 rounded-lg text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRestock}
                disabled={restockSaving}
                className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold px-6 py-2 rounded-lg text-sm transition"
              >
                {restockSaving ? 'Saving...' : '+ Add Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Movements Modal */}
      {showMovements && restockingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-yellow-400">Stock History</h2>
                <p className="text-gray-400 text-xs mt-0.5">{restockingProduct.name}</p>
              </div>
              <button
                onClick={() => setShowMovements(false)}
                className="text-gray-500 hover:text-gray-300 text-xl leading-none transition"
              >
                ✕
              </button>
            </div>
            {stockMovements.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <div className="text-4xl mb-3">📦</div>
                <div className="text-sm">No stock movements yet</div>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-96">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-3 py-3 text-gray-400 text-xs uppercase tracking-wide">Type</th>
                      <th className="text-left px-3 py-3 text-gray-400 text-xs uppercase tracking-wide">Qty</th>
                      <th className="text-left px-3 py-3 text-gray-400 text-xs uppercase tracking-wide">Unit Cost</th>
                      <th className="text-left px-3 py-3 text-gray-400 text-xs uppercase tracking-wide">Total</th>
                      <th className="text-left px-3 py-3 text-gray-400 text-xs uppercase tracking-wide">Supplier</th>
                      <th className="text-left px-3 py-3 text-gray-400 text-xs uppercase tracking-wide">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockMovements.map((m, i) => (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition">
                        <td className="px-3 py-3">
                          <span
                            title={m.note || ''}
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${m.type === 'adjustment'
                              ? 'bg-blue-950 text-blue-400 border-blue-800'
                              : 'bg-green-950 text-green-400 border-green-800'}`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className={`px-3 py-3 font-bold ${m.quantity < 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </td>
                        <td className="px-3 py-3 text-gray-300">{formatMoney(parseFloat(m.unit_cost))}</td>
                        <td className="px-3 py-3 text-red-400 font-semibold">{formatMoney(parseFloat(m.total_cost))}</td>
                        <td className="px-3 py-3 text-gray-400 text-xs">{m.supplier_name || '—'}</td>
                        <td className="px-3 py-3 text-gray-400 text-xs">{m.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowMovements(false)}
                className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-6 py-2 rounded-lg text-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}