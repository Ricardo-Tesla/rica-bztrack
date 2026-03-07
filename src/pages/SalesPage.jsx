import { useEffect, useState } from 'react'
import { getSales } from '../services/salesService'
import { downloadReceipt } from '../utils/receiptPrinter'

export default function SalesPage() {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedSale, setSelectedSale] = useState(null)

  useEffect(() => { loadSales() }, [])

  async function loadSales() {
    try {
      setLoading(true)
      const data = await getSales()
      setSales(data)
    } catch (err) {
      setError('Failed to load sales')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const filtered = sales.filter(s =>
    s.receipt_number.toLowerCase().includes(search.toLowerCase()) ||
    (s.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.payment_method || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalRevenue = sales.reduce((a, s) => a + s.total, 0)
  const totalSales = sales.length
  const avgSale = totalSales > 0 ? totalRevenue / totalSales : 0

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">

      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">Sales History</h1>
        <p className="text-gray-400 mt-1 text-sm">All completed sales and transactions</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Sales</div>
          <div className="text-2xl font-bold text-yellow-400">{totalSales}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-yellow-400">${totalRevenue.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Average Sale</div>
          <div className="text-2xl font-bold text-yellow-400">${avgSale.toFixed(2)}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <input
          type="text"
          placeholder="Search by receipt, customer or payment..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white w-80 transition"
        />
        <div className="text-xs text-gray-500">
          {filtered.length} sale{filtered.length !== 1 ? 's' : ''} found
        </div>
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
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Receipt #</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Customer</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Items</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Payment</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Total</th>
              <th className="text-left px-5 py-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Date</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="text-center py-16 text-gray-500">
                  <div className="animate-pulse">Loading sales...</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-16 text-gray-500">
                  <div className="text-5xl mb-4">💳</div>
                  <div className="text-base font-medium text-gray-400">
                    {search ? 'No sales match your search' : 'No sales yet'}
                  </div>
                  <div className="text-sm mt-1">
                    {search ? 'Try a different search term' : 'Complete a sale from the POS page'}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((s, i) => (
                <tr
                  key={s.id}
                  className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                >
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs bg-gray-800 text-yellow-400 px-2 py-1 rounded">
                      {s.receipt_number}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-white font-medium">
                    {s.customer_name || 'Walk-in Customer'}
                  </td>
                  <td className="px-5 py-4 text-gray-300">
                    {s.items?.length || 0} item{s.items?.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2.5 py-1 rounded-full">
                      {s.payment_method}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-yellow-400 font-bold">
                    ${parseFloat(s.total).toFixed(2)}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {formatDate(s.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setSelectedSale(s)}
                      className="text-yellow-400 hover:text-yellow-300 text-xs border border-yellow-800 hover:border-yellow-600 px-3 py-1.5 rounded-lg transition"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full max-w-md shadow-2xl">

            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-yellow-400">Sale Details</h2>
                <p className="text-gray-400 text-xs mt-0.5">{selectedSale.receipt_number}</p>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-gray-500 hover:text-gray-300 text-xl leading-none transition"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Customer</span>
                <span className="text-white font-medium">
                  {selectedSale.customer_name || 'Walk-in Customer'}
                </span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Payment Method</span>
                <span className="text-white font-medium">{selectedSale.payment_method}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Date</span>
                <span className="text-white font-medium">{formatDate(selectedSale.created_at)}</span>
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Items Purchased</div>
              {selectedSale.items?.map((item, i) => (
                <div key={i} className="flex justify-between text-sm mb-2">
                  <span className="text-gray-300">
                    {item.product_name} × {item.quantity}
                  </span>
                  <span className="text-white font-medium">
                    ${parseFloat(item.subtotal).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="border-t border-gray-700 mt-3 pt-3 flex justify-between font-bold">
                <span className="text-white">Total</span>
                <span className="text-yellow-400 text-lg">
                  ${parseFloat(selectedSale.total).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => downloadReceipt(selectedSale)}
                className="flex-1 border border-yellow-600 hover:border-yellow-400 text-yellow-400 hover:text-yellow-300 font-bold py-2.5 rounded-lg transition text-sm"
              >
                🖨️ Print Receipt
              </button>
              <button
                onClick={() => setSelectedSale(null)}
                className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-2.5 rounded-lg transition text-sm"
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