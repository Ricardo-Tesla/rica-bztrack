// Generate a thermal-style receipt as plain text

import { writeTextFile } from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'
import { formatMoney, parseDbDate } from './format'


export function generateReceipt(sale) {
  const WIDTH = 40
  const line = '='.repeat(WIDTH)
  const dline = '-'.repeat(WIDTH)

  function center(text) {
    const spaces = Math.max(0, Math.floor((WIDTH - text.length) / 2))
    return ' '.repeat(spaces) + text
  }

  function row(left, right) {
    const space = Math.max(1, WIDTH - left.length - right.length)
    return left + ' '.repeat(space) + right
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    return parseDbDate(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const lines = []

  // Header
  lines.push(line)
  lines.push(center('RICA BIZTRACK'))
  lines.push(center('Business Management'))
  lines.push(line)
  lines.push(row('Date:', formatDate(sale.created_at)))
  lines.push(row('Receipt:', sale.receipt_number))
  lines.push(dline)
  lines.push(row('Customer:', sale.customer_name || 'Walk-in Customer'))
  lines.push(row('Payment:', sale.payment_method || 'Cash'))
  lines.push(dline)

  // Items header
  lines.push(row('ITEM', 'TOTAL'))
  lines.push(dline)

  // Items
  for (const item of sale.items) {
    const name = item.product_name || item.name || 'Item'
    const qty = item.quantity
    const unitPrice = parseFloat(item.unit_price || item.sell_price || 0)
    const subtotal = parseFloat(item.subtotal || unitPrice * qty)

    // Product name line
    const truncated = name.length > WIDTH ? name.slice(0, WIDTH) : name
    lines.push(truncated)

    // Qty × unit price → subtotal
    const detail = `  ${qty} x ${formatMoney(unitPrice)}`
    const sub = `${formatMoney(subtotal)}`
    lines.push(row(detail, sub))

    lines.push('')
  }

  lines.push(dline)

  // Totals
  lines.push(row('Subtotal:', `${formatMoney(parseFloat(sale.subtotal || sale.total))}`))

  if (sale.tax && parseFloat(sale.tax) > 0) {
    lines.push(row('Tax:', `${formatMoney(parseFloat(sale.tax))}`))
  }

  if (sale.discount && parseFloat(sale.discount) > 0) {
    lines.push(row('Discount:', `-${formatMoney(parseFloat(sale.discount))}`))
  }

  lines.push(dline)
  lines.push(row('TOTAL:', `${formatMoney(parseFloat(sale.total))}`))
  lines.push(line)

  // Items count
  const totalItems = sale.items.reduce((a, i) => a + i.quantity, 0)
  lines.push(center(`${totalItems} item${totalItems !== 1 ? 's' : ''} purchased`))
  lines.push('')

  // Footer
  lines.push(center('Thank you for your business!'))
  lines.push(center('Please come again :)'))
  lines.push(line)
  lines.push('')

  return lines.join('\n')
}

// Save receipt as a .txt file and trigger download
export async function downloadReceipt(sale) {
  const content = generateReceipt(sale)

  try {
    // Open save dialog so user picks where to save
    const filePath = await save({
      defaultPath: `${sale.receipt_number}.txt`,
      filters: [{ name: 'Text Receipt', extensions: ['txt'] }]
    })

    if (!filePath) return // user cancelled

    // Write the file as text
    await writeTextFile(filePath, content)
  } catch (err) {
    console.error('Failed to save receipt:', err)
  }
}