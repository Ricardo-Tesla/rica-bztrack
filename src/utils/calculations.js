// Calculate profit margin
export function calculateMargin(buyPrice, sellPrice) {
  if (!buyPrice || !sellPrice || sellPrice === 0) return 0
  return parseFloat((((sellPrice - buyPrice) / sellPrice) * 100).toFixed(1))
}

// Calculate markup
export function calculateMarkup(buyPrice, sellPrice) {
  if (!buyPrice || !sellPrice || buyPrice === 0) return 0
  return parseFloat((((sellPrice - buyPrice) / buyPrice) * 100).toFixed(1))
}

// Calculate profit per unit
export function calculateProfitPerUnit(buyPrice, sellPrice) {
  if (!buyPrice || !sellPrice) return 0
  return parseFloat((sellPrice - buyPrice).toFixed(2))
}

// Calculate total from cart
export function calculateCartTotal(cart) {
  if (!cart || cart.length === 0) return 0
  return parseFloat(
    cart.reduce((a, item) => a + item.sell_price * item.quantity, 0).toFixed(2)
  )
}

// Calculate net profit
export function calculateNetProfit(revenue, cogs, expenses) {
  return parseFloat((revenue - cogs - expenses).toFixed(2))
}

// Calculate gross profit
export function calculateGrossProfit(revenue, cogs) {
  return parseFloat((revenue - cogs).toFixed(2))
}

// Format currency
export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '$0.00'
  return '$' + parseFloat(amount).toFixed(2)
}

// Format date
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

// Generate receipt number: RCT-YYYYMMDD-XXXXXX
// Uses the local date and 6 random characters (2+ billion combinations per day).
// The sales service also retries automatically in the very rare case of a clash.
export function generateReceiptNumber() {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  const random = Array.from(bytes, b => chars[b % chars.length]).join('')
  return `RCT-${date}-${random}`
}

// Get stock status
export function getStockStatus(stock, lowStockAlert) {
  if (stock <= 0) return 'out'
  if (stock <= lowStockAlert) return 'low'
  return 'in-stock'
}

// Validate product form
export function validateProduct(form) {
  const errors = []
  if (!form.name || !form.name.trim()) errors.push('Product name is required')
  if (!form.sku || !form.sku.trim()) errors.push('SKU is required')
  if (!form.sell_price || parseFloat(form.sell_price) <= 0) errors.push('Valid sell price is required')
  if (parseFloat(form.sell_price) < parseFloat(form.buy_price)) errors.push('Sell price cannot be less than buy price')
  return errors
}

// Validate sale
export function validateSale(cart) {
  const errors = []
  if (!cart || cart.length === 0) errors.push('Cart is empty')
  ;(cart || []).forEach(item => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) errors.push(`${item.name} has invalid quantity`)
    if (item.quantity > item.stock) errors.push(`${item.name} exceeds available stock`)
  })
  return errors
}