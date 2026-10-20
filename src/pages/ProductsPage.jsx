import { useEffect, useState } from 'react'
import { getProducts, addProduct, updateProduct, deleteProduct } from '../services/productService'
import { getSuppliers } from '../services/supplierService'
import { restockProduct, getStockMovements } from '../services/restockService'
import { qtyLabel } from '../services/salesService'
import { isVatEnabled } from '../services/settingsService'
import { formatMoney, formatDate, todayLocal } from '../utils/format'
import { PAYMENT_METHODS, PRODUCT_CATEGORIES, PRODUCT_UNITS, allowsDecimal } from '../utils/constants'
import { confirmDialog } from '../utils/dialogs'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'
import { saveXlsx } from '../utils/excel'
import { Alert, Button, Field, Modal, PageHeader, StatCard, inputClass } from '../components/ui'

const emptyForm = {
  name: '', sku: '', barcode: '', category: 'Other', unit: 'Piece',
  buy_price: '', sell_price: '', stock: '', low_stock_alert: '5',
  supplier_id: '', vat_exempt: false,
}

const emptyRestock = () => ({
  quantity: '', unit_cost: '', supplier_id: '',
  supplier_name: '', payment_method: 'Cash',
  note: '', date: todayLocal(),
})

const MOVEMENT_STYLES = {
  restock: 'bg-green-950 text-green-400 border-green-800',
  adjustment: 'bg-blue-950 text-blue-400 border-blue-800',
  return: 'bg-yellow-950 text-yellow-400 border-yellow-800',
}

export default function ProductsPage() {
  const { t, settings } = useApp()
  const vatOn = isVatEnabled(settings)
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [stockFilter, setStockFilter] = useState('all')
  const [editing, setEditing] = useState(null) // null | 'new' | product
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [restocking, setRestocking] = useState(null)
  const [restockForm, setRestockForm] = useState(emptyRestock)
  const [history, setHistory] = useState(null) // { product, movements }

  async function loadData() {
    try {
      setLoading(true)
      const [prods, sups] = await Promise.all([getProducts(), getSuppliers()])
      setProducts(prods)
      setSuppliers(sups)
    } catch (err) {
      setError(t('Failed to load products') + ': ' + errorText(t, err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openForm(product) {
    setError('')
    setEditing(product || 'new')
    setForm(product ? {
      name: product.name || '', sku: product.sku || '', barcode: product.barcode || '',
      category: product.category || 'Other', unit: product.unit || 'Piece',
      buy_price: product.buy_price ?? '', sell_price: product.sell_price ?? '',
      stock: product.stock ?? '', low_stock_alert: product.low_stock_alert ?? '5',
      supplier_id: product.supplier_id || '', vat_exempt: !!product.vat_exempt,
    } : emptyForm)
  }

  async function handleSave() {
    if (!form.name.trim()) return setError(t('Product name is required'))
    if (!form.sku.trim()) return setError(t('SKU is required'))
    if (!(parseFloat(form.sell_price) > 0)) return setError(t('Sell price is required'))
    const stock = parseFloat(form.stock)
    if (form.stock !== '' && (Number.isNaN(stock) || stock < 0)) return setError(t('Stock cannot be negative'))
    if (form.stock !== '' && !allowsDecimal(form.unit) && !Number.isInteger(stock)) return setError(t('This unit can only be stocked in whole numbers'))
    if (parseFloat(form.buy_price) > parseFloat(form.sell_price)) {
      const ok = await confirmDialog(t('The sell price is lower than the buy price. You will lose money on every sale. Save anyway?'))
      if (!ok) return
    }
    try {
      setSaving(true)
      setError('')
      if (editing === 'new') await addProduct(form)
      else await updateProduct(editing.id, form, editing.stock)
      setEditing(null)
      await loadData()
    } catch (err) {
      const msg = errorText(t, err)
      setError(msg.includes('products.sku') ? t('SKU already exists')
        : msg.includes('barcode') || msg.includes('idx_products_barcode') ? t('Another product already has this barcode')
          : t('Failed to save product') + ': ' + msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(product) {
    if (!(await confirmDialog(t('Delete {name}?', { name: product.name }) + '\n\n' + t('If it has history, it will be archived (hidden) instead, so your past sales and reports stay correct.'), { okLabel: t('Delete'), danger: true }))) return
    try {
      const result = await deleteProduct(product.id)
      await loadData()
      if (result === 'archived') setNotice(t('This product has history, so it was archived (hidden) instead of deleted.'))
    } catch (err) {
      setError(t('Failed to delete product') + ': ' + errorText(t, err))
    }
  }

  function openRestock(product) {
    setError('')
    setRestocking(product)
    setRestockForm({
      ...emptyRestock(),
      unit_cost: product.buy_price || '',
      supplier_id: product.supplier_id || '',
      supplier_name: suppliers.find(s => s.id === product.supplier_id)?.name || '',
    })
  }

  async function handleRestock() {
    const qty = parseFloat(restockForm.quantity)
    if (!(qty > 0)) return setError(t('Valid quantity is required'))
    if (!allowsDecimal(restocking) && !Number.isInteger(qty)) return setError(t('This unit can only be stocked in whole numbers'))
    if (!restockForm.date) return setError(t('Date is required'))
    try {
      setSaving(true)
      setError('')
      await restockProduct({ ...restockForm, product_id: restocking.id, product_name: restocking.name, unit: restocking.unit })
      setNotice(t('{qty} added to {name}', { qty: qtyLabel(qty, restocking.unit), name: restocking.name }))
      setRestocking(null)
      await loadData()
    } catch (err) {
      setError(t('Failed to restock product') + ': ' + errorText(t, err))
    } finally {
      setSaving(false)
    }
  }

  async function openHistory(product) {
    try {
      setHistory({ product, movements: await getStockMovements(product.id) })
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  async function exportStock() {
    try {
      const path = await saveXlsx(`stock_${todayLocal()}.xlsx`, [{
        name: t('Stock'),
        columns: [
          { header: t('Name'), key: 'name' },
          { header: 'SKU', key: 'sku' },
          { header: t('Barcode'), key: 'barcode' },
          { header: t('Category'), value: p => t(p.category || '') },
          { header: t('Unit'), value: p => t(p.unit || '') },
          { header: t('Stock'), key: 'stock', type: 'number' },
          { header: t('Buy price'), key: 'buy_price', type: 'money' },
          { header: t('Sell price'), key: 'sell_price', type: 'money' },
          { header: t('Stock value (cost)'), value: p => Math.max(0, p.stock) * p.buy_price, type: 'money' },
          { header: t('Supplier'), key: 'supplier_name' },
        ],
        rows: products,
      }])
      if (path) setNotice(t('Saved to {path}', { path }))
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  const statusOf = p => (p.stock <= 0 ? 'out' : p.stock <= p.low_stock_alert ? 'low' : 'ok')
  const STATUS = {
    out: { label: t('Out of Stock'), cls: 'bg-red-950 text-red-400 border border-red-800' },
    low: { label: t('Low Stock'), cls: 'bg-yellow-950 text-yellow-400 border border-yellow-800' },
    ok: { label: t('In Stock'), cls: 'bg-green-950 text-green-400 border border-green-800' },
  }

  const term = search.toLowerCase()
  const filtered = products.filter(p =>
    (stockFilter === 'all' || statusOf(p) === stockFilter || (stockFilter === 'low' && statusOf(p) === 'out')) && (
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      (p.barcode || '').toLowerCase().includes(term) ||
      (p.category || '').toLowerCase().includes(term))
  )
  const stockValue = products.reduce((a, p) => a + Math.max(0, p.stock) * p.buy_price, 0)
  const lowCount = products.filter(p => statusOf(p) !== 'ok').length

  const margin = (buy, sell) => (sell > 0 && buy > 0 ? (((sell - buy) / sell) * 100).toFixed(1) : null)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <PageHeader title={t('Products')} subtitle={t('Manage your product inventory')}>
        <Button variant="secondary" onClick={exportStock} disabled={!products.length}>⬇ {t('Excel')}</Button>
        <Button onClick={() => openForm(null)}>+ {t('Add Product')}</Button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label={t('Products')} value={products.length} />
        <StatCard label={t('Low or out of stock')} value={lowCount} tone={lowCount ? 'red' : 'white'} />
        <StatCard label={t('Stock value (cost)')} value={formatMoney(stockValue)} />
      </div>

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      {!editing && !restocking && <Alert onClose={() => setError('')}>{error}</Alert>}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder={t('Search by name, SKU, barcode or category...')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white transition"
        />
        <select value={stockFilter} onChange={e => setStockFilter(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
          <option value="all">{t('All products')}</option>
          <option value="low">{t('Low or out of stock')}</option>
          <option value="out">{t('Out of Stock')}</option>
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-5 py-3">{t('Name')}</th>
              <th className="px-5 py-3">SKU</th>
              <th className="px-5 py-3">{t('Buy price')}</th>
              <th className="px-5 py-3">{t('Sell price')}</th>
              <th className="px-5 py-3">{t('Margin')}</th>
              <th className="px-5 py-3">{t('Stock')}</th>
              <th className="px-5 py-3">{t('Status')}</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500 animate-pulse">{t('Loading products...')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-3">📦</div>
                {search ? t('No products match your search') : t('No products yet. Click "Add Product" to get started.')}
              </td></tr>
            ) : filtered.map((p, i) => {
              const m = margin(p.buy_price, p.sell_price)
              const st = STATUS[statusOf(p)]
              return (
                <tr key={p.id} className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-white">{p.name}</div>
                    <div className="text-xs text-gray-500">
                      {[t(p.category || ''), p.supplier_name, vatOn && p.vat_exempt ? t('VAT exempt') : null].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">{p.sku}</span>
                    {p.barcode && <div className="font-mono text-xs text-gray-500 mt-1">▮▯▮ {p.barcode}</div>}
                  </td>
                  <td className="px-5 py-3 text-gray-300">{formatMoney(p.buy_price)}</td>
                  <td className="px-5 py-3 text-yellow-400 font-semibold">{formatMoney(p.sell_price)}</td>
                  <td className="px-5 py-3">{m !== null ? <span className={`text-xs font-semibold ${m < 0 ? 'text-red-400' : 'text-green-400'}`}>{m}%</span> : <span className="text-gray-600">—</span>}</td>
                  <td className="px-5 py-3 text-gray-300 whitespace-nowrap">{qtyLabel(p.stock, p.unit)} {allowsDecimal(p) ? '' : t(p.unit || '')}</td>
                  <td className="px-5 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openHistory(p)} className="text-gray-400 hover:text-gray-300 text-xs border border-gray-700 px-2.5 py-1.5 rounded-lg">{t('History')}</button>
                      <button onClick={() => openRestock(p)} className="text-green-400 hover:text-green-300 text-xs border border-green-900 px-2.5 py-1.5 rounded-lg">{t('Restock')}</button>
                      <button onClick={() => openForm(p)} className="text-yellow-400 hover:text-yellow-300 text-xs border border-yellow-800 px-2.5 py-1.5 rounded-lg">{t('Edit')}</button>
                      <button onClick={() => handleDelete(p)} className="text-red-400 hover:text-red-300 text-xs border border-red-900 px-2.5 py-1.5 rounded-lg">{t('Delete')}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? t('Add Product') : t('Edit Product')} onClose={() => setEditing(null)}>
          <Alert onClose={() => setError('')}>{error}</Alert>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Product name') + ' *'} className="col-span-2">
              <input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label={'SKU *'} hint={t('Your own short code, e.g. RICE-25')}>
              <input className={inputClass} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label={t('Barcode')} hint={t('Click here and scan the product')}>
              <input className={inputClass} value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} />
            </Field>
            <Field label={t('Category')}>
              <select className={inputClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
              </select>
            </Field>
            <Field label={t('Unit')} hint={allowsDecimal(form.unit) ? t('Can be sold in parts, e.g. 1.5') : null}>
              <select className={inputClass} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                {PRODUCT_UNITS.map(u => <option key={u} value={u}>{t(u)}</option>)}
              </select>
            </Field>
            <Field label={t('Buy price')}>
              <input type="number" min="0" className={inputClass} value={form.buy_price} onChange={e => setForm({ ...form, buy_price: e.target.value })} />
            </Field>
            <Field label={t('Sell price') + ' *'}>
              <input type="number" min="0" className={inputClass} value={form.sell_price} onChange={e => setForm({ ...form, sell_price: e.target.value })} />
            </Field>
            <Field
              label={editing === 'new' ? t('Initial Stock') : t('Stock (correction)')}
              hint={editing !== 'new' ? t('Only change this to fix a count. Use Restock for new stock. Changes are saved in the stock history.') : null}
            >
              <input type="number" min="0" step={allowsDecimal(form.unit) ? '0.001' : '1'} className={inputClass} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
            </Field>
            <Field label={t('Low Stock Alert')}>
              <input type="number" min="0" className={inputClass} value={form.low_stock_alert} onChange={e => setForm({ ...form, low_stock_alert: e.target.value })} />
            </Field>
            <Field label={t('Supplier')} className="col-span-2">
              <select className={inputClass} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">{t('None')}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {vatOn && (
              <label className="col-span-2 flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={form.vat_exempt} onChange={e => setForm({ ...form, vat_exempt: e.target.checked })} />
                {t('This product is VAT exempt / zero-rated')}
              </label>
            )}
          </div>
          {parseFloat(form.sell_price) > 0 && parseFloat(form.buy_price) > 0 && (
            <div className="mt-4 text-xs text-gray-400">
              {t('Profit per unit')}: <span className="text-green-400 font-semibold">{formatMoney(form.sell_price - form.buy_price)}</span>
              {' · '}{t('Margin')}: <span className="text-green-400 font-semibold">{margin(form.buy_price, form.sell_price)}%</span>
            </div>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? t('Saving...') : t('Save')}</Button>
          </div>
        </Modal>
      )}

      {restocking && (
        <Modal title={t('Restock Product')} subtitle={`${restocking.name} — ${t('in stock')}: ${qtyLabel(restocking.stock, restocking.unit)}`} onClose={() => setRestocking(null)}>
          <Alert onClose={() => setError('')}>{error}</Alert>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Quantity') + ' *'}>
              <input type="number" min="0" step={allowsDecimal(restocking) ? '0.001' : '1'} className={inputClass} value={restockForm.quantity} onChange={e => setRestockForm({ ...restockForm, quantity: e.target.value })} autoFocus />
            </Field>
            <Field label={t('Cost per unit')}>
              <input type="number" min="0" className={inputClass} value={restockForm.unit_cost} onChange={e => setRestockForm({ ...restockForm, unit_cost: e.target.value })} />
            </Field>
            <Field label={t('Supplier')}>
              <select className={inputClass} value={restockForm.supplier_id} onChange={e => {
                const s = suppliers.find(x => String(x.id) === e.target.value)
                setRestockForm({ ...restockForm, supplier_id: e.target.value, supplier_name: s ? s.name : '' })
              }}>
                <option value="">{t('None')}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label={t('Paid with')}>
              <select className={inputClass} value={restockForm.payment_method} onChange={e => setRestockForm({ ...restockForm, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(m)}</option>)}
              </select>
            </Field>
            <Field label={t('Date') + ' *'}>
              <input type="date" className={inputClass} value={restockForm.date} onChange={e => setRestockForm({ ...restockForm, date: e.target.value })} />
            </Field>
            <Field label={t('Note')}>
              <input className={inputClass} value={restockForm.note} onChange={e => setRestockForm({ ...restockForm, note: e.target.value })} placeholder={t('Optional')} />
            </Field>
          </div>
          {parseFloat(restockForm.quantity) > 0 && parseFloat(restockForm.unit_cost) > 0 && (() => {
            const qty = parseFloat(restockForm.quantity)
            const cost = parseFloat(restockForm.unit_cost)
            const current = Math.max(0, restocking.stock)
            const avg = (current * restocking.buy_price + qty * cost) / (current + qty)
            return (
              <div className="mt-4 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">{t('Total cost')}</span><span className="text-red-400 font-bold">{formatMoney(qty * cost)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">{t('New average buy price')}</span><span className="text-yellow-400 font-bold">{formatMoney(avg)}</span></div>
                <p className="text-xs text-gray-500 pt-1">{t('Logged as money out in Transactions. In Profit & Loss the cost is counted when these items are sold.')}</p>
              </div>
            )
          })()}
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setRestocking(null)}>{t('Cancel')}</Button>
            <Button onClick={handleRestock} disabled={saving}>{saving ? t('Saving...') : t('Add stock')}</Button>
          </div>
        </Modal>
      )}

      {history && (
        <Modal title={t('Stock history')} subtitle={history.product.name} onClose={() => setHistory(null)} width="max-w-3xl">
          {history.movements.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">{t('No stock movements yet')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-800">
                  <th className="py-2">{t('Type')}</th><th>{t('Quantity')}</th><th>{t('Cost per unit')}</th><th>{t('Supplier / note')}</th><th>{t('By')}</th><th>{t('Date')}</th>
                </tr>
              </thead>
              <tbody>
                {history.movements.map(m => (
                  <tr key={m.id} className="border-b border-gray-800">
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${MOVEMENT_STYLES[m.type] || MOVEMENT_STYLES.restock}`}>{t(m.type)}</span></td>
                    <td className={`font-bold ${m.quantity < 0 ? 'text-red-400' : 'text-green-400'}`}>{m.quantity > 0 ? '+' : ''}{qtyLabel(m.quantity, history.product.unit)}</td>
                    <td className="text-gray-300">{m.unit_cost ? formatMoney(m.unit_cost) : '—'}</td>
                    <td className="text-gray-400 text-xs">{m.supplier_name || m.note || '—'}</td>
                    <td className="text-gray-500 text-xs">{m.user_name || '—'}</td>
                    <td className="text-gray-400 text-xs">{formatDate(m.date)}</td>
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
