// What each role may see and do.
// Owners can do everything. Cashiers can sell, see sales history, and look
// after customers (add customers, record debt repayments).

export const PAGE_ACCESS = {
  dashboard: ['owner'],
  pos: ['owner', 'cashier'],
  sales: ['owner', 'cashier'],
  products: ['owner'],
  suppliers: ['owner'],
  customers: ['owner', 'cashier'],
  transactions: ['owner'],
  expenses: ['owner'],
  profit: ['owner'],
  settings: ['owner'],
}

const OWNER_ONLY_ACTIONS = new Set([
  'void_sale',
  'delete',
  'see_profit',      // buy prices, margins, P&L
  'backup_restore',
  'manage_users',
  'edit_settings',
  'export',
  'edit_ebm',
])

export function canSeePage(user, page) {
  return !!user && (PAGE_ACCESS[page] || []).includes(user.role)
}

export function can(user, action) {
  if (!user) return false
  if (user.role === 'owner') return true
  return !OWNER_ONLY_ACTIONS.has(action)
}

export function homePage(user) {
  return user?.role === 'owner' ? 'dashboard' : 'pos'
}
