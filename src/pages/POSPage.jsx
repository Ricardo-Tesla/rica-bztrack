import { useEffect, useMemo, useRef, useState } from 'react'
import { getProducts, findByCode } from '../services/productService'
import { getCustomers, addCustomer } from '../services/customerService'
import { completeSale, calculateTotals, getSaleById, qtyLabel } from '../services/salesService'
import { vatRate as getVatRate } from '../services/settingsService'
import { printReceipt, downloadReceipt } from '../utils/receiptPrinter'
import { formatMoney, roundQty, customerLabel } from '../utils/format'
import { SALE_PAYMENT_METHODS, PAYMENT_METHODS, METHODS_WITH_REFERENCE, CREDIT, allowsDecimal } from '../utils/constants'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'
import { Alert, Button, Field, Modal, inputClass } from '../components/ui'

const smallInput = 'w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2 text-sm outline-none text-white transition'

export default function POSPage() {
  const { t, settings } = useApp()
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [reference, setReference] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [paidNow, setPaidNow] = useState('')
  const [paidNowMethod, setPaidNowMethod] = useState('Cash')
  const [discount, setDiscount] = useState({ type: 'amount', value: '' })
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [newCustomer, setNewCustomer] = useState(null)
  const searchRef = useRef(null)

  const vatRate = getVatRate(settings)
  const customer = customers.find(c => String(c.id) === String(customerId)) || null
  const isCredit = paymentMethod === CREDIT

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    try {
      setLoading(true)
      const [prods, custs] = await Promise.all([getProducts(), getCustomers()])
      setProducts(prods)
      setCustomers(custs)
    } catch (err) {
      setError(t('Failed to load data') + ': ' + errorText(t, err))
    } finally {
      setLoading(false)
    }
  }

  const focusSearch = () => setTimeout(() => searchRef.current?.focus(), 0)

  function addToCart(product, qty = 1) {
    if (product.stock <= 0) return setError(t('{name} is out of stock', { name: product.name }))
    setError('')
    setCart(current => {
      const existing = current.find(i => i.id === product.id)
      const nextQty = roundQty((existing?.quantity || 0) + qty)
      if (nextQty > product.stock + 0.0005) {
        setError(t('Only {qty} of {name} in stock', { qty: qtyLabel(product.stock, product.unit), name: product.name }))
        return current
      }
      return existing
        ? current.map(i => (i.id === product.id ? { ...i, quantity: nextQty } : i))
        : [...current, { ...product, quantity: qty }]
    })
  }

  function setQuantity(id, value) {
    const product = products.find(p => p.id === id)
    setCart(current => current.map(i => {
      if (i.id !== id) return i
      if (value === '') return { ...i, quantity: '' }
      let q = Number(value)
      if (Number.isNaN(q) || q < 0) return i
      if (!allowsDecimal(i)) q = Math.floor(q)
      if (product && q > product.stock) q = product.stock
      return { ...i, quantity: roundQty(q) }
    }))
  }

  function stepQuantity(id, delta) {
    const item = cart.find(i => i.id === id)
    if (!item) return
    const next = roundQty((Number(item.quantity) || 0) + delta)
    if (next <= 0) return setCart(c => c.filter(i => i.id !== id))
    setQuantity(id, next)
  }

  function clearCart() {
    setCart([])
    setSearch('')
    setCustomerId('')
    setPaymentMethod('Cash')
    setReference('')
    setCashReceived('')
    setPaidNow('')
    setPaidNowMethod('Cash')
    setDiscount({ type: 'amount', value: '' })
    setError('')
  }

  // Barcode scanners type the code and press Enter
  function handleSearchKey(e) {
    if (e.key !== 'Enter') return
    const exact = findByCode(products, search)
    const pick = exact || (filtered.length === 1 ? filtered[0] : null)
    if (pick) {
      addToCart(pick)
      setSearch('')
    } else if (search.trim()) {
      setError(t('No product with code "{code}"', { code: search.trim() }))
    }
  }

  const totals = useMemo(
    () => calculateTotals(cart.filter(i => Number(i.quantity) > 0), { discount, vatRate }),
    [cart, discount, vatRate]
  )
  const change = paymentMethod === 'Cash' && Number(cashReceived) > 0 ? Number(cashReceived) - totals.total : null

  async function handleCompleteSale() {
    const items = cart.filter(i => Number(i.quantity) > 0)
    if (!items.length) return setError(t('Cart is empty'))
    if (isCredit && !customer) return setError(t('Choose a customer for a credit sale'))
    if (isCredit && Number(paidNow) > totals.total) return setError(t('Paid now cannot be more than the total'))
    if (change != null && change < 0) return setError(t('Cash received is less than the total'))
    try {
      setCompleting(true)
      setError('')
      const result = await completeSale(items, {
        customer,
        paymentMethod,
        discount,
        vatRate,
        paymentReference: METHODS_WITH_REFERENCE.includes(paymentMethod) ? reference.trim() : '',
        amountPaid: isCredit ? Number(paidNow) || 0 : null,
        paidNowMethod,
      })
      const sale = await getSaleById(result.saleId)
      setReceipt({ ...sale, cash_received: paymentMethod === 'Cash' ? Number(cashReceived) || 0 : 0 })
      clearCart()
      await loadData()
    } catch (err) {
      setError(t('Failed to complete sale') + ': ' + errorText(t, err))
      await loadData() // nothing was saved; refresh stock on screen
    } finally {
      setCompleting(false)
    }
  }

  async function saveNewCustomer() {
    if (!newCustomer?.name?.trim()) return
    try {
      await addCustomer(newCustomer)
      const custs = await getCustomers()
      setCustomers(custs)
      const created = custs.filter(c => c.name === newCustomer.name.trim()).sort((a, b) => b.id - a.id)[0]
      if (created) setCustomerId(String(created.id))
      setNewCustomer(null)
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort()
  const term = search.toLowerCase()
  const filtered = products.filter(p =>
    (!category || p.category === category) &&
    (p.name.toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term) ||
      (p.barcode || '').toLowerCase().includes(term))
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-yellow-400">{t('Point of Sale')}</h1>
        <p className="text-gray-500 text-xs">{t('Tip: scan a barcode or type a code and press Enter')}</p>
      </div>

      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="flex gap-5 h-[calc(100vh-130px)]">

        {/* LEFT — Products */}
        <div className="flex-1 flex flex-col min-w-0">
          <input
            ref={searchRef}
            autoFocus
            type="text"
            placeholder={t('Search or scan products...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
            className="bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white mb-3 transition"
          />
          {categories.length > 1 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {['', ...categories].map(c => (
                <button
                  key={c || 'all'}
                  onClick={() => setCategory(c)}
                  className={`text-xs px-3 py-1 rounded-full border transition ${category === c ? 'bg-yellow-400 text-black border-yellow-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                >
                  {c ? t(c) : t('All')}
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="animate-pulse">{t('Loading products...')}</div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { addToCart(p); focusSearch() }}
                    disabled={p.stock <= 0}
                    className={`text-left bg-gray-900 border rounded-xl p-4 transition
                      ${p.stock <= 0 ? 'border-gray-800 opacity-50 cursor-not-allowed' : 'border-gray-700 hover:border-yellow-400 hover:bg-gray-800'}`}
                  >
                    <div className="font-semibold text-white text-sm mb-1 line-clamp-2">{p.name}</div>
                    <div className="text-yellow-400 font-bold">{formatMoney(p.sell_price)}</div>
                    <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                      <span className="text-xs text-gray-500 truncate">{p.sku}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap
                        ${p.stock <= 0
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : p.stock <= p.low_stock_alert
                            ? 'bg-yellow-950 text-yellow-400 border border-yellow-800'
                            : 'bg-green-950 text-green-400 border border-green-800'}`}>
                        {p.stock <= 0 ? t('Out') : t('{qty} left', { qty: qtyLabel(p.stock, p.unit) })}
                      </span>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="col-span-full text-center py-16 text-gray-500">
                    <div className="text-4xl mb-3">📦</div>
                    <div>{t('No products found')}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Cart and payment */}
        <div className="w-96 flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-bold text-white">
              🛒 {t('Cart')}
              {cart.length > 0 && <span className="ml-2 bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded-full">{cart.length}</span>}
            </h2>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-gray-500 hover:text-red-400 transition">{t('Clear')}</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <div className="text-4xl mb-3">🛒</div>
                  <div className="text-sm">{t('Cart is empty')}</div>
                  <div className="text-xs mt-1">{t('Click a product to add it')}</div>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="mb-2 bg-gray-800 border border-gray-700 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm font-semibold text-white flex-1 pr-2">{item.name}</div>
                      <button onClick={() => setCart(c => c.filter(i => i.id !== item.id))} className="text-gray-600 hover:text-red-400 text-xs transition">✕</button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => stepQuantity(item.id, -1)} className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm transition">−</button>
                        <input
                          type="number"
                          min="0"
                          step={allowsDecimal(item) ? '0.1' : '1'}
                          value={item.quantity}
                          onChange={e => setQuantity(item.id, e.target.value)}
                          className="w-16 bg-gray-900 border border-gray-700 rounded text-center text-sm text-white py-1 outline-none focus:border-yellow-400"
                        />
                        <button onClick={() => stepQuantity(item.id, 1)} className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm transition">+</button>
                        {allowsDecimal(item) && <span className="text-xs text-gray-500">{qtyLabel(1, item.unit).replace('1 ', '')}</span>}
                      </div>
                      <div className="text-yellow-400 font-bold text-sm">{formatMoney(item.sell_price * (Number(item.quantity) || 0))}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-gray-800 px-5 py-3 space-y-3">
              {/* Customer */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400 uppercase tracking-wide">{t('Customer')}</label>
                  <button onClick={() => setNewCustomer({ name: '', phone: '' })} className="text-xs text-yellow-400 hover:text-yellow-300">+ {t('New')}</button>
                </div>
                <select className={smallInput} value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">{t('Walk-in Customer')}</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>)}
                </select>
                {customer && customer.balance > 0.5 && (
                  <div className="text-xs text-red-400 mt-1">{t('Already owes {amount}', { amount: formatMoney(customer.balance) })}</div>
                )}
              </div>

              {/* Payment method */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide mb-1 block">{t('Payment Method')}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {SALE_PAYMENT_METHODS.map(m => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`text-xs py-2 px-1 rounded-lg border transition font-medium leading-tight
                        ${paymentMethod === m ? 'bg-yellow-400 border-yellow-400 text-black' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}
                    >
                      {t(m)}
                    </button>
                  ))}
                </div>
              </div>

              {METHODS_WITH_REFERENCE.includes(paymentMethod) && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide mb-1 block">{t('Reference')}</label>
                  <input className={smallInput} placeholder={t('Transaction ID / reference (optional)')} value={reference} onChange={e => setReference(e.target.value)} />
                </div>
              )}

              {paymentMethod === 'Cash' && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide mb-1 block">{t('Cash received')}</label>
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <input type="number" min="0" className={smallInput} value={cashReceived} onChange={e => setCashReceived(e.target.value)} placeholder="0" />
                    <div className={`text-sm text-right ${change != null && change < 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {change != null && <>{t('Change')}: <b>{formatMoney(Math.max(0, change))}</b></>}
                    </div>
                  </div>
                </div>
              )}

              {isCredit && (
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2">
                  {!customer && <div className="text-xs text-yellow-400">{t('Choose a customer for a credit sale')}</div>}
                  <label className="text-xs text-gray-400 uppercase tracking-wide block">{t('Paid now (optional)')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" className={smallInput} placeholder="0" value={paidNow} onChange={e => setPaidNow(e.target.value)} />
                    <select className={smallInput} value={paidNowMethod} onChange={e => setPaidNowMethod(e.target.value)}>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(m)}</option>)}
                    </select>
                  </div>
                  <div className="text-xs text-gray-400">
                    {t('Customer will owe')}: <b className="text-red-400">{formatMoney(Math.max(0, totals.total - (Number(paidNow) || 0)))}</b>
                  </div>
                </div>
              )}

              {/* Discount */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide mb-1 block">{t('Discount')}</label>
                <div className="flex gap-2 items-center">
                  <input type="number" min="0" className={smallInput} placeholder="0" value={discount.value} onChange={e => setDiscount({ ...discount, value: e.target.value })} />
                  <div className="flex bg-gray-800 border border-gray-700 rounded-lg p-0.5">
                    {[['amount', 'RWF'], ['percent', '%']].map(([type, label]) => (
                      <button key={type} onClick={() => setDiscount({ ...discount, type })}
                        className={`text-xs px-2.5 py-1.5 rounded-md ${discount.type === type ? 'bg-yellow-400 text-black font-bold' : 'text-gray-400'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {(totals.discountAmount > 0 || totals.vat > 0) && (
                <div className="border-t border-gray-800 pt-2 text-sm space-y-0.5">
                  {totals.discountAmount > 0 && (
                    <>
                      <div className="flex justify-between text-gray-400"><span>{t('Subtotal')}</span><span>{formatMoney(totals.subtotal)}</span></div>
                      <div className="flex justify-between text-gray-400"><span>{t('Discount')}</span><span>-{formatMoney(totals.discountAmount)}</span></div>
                    </>
                  )}
                  {totals.vat > 0 && (
                    <div className="flex justify-between text-gray-500 text-xs"><span>{t('VAT included ({rate}%)', { rate: vatRate })}</span><span>{formatMoney(totals.vat)}</span></div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Always visible: total and the button */}
          <div className="border-t border-gray-800 px-5 pt-3 pb-4">
            <div className="flex justify-between font-bold text-white text-xl mb-3">
              <span>{t('Total')}</span>
              <span className="text-yellow-400">{formatMoney(totals.total)}</span>
            </div>
            <button
              onClick={handleCompleteSale}
              disabled={completing || cart.length === 0}
              className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-bold py-3 rounded-lg transition"
            >
              {completing ? t('Processing...') : `✓ ${t('Complete Sale')}`}
            </button>
          </div>
        </div>
      </div>

      {/* Quick add customer */}
      {newCustomer && (
        <Modal title={t('New customer')} onClose={() => setNewCustomer(null)} width="max-w-sm">
          <div className="space-y-4">
            <Field label={t('Name')}>
              <input className={inputClass} value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t('Phone')}>
              <input className={inputClass} value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="07..." />
            </Field>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setNewCustomer(null)}>{t('Cancel')}</Button>
            <Button onClick={saveNewCustomer} disabled={!newCustomer.name.trim()}>{t('Save')}</Button>
          </div>
        </Modal>
      )}

      {/* Receipt */}
      {receipt && (
        <Modal title={t('Sale Complete!')} subtitle={`${t('Receipt')} #${receipt.receipt_number}`} width="max-w-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4 text-sm">
            <div className="flex justify-between mb-1"><span className="text-gray-400">{t('Customer')}</span><span className="text-white">{customerLabel(receipt.customer_name, t)}</span></div>
            <div className="flex justify-between mb-1"><span className="text-gray-400">{t('Payment')}</span><span className="text-white">{t(receipt.payment_method)}</span></div>
            <div className="border-t border-gray-700 my-2" />
            {receipt.items.map(item => (
              <div key={item.id} className="flex justify-between mb-1">
                <span className="text-gray-300">{item.product_name} × {item.quantity}</span>
                <span className="text-white">{formatMoney(item.subtotal)}</span>
              </div>
            ))}
            <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between font-bold">
              <span className="text-white">{t('Total')}</span>
              <span className="text-yellow-400 text-lg">{formatMoney(receipt.total)}</span>
            </div>
            {receipt.payment_method === CREDIT && (
              <div className="flex justify-between text-red-400 mt-1"><span>{t('Balance due')}</span><span>{formatMoney(receipt.total - receipt.amount_paid)}</span></div>
            )}
            {receipt.cash_received > 0 && (
              <div className="flex justify-between text-green-400 mt-1"><span>{t('Change')}</span><span>{formatMoney(Math.max(0, receipt.cash_received - receipt.total))}</span></div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => printReceipt(receipt, settings)}>🖨️ {t('Print')}</Button>
            <Button variant="secondary" onClick={() => downloadReceipt(receipt, settings)}>{t('Save as text')}</Button>
          </div>
          <Button variant="secondary" className="w-full mt-3" onClick={() => { setReceipt(null); focusSearch() }}>{t('New sale')}</Button>
        </Modal>
      )}
    </div>
  )
}
