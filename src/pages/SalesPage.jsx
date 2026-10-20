import { useEffect, useState } from 'react'
import { getSales, voidSale, setEbmReceiptNumber, qtyLabel } from '../services/salesService'
import { printReceipt, downloadReceipt } from '../utils/receiptPrinter'
import { formatMoney, formatDateTime, roundMoney, customerLabel } from '../utils/format'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'
import { initialRange } from '../utils/dateRanges'
import { saveXlsx } from '../utils/excel'
import { CREDIT } from '../utils/constants'
import DateRangePicker from '../components/DateRangePicker'
import { Alert, Button, Field, Modal, PageHeader, StatCard, inputClass } from '../components/ui'

export default function SalesPage() {
  const { t, settings, can } = useApp()
  const [range, setRange] = useState(() => initialRange('today'))
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [voiding, setVoiding] = useState(null) // { sale, reason }
  const [ebm, setEbm] = useState('')

  async function loadSales() {
    try {
      setLoading(true)
      setSales(await getSales({ from: range.from, to: range.to }))
    } catch (err) {
      setError(t('Failed to load sales') + ': ' + errorText(t, err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadSales() }, [range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps

  function open(sale) {
    setSelected(sale)
    setEbm(sale.ebm_receipt_no || '')
  }

  async function confirmVoid() {
    try {
      await voidSale(voiding.sale, voiding.reason.trim())
      setVoiding(null)
      setSelected(null)
      setNotice(t('Sale {r} was voided. Items are back in stock.', { r: voiding.sale.receipt_number }))
      await loadSales()
    } catch (err) {
      setError(t('Failed to void sale') + ': ' + errorText(t, err))
      setVoiding(null)
    }
  }

  async function saveEbm() {
    try {
      await setEbmReceiptNumber(selected.id, ebm)
      setSelected({ ...selected, ebm_receipt_no: ebm.trim() || null })
      setNotice(t('EBM receipt number saved'))
      await loadSales()
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  async function exportExcel() {
    try {
      const rows = filtered
      const path = await saveXlsx(`sales_${range.from || 'all'}_${range.to || ''}.xlsx`.replace('_.xlsx', '.xlsx'), [
        {
          name: t('Sales'),
          columns: [
            { header: t('Receipt'), key: 'receipt_number' },
            { header: t('Date'), value: s => formatDateTime(s.created_at), width: 20 },
            { header: t('Customer'), value: s => customerLabel(s.customer_name, t) },
            { header: t('Payment'), value: s => t(s.payment_method) },
            { header: t('Reference'), key: 'payment_reference' },
            { header: t('Subtotal'), key: 'subtotal', type: 'money' },
            { header: t('Discount'), key: 'discount', type: 'money' },
            { header: t('Total'), key: 'total', type: 'money' },
            { header: t('VAT'), key: 'tax', type: 'money' },
            { header: t('Paid'), key: 'amount_paid', type: 'money' },
            { header: t('Status'), value: s => (s.status === 'voided' ? t('Voided') : t('Completed')) },
            { header: t('Served by'), key: 'user_name' },
            { header: t('EBM receipt'), key: 'ebm_receipt_no' },
          ],
          rows,
        },
        {
          name: t('Items'),
          columns: [
            { header: t('Receipt'), key: 'receipt_number' },
            { header: t('Product'), key: 'product_name' },
            { header: t('Quantity'), key: 'quantity', type: 'number' },
            { header: t('Unit price'), key: 'unit_price', type: 'money' },
            { header: t('Total'), key: 'subtotal', type: 'money' },
            { header: t('Status'), value: i => (i.status === 'voided' ? t('Voided') : t('Completed')) },
          ],
          rows: rows.flatMap(s => s.items.map(i => ({ ...i, receipt_number: s.receipt_number, status: s.status }))),
        },
      ])
      if (path) setNotice(t('Saved to {path}', { path }))
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  const term = search.toLowerCase()
  const filtered = sales.filter(s =>
    s.receipt_number.toLowerCase().includes(term) ||
    (s.customer_name || '').toLowerCase().includes(term) ||
    (s.payment_method || '').toLowerCase().includes(term) ||
    (s.payment_reference || '').toLowerCase().includes(term) ||
    (s.user_name || '').toLowerCase().includes(term)
  )

  // Voided sales are listed but not counted
  const completed = filtered.filter(s => s.status !== 'voided')
  const totalRevenue = completed.reduce((a, s) => a + s.total, 0)
  const onCredit = completed.filter(s => s.payment_method === CREDIT).reduce((a, s) => a + (s.total - (s.amount_paid ?? s.total)), 0)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <PageHeader title={t('Sales History')} subtitle={t('All sales, receipts and voids')}>
        <DateRangePicker value={range} onChange={setRange} />
        {can('export') && <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>⬇ {t('Excel')}</Button>}
      </PageHeader>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label={t('Sales')} value={completed.length} />
        <StatCard label={t('Revenue')} value={formatMoney(totalRevenue)} />
        <StatCard label={t('Average sale')} value={formatMoney(completed.length ? totalRevenue / completed.length : 0)} />
        <StatCard label={t('Sold on credit (unpaid)')} value={formatMoney(onCredit)} tone={onCredit > 0 ? 'red' : 'white'} />
      </div>

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <Alert onClose={() => setError('')}>{error}</Alert>

      <input
        type="text"
        placeholder={t('Search by receipt, customer, payment, reference or cashier...')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-4 py-2.5 text-sm outline-none text-white mb-4 transition"
      />

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-5 py-3">{t('Receipt')}</th>
              <th className="px-5 py-3">{t('Customer')}</th>
              <th className="px-5 py-3">{t('Items')}</th>
              <th className="px-5 py-3">{t('Payment')}</th>
              <th className="px-5 py-3">{t('Total')}</th>
              <th className="px-5 py-3">{t('Date')}</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500 animate-pulse">{t('Loading...')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">{t('No sales in this period')}</td></tr>
            ) : filtered.map((s, i) => (
              <tr key={s.id} className={`border-b border-gray-800 hover:bg-gray-800 transition ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}>
                <td className="px-5 py-3">
                  <span className="font-mono text-xs bg-gray-800 text-yellow-400 px-2 py-1 rounded">{s.receipt_number}</span>
                  {s.status === 'voided' && <span className="ml-2 text-xs bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full font-semibold">{t('Voided')}</span>}
                </td>
                <td className="px-5 py-3 text-white">{customerLabel(s.customer_name, t)}</td>
                <td className="px-5 py-3 text-gray-300">{s.items.length}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${s.payment_method === CREDIT ? 'bg-red-950 text-red-300 border-red-800' : 'bg-gray-800 text-gray-300 border-gray-700'}`}>{t(s.payment_method)}</span>
                </td>
                <td className={`px-5 py-3 font-bold ${s.status === 'voided' ? 'text-gray-500 line-through' : 'text-yellow-400'}`}>{formatMoney(s.total)}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{formatDateTime(s.created_at)}</td>
                <td className="px-5 py-3">
                  <button onClick={() => open(s)} className="text-yellow-400 hover:text-yellow-300 text-xs border border-yellow-800 hover:border-yellow-600 px-3 py-1.5 rounded-lg transition">{t('View')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal
          title={t('Sale Details')}
          subtitle={`${selected.receipt_number}${selected.status === 'voided' ? ' · ' + t('VOIDED') : ''}`}
          onClose={() => setSelected(null)}
          width="max-w-md"
        >
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4 text-sm space-y-1.5">
            <Row label={t('Customer')} value={customerLabel(selected.customer_name, t)} />
            <Row label={t('Payment')} value={t(selected.payment_method)} />
            {selected.payment_reference && <Row label={t('Reference')} value={selected.payment_reference} />}
            <Row label={t('Date')} value={formatDateTime(selected.created_at)} />
            {selected.user_name && <Row label={t('Served by')} value={selected.user_name} />}
            {selected.status === 'voided' && (
              <Row label={t('Voided')} value={`${formatDateTime(selected.voided_at)}${selected.voided_by ? ' — ' + selected.voided_by : ''}${selected.void_reason ? ' (' + selected.void_reason + ')' : ''}`} danger />
            )}
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4 text-sm">
            {selected.items.map(item => (
              <div key={item.id} className="flex justify-between mb-1.5">
                <span className="text-gray-300">{item.product_name} × {qtyLabel(item.quantity)}</span>
                <span className="text-white">{formatMoney(item.subtotal)}</span>
              </div>
            ))}
            <div className="border-t border-gray-700 mt-3 pt-3 space-y-1">
              {selected.discount > 0 && <>
                <Row label={t('Subtotal')} value={formatMoney(selected.subtotal)} />
                <Row label={t('Discount')} value={'-' + formatMoney(selected.discount)} />
              </>}
              {selected.tax > 0 && <Row label={t('VAT included')} value={formatMoney(selected.tax)} />}
              <div className="flex justify-between font-bold">
                <span className="text-white">{t('Total')}</span>
                <span className="text-yellow-400 text-lg">{formatMoney(selected.total)}</span>
              </div>
              {selected.payment_method === CREDIT && <>
                <Row label={t('Paid at sale')} value={formatMoney(selected.amount_paid)} />
                <Row label={t('Unpaid')} value={formatMoney(roundMoney(selected.total - selected.amount_paid))} danger />
              </>}
            </div>
          </div>

          {can('edit_ebm') ? (
            <div className="flex gap-2 items-end mb-4">
              <Field label={t('EBM receipt number')} className="flex-1">
                <input className={inputClass} value={ebm} onChange={e => setEbm(e.target.value)} placeholder={t('Optional')} />
              </Field>
              <Button variant="secondary" onClick={saveEbm} disabled={(ebm || '') === (selected.ebm_receipt_no || '')}>{t('Save')}</Button>
            </div>
          ) : selected.ebm_receipt_no ? (
            <p className="text-sm text-gray-400 mb-4">{t('EBM receipt')}: {selected.ebm_receipt_no}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => printReceipt(selected, settings)}>🖨️ {t('Print')}</Button>
            <Button variant="secondary" onClick={() => downloadReceipt(selected, settings)}>{t('Save as text')}</Button>
          </div>
          {can('void_sale') && selected.status !== 'voided' && (
            <Button variant="danger" className="w-full mt-3" onClick={() => setVoiding({ sale: selected, reason: '' })}>↩ {t('Void Sale')}</Button>
          )}
        </Modal>
      )}

      {voiding && (
        <Modal title={t('Void sale')} subtitle={`${voiding.sale.receipt_number} — ${formatMoney(voiding.sale.total)}`} onClose={() => setVoiding(null)} width="max-w-md">
          <p className="text-sm text-gray-300 mb-4">
            {t('The items go back into stock and a refund is recorded in Transactions. This cannot be undone.')}
          </p>
          <Field label={t('Reason')}>
            <input className={inputClass} value={voiding.reason} onChange={e => setVoiding({ ...voiding, reason: e.target.value })} placeholder={t('e.g. customer returned the goods')} autoFocus />
          </Field>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setVoiding(null)}>{t('Cancel')}</Button>
            <Button variant="danger" onClick={confirmVoid} disabled={!voiding.reason.trim()}>{t('Void sale')}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Row({ label, value, danger = false }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium text-right ${danger ? 'text-red-400' : 'text-white'}`}>{value}</span>
    </div>
  )
}
