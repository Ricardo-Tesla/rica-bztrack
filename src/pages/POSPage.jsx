import { useEffect, useState } from 'react'
import { getProducts } from '../services/productService'
import { getCustomers } from '../services/customerService'
import { completeSale } from '../services/salesService'
import { downloadReceipt } from '../utils/receiptPrinter'

const PAYMENT_METHODS = ['Cash', 'Card', 'Mobile Money', 'Bank Transfer']

export default function POSPage() {
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [prods, custs] = await Promise.all([getProducts(), getCustomers()])
      setProducts(prods)
      setCustomers(custs)
    } catch (err) {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  function addToCart(product) {
    if (product.stock <= 0) return
    const existing = cart.find(i => i.id === product.id)
    if (existing) {
      if (existing.quantity >= product.stock) return
      setCart(cart.map(i =>
        i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
      ))
    } else {
      setCart([...cart, { ...product, quantity: 1 }])
    }
  }

  function removeFromCart(id) {
    setCart(cart.filter(i => i.id !== id))
  }

  function updateQuantity(id, qty) {
    const product = products.find(p => p.id === id)
    if (qty < 1) { removeFromCart(id); return }
    if (qty > product.stock) return
    setCart(cart.map(i => i.id === id ? { ...i, quantity: qty } : i))
  }

  function clearCart() {
    setCart([])
    setSelectedCustomer(null)
    setPaymentMethod('Cash')
  }

  const subtotal = cart.reduce((a, i) => a + i.sell_price * i.quantity, 0)
  const total = subtotal

  async function handleCompleteSale() {
    if (!cart.length) { setError('Cart is empty'); return }
    try {
      setCompleting(true)
      setError('')
      const result = await completeSale(cart, selectedCustomer, paymentMethod)
      setReceipt({
        ...result,
        items: cart,
        paymentMethod,
        created_at: new Date().toISOString()
      })
      clearCart()
      await loadData()
    } catch (err) {
      setError('Failed to complete sale: ' + (err?.message || err))
      // Nothing was saved. Reload so the stock numbers on screen are current.
      await loadData()
    } finally {
      setCompleting(false)
    }
  }

  function handlePrintReceipt() {
    downloadReceipt({
      receipt_number: receipt.receiptNumber,
      customer_name: receipt.customerName,
      payment_method: receipt.paymentMethod,
      created_at: receipt.created_at,
      subtotal: receipt.total,
      total: receipt.total,
      tax: 0,
      discount: 0,
      items: receipt.items.map(i => ({
        product_name: i.name,
        quantity: i.quantity,
        unit_price: i.sell_price,
        subtotal: i.sell_price * i.quantity
      }))
    })
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Header */}
      <div className="flex flex-col items-center mb-6">
        <h1 className="text-3xl font-bold text-yellow-400">Point of Sale</h1>
        <p className="text-gray-400 mt-1 text-sm">Select products to add to cart</p>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-6 h-[calc(100vh-180px)]">

        {/* LEFT — Products Grid */}
        <div className="flex-1 flex flex-col">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white mb-4 transition"
          />
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="animate-pulse">Loading products...</div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                {filtered.map(p => (
                  <div
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={`bg-gray-900 border rounded-xl p-4 cursor-pointer transition
                      ${p.stock <= 0
                        ? 'border-gray-800 opacity-50 cursor-not-allowed'
                        : 'border-gray-700 hover:border-yellow-400 hover:bg-gray-800'
                      }`}
                  >
                    <div className="font-semibold text-white text-sm mb-1">{p.name}</div>
                    <div className="text-yellow-400 font-bold">${parseFloat(p.sell_price).toFixed(2)}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500">{p.sku}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${p.stock <= 0
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : p.stock <= p.low_stock_alert
                          ? 'bg-yellow-950 text-yellow-400 border border-yellow-800'
                          : 'bg-green-950 text-green-400 border border-green-800'
                        }`}>
                        {p.stock <= 0 ? 'Out' : `${p.stock} left`}
                      </span>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="col-span-3 text-center py-16 text-gray-500">
                    <div className="text-4xl mb-3">📦</div>
                    <div>No products found</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Cart */}
        <div className="w-80 flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-bold text-white">
              🛒 Cart
              {cart.length > 0 && (
                <span className="ml-2 bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                  {cart.reduce((a, i) => a + i.quantity, 0)}
                </span>
              )}
            </h2>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-gray-500 hover:text-red-400 transition">
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {cart.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <div className="text-4xl mb-3">🛒</div>
                <div className="text-sm">Cart is empty</div>
                <div className="text-xs mt-1">Click a product to add it</div>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="mb-3 bg-gray-800 border border-gray-700 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-sm font-semibold text-white flex-1 pr-2">{item.name}</div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-gray-600 hover:text-red-400 text-xs transition"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm transition"
                      >−</button>
                      <span className="text-sm text-white w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm transition"
                      >+</button>
                    </div>
                    <div className="text-yellow-400 font-bold text-sm">
                      ${(item.sell_price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-800 px-5 py-4">

            <div className="mb-3">
              <label className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 block">Customer</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2 text-sm outline-none text-white transition"
                value={selectedCustomer?.id || ''}
                onChange={e => {
                  const c = customers.find(c => c.id == e.target.value)
                  setSelectedCustomer(c || null)
                }}
              >
                <option value="">Walk-in Customer</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 block">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`text-xs py-2 rounded-lg border transition font-medium
                      ${paymentMethod === m
                        ? 'bg-yellow-400 border-yellow-400 text-black'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                      }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-800 pt-3 mb-4">
              <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-white text-lg mt-2">
                <span>Total</span>
                <span className="text-yellow-400">${total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handleCompleteSale}
              disabled={completing || cart.length === 0}
              className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-bold py-3 rounded-lg transition text-sm"
            >
              {completing ? 'Processing...' : '✓ Complete Sale'}
            </button>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-sm shadow-2xl">

            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🧾</div>
              <h2 className="text-xl font-bold text-yellow-400">Sale Complete!</h2>
              <p className="text-gray-400 text-sm mt-1">Receipt #{receipt.receiptNumber}</p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Customer</span>
                <span className="text-white font-medium">{receipt.customerName}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Payment</span>
                <span className="text-white font-medium">{receipt.paymentMethod}</span>
              </div>
              <div className="border-t border-gray-700 my-3"></div>
              {receipt.items.map(item => (
                <div key={item.id} className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-300">{item.name} × {item.quantity}</span>
                  <span className="text-white">${(item.sell_price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-gray-700 mt-3 pt-3 flex justify-between font-bold">
                <span className="text-white">Total</span>
                <span className="text-yellow-400 text-lg">${receipt.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-center text-xs text-gray-500 mb-5">
              Thank you for your business!
            </div>

            <div className="flex gap-3">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 border border-yellow-600 hover:border-yellow-400 text-yellow-400 hover:text-yellow-300 font-bold py-2.5 rounded-lg transition text-sm"
              >
                🖨️ Print Receipt
              </button>
              <button
                onClick={() => setReceipt(null)}
                className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-2.5 rounded-lg transition text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}