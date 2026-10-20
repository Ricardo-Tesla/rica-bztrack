// Receipts: one layout, printed on a receipt printer (58 / 80 mm) or saved as text.
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'
import { formatMoney, formatDateTime, formatQty, roundMoney, customerLabel } from './format'
import { t } from '../i18n'
import { CREDIT } from './constants'

// Build the receipt content (same for printing and text)
export function buildReceiptModel(sale, settings = {}) {
  const items = (sale.items || []).map(item => {
    const qty = Number(item.quantity)
    const unitPrice = parseFloat(item.unit_price ?? item.sell_price ?? 0)
    return {
      name: item.product_name || item.name || 'Item',
      detail: `${formatQty(qty)} x ${formatMoney(unitPrice)}`,
      total: formatMoney(parseFloat(item.subtotal ?? unitPrice * qty)),
    }
  })

  const total = parseFloat(sale.total) || 0
  const subtotal = parseFloat(sale.subtotal ?? total) || 0
  const discount = parseFloat(sale.discount) || 0
  const vat = parseFloat(sale.tax) || 0
  const isCredit = sale.payment_method === CREDIT
  const paid = sale.amount_paid != null ? parseFloat(sale.amount_paid) : total

  const totals = []
  if (discount > 0) {
    totals.push([t('Subtotal'), formatMoney(subtotal)])
    totals.push([t('Discount'), '-' + formatMoney(discount)])
  }
  const grand = [t('TOTAL'), formatMoney(total)]
  const after = []
  if (vat > 0) after.push([t('VAT included ({rate}%)', { rate: settings.vat_rate || 18 }), formatMoney(vat)])
  after.push([t('Payment'), t(sale.payment_method || 'Cash')])
  if (sale.payment_reference) after.push([t('Reference'), sale.payment_reference])
  if (isCredit) {
    after.push([t('Paid now'), formatMoney(paid)])
    after.push([t('Balance due'), formatMoney(roundMoney(total - paid))])
  }
  if (sale.cash_received > 0) {
    after.push([t('Cash received'), formatMoney(sale.cash_received)])
    after.push([t('Change'), formatMoney(Math.max(0, sale.cash_received - total))])
  }

  const header = [settings.business_name || 'Rica BizTrack']
  if (settings.business_address) header.push(settings.business_address)
  if (settings.business_phone) header.push(`${t('Tel')}: ${settings.business_phone}`)
  if (settings.business_tin) header.push(`TIN: ${settings.business_tin}`)

  const info = [
    [t('Receipt'), sale.receipt_number],
    [t('Date'), formatDateTime(sale.created_at)],
  ]
  if (sale.user_name) info.push([t('Served by'), sale.user_name])
  info.push([t('Customer'), customerLabel(sale.customer_name, t)])
  if (sale.ebm_receipt_no) info.push([t('EBM receipt'), sale.ebm_receipt_no])

  const footer = []
  if (settings.receipt_footer) footer.push(settings.receipt_footer)
  footer.push(t('This is not an EBM / tax invoice'))

  return {
    header, info, items, totals, grand, after, footer,
    voided: sale.status === 'voided',
    itemCount: (sale.items || []).reduce((a, i) => a + Number(i.quantity), 0),
  }
}

// ── Text version (.txt file) ─────────────────────────────
export function renderReceiptText(model, width = 40) {
  const line = '='.repeat(width)
  const dline = '-'.repeat(width)
  const center = text => ' '.repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text
  const row = (left, right) => left + ' '.repeat(Math.max(1, width - left.length - right.length)) + right

  const out = [line, ...model.header.map(center), line]
  if (model.voided) out.push(center(`*** ${t('VOIDED')} ***`), dline)
  model.info.forEach(([k, v]) => out.push(row(`${k}:`, String(v ?? ''))))
  out.push(dline)
  model.items.forEach(i => { out.push(i.name.slice(0, width)); out.push(row(`  ${i.detail}`, i.total)) })
  out.push(dline)
  model.totals.forEach(([k, v]) => out.push(row(k, v)))
  out.push(row(model.grand[0], model.grand[1]))
  out.push(dline)
  model.after.forEach(([k, v]) => out.push(row(`${k}:`, String(v))))
  out.push(line)
  model.footer.forEach(f => out.push(center(f)))
  out.push(line, '')
  return out.join('\n')
}

// Backwards-compatible helper
export function generateReceipt(sale, settings = {}) {
  return renderReceiptText(buildReceiptModel(sale, settings))
}

// ── Printed version ──────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function renderReceiptHtml(model) {
  const rows = pairs => pairs.map(([k, v]) => `<div class="r"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')
  return `
    <div class="c b big">${esc(model.header[0])}</div>
    ${model.header.slice(1).map(h => `<div class="c">${esc(h)}</div>`).join('')}
    <div class="hr"></div>
    ${model.voided ? `<div class="c b">*** ${esc(t('VOIDED'))} ***</div><div class="hr"></div>` : ''}
    ${rows(model.info)}
    <div class="hr"></div>
    ${model.items.map(i => `<div class="b">${esc(i.name)}</div><div class="r"><span>&nbsp;&nbsp;${esc(i.detail)}</span><span>${esc(i.total)}</span></div>`).join('')}
    <div class="hr"></div>
    ${rows(model.totals)}
    <div class="r b big"><span>${esc(model.grand[0])}</span><span>${esc(model.grand[1])}</span></div>
    <div class="hr"></div>
    ${rows(model.after)}
    <div class="hr"></div>
    ${model.footer.map(f => `<div class="c">${esc(f)}</div>`).join('')}
  `
}

// Print on the receipt printer. Windows shows the print dialog; choose the
// receipt printer once and Windows remembers it.
export function printReceipt(sale, settings = {}) {
  const width = settings.paper_width === '58' ? 58 : 80
  let root = document.getElementById('print-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'print-root'
    document.body.appendChild(root)
  }
  let pageStyle = document.getElementById('print-page-style')
  if (!pageStyle) {
    pageStyle = document.createElement('style')
    pageStyle.id = 'print-page-style'
    document.head.appendChild(pageStyle)
  }
  pageStyle.textContent = `@page { size: ${width}mm auto; margin: 0; } #print-root { width: ${width - 8}mm; }`
  root.innerHTML = renderReceiptHtml(buildReceiptModel(sale, settings))
  window.print()
}

// Save as a .txt file
export async function downloadReceipt(sale, settings = {}) {
  const content = renderReceiptText(buildReceiptModel(sale, settings), settings.paper_width === '58' ? 32 : 40)
  try {
    const filePath = await save({
      defaultPath: `${sale.receipt_number}.txt`,
      filters: [{ name: 'Text Receipt', extensions: ['txt'] }]
    })
    if (!filePath) return
    await writeTextFile(filePath, content)
  } catch (err) {
    console.error('Failed to save receipt:', err)
  }
}
