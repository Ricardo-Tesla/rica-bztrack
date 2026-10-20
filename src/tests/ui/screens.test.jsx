// The real app (all screens) running against a real in-memory database.
// Tests click and type the way a shop owner or cashier would.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { freshDb } from '../integration/appDb'

const dialog = { ask: vi.fn(async () => true), save: vi.fn(async () => null), open: vi.fn(async () => null) }
vi.mock('../../services/db', async () => (await import('../integration/appDb')).dbModule)
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async cmd => (cmd === 'list_auto_backups' ? [] : 'C:\\path')) }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '1.0.0' }))
vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: (...a) => dialog.ask(...a), save: (...a) => dialog.save(...a), open: (...a) => dialog.open(...a),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile: vi.fn(), writeFile: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: async () => null }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))
vi.mock('@tauri-apps/plugin-log', () => ({ error: vi.fn(), info: vi.fn() }))

import App from '../../App'
import ErrorBoundary from '../../components/ErrorBoundary'
import { completeSetup, createUser } from '../../services/authService'
import { addProduct } from '../../services/productService'
import { addCustomer } from '../../services/customerService'
import { completeSale } from '../../services/salesService'
import { setCurrentUser } from '../../utils/session'
import { setCurrentLanguage } from '../../i18n'

let db
let user

beforeEach(() => {
  db = freshDb()
  vi.clearAllMocks()
  dialog.ask.mockImplementation(async () => true)
  setCurrentLanguage('en')
  setCurrentUser(null)
  window.print = vi.fn()
  user = userEvent.setup()
})

// The receipt printer adds an @page rule that jsdom's style engine cannot read
// (real browsers can). Remove it so later tests can compute styles.
afterEach(() => {
  document.getElementById('print-root')?.remove()
  document.getElementById('print-page-style')?.remove()
})

// ── helpers ─────────────────────────────────────────────
const field = label => {
  const el = screen.getAllByText(label, { selector: 'label' })[0]
  return el.parentElement.querySelector('input, select, textarea')
}
const button = name => screen.getByRole('button', { name })
const sidebar = async () => { await waitFor(() => expect(document.querySelector('aside')).not.toBeNull()); return document.querySelector('aside') }
const nav = async label => user.click(await within(await sidebar()).findByRole('button', { name: new RegExp(label) }))

async function setupShop({ vat = '0' } = {}) {
  await completeSetup({ business: { business_name: 'Duka Rica', vat_enabled: vat }, ownerName: 'Rica', pin: '1234' })
  await createUser({ name: 'Aline', role: 'cashier', pin: '5678' })
}

async function signIn(name = 'Rica', pin = '1234') {
  render(<App />)
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }))
  await user.type(document.querySelector('input[type=password]'), pin + '{Enter}')
}

async function seedProducts() {
  await addProduct({ name: 'Rice', sku: 'RICE', barcode: '600111', unit: 'Kg', category: 'Food', sell_price: 1200, buy_price: 900, stock: 10 })
  await addProduct({ name: 'Soap', sku: 'SOAP', unit: 'Piece', sell_price: 1000, buy_price: 500, stock: 3 })
  await addCustomer({ name: 'Ann', phone: '0788' })
}

// ─────────────────────────────────────────────────────────────
describe('First-run setup', () => {
  it('checks every step and shows the recovery code', async () => {
    render(<App />)
    await screen.findByText('Choose your language')
    await user.click(button('Next'))
    await user.click(button('Next'))
    expect(await screen.findByText('Shop name is required')).toBeInTheDocument()
    await user.type(field('Shop name *'), 'Duka Rica')
    await user.click(button('Next'))
    await user.click(button('Yes, my prices include VAT'))
    await user.clear(field('VAT rate (%)'))
    await user.click(button('Next'))
    expect(await screen.findByText('Enter a valid VAT rate')).toBeInTheDocument()
    await user.type(field('VAT rate (%)'), '18')
    await user.click(button('Next'))

    await user.click(button('Create account'))
    expect(await screen.findByText('Your name is required')).toBeInTheDocument()
    await user.type(field('Your name'), 'Rica')
    await user.type(field('PIN (4–6 digits)'), '12')
    await user.click(button('Create account'))
    expect(await screen.findByText('PIN must be 4 to 6 digits')).toBeInTheDocument()
    await user.type(field('PIN (4–6 digits)'), '34')
    await user.type(field('Repeat PIN'), '9999')
    await user.click(button('Create account'))
    expect(await screen.findByText('The two PINs do not match')).toBeInTheDocument()
    await user.clear(field('Repeat PIN'))
    await user.type(field('Repeat PIN'), '1234')
    await user.click(button('Create account'))

    expect(await screen.findByText(/This is your recovery code/)).toBeInTheDocument()
    expect(button('Start using Rica BizTrack')).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(button('Start using Rica BizTrack'))
    expect(await screen.findByText('Who is using the app?')).toBeInTheDocument()
    expect(db.prepare(`SELECT value FROM settings WHERE key = 'vat_enabled'`).get().value).toBe('1')
  })

  it('PIN fields only accept digits', async () => {
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.type(field('Shop name *'), 'X')
    await user.click(button('Next'))
    await user.click(button('Next'))
    await user.type(field('PIN (4–6 digits)'), '12ab34')
    expect(field('PIN (4–6 digits)').value).toBe('1234')
  })

  it('setup can be done in Kinyarwanda', async () => {
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Kinyarwanda' }))
    expect(screen.getByText('Hitamo ururimi')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
describe('Signing in', () => {
  beforeEach(setupShop)

  it('refuses a wrong PIN and accepts the right one (keypad)', async () => {
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /^Rica/ }))
    for (const k of ['0', '0', '0', '0']) await user.click(button(k))
    await user.click(button('✓'))
    expect(await screen.findByText('Wrong PIN')).toBeInTheDocument()
    for (const k of ['1', '2', '3', '5']) await user.click(button(k))
    await user.click(button('⌫'))
    await user.click(button('4'))
    await user.click(button('✓'))
    expect(await screen.findByText(/Good (morning|afternoon|evening)/)).toBeInTheDocument()
  })

  it('the owner can reset a forgotten PIN with the recovery code', async () => {
    db.exec('DELETE FROM users; DELETE FROM settings')
    const code = await completeSetup({ business: { business_name: 'X' }, ownerName: 'Rica', pin: '1234' })
    render(<App />)
    await user.click(await screen.findByText('Owner forgot PIN?'))
    await user.type(field('Recovery code'), 'WRON-GCOD-E123')
    await user.type(field('New PIN'), '4321')
    await user.type(field('Repeat PIN'), '4321')
    await user.click(button('Reset PIN'))
    expect(await screen.findByText('Wrong recovery code')).toBeInTheDocument()
    await user.clear(field('Recovery code'))
    await user.type(field('Recovery code'), code)
    await user.click(button('Reset PIN'))
    expect(await screen.findByText(/PIN changed for Rica/)).toBeInTheDocument()
    await user.type(document.querySelector('input[type=password]'), '4321{Enter}')
    expect(await screen.findByText(/Good (morning|afternoon|evening)/)).toBeInTheDocument()
  })

  it('Lock goes back to the sign-in screen', async () => {
    await signIn()
    await screen.findByText(/Good/)
    await user.click(button(/Lock/))
    expect(await screen.findByText('Who is using the app?')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
describe('Roles', () => {
  beforeEach(setupShop)

  it('the owner sees every page', async () => {
    await signIn()
    const menu = within(await sidebar())
    for (const page of ['Dashboard', 'Point of Sale', 'Sales History', 'Products', 'Suppliers', 'Customers', 'Transactions', 'Expenses', 'Profit & Loss', 'Settings']) {
      expect(menu.getByRole('button', { name: new RegExp(page) })).toBeInTheDocument()
    }
    expect(menu.getByText('Backup Data')).toBeInTheDocument()
  })

  it('a cashier starts at the till and only sees selling pages', async () => {
    await signIn('Aline', '5678')
    expect(await screen.findByPlaceholderText('Search or scan products...')).toBeInTheDocument()
    const menu = within(document.querySelector('aside'))
    expect(menu.getAllByRole('button').map(b => b.textContent)).toEqual(
      expect.not.arrayContaining([expect.stringMatching(/Dashboard|Products|Settings|Profit|Expenses|Transactions|Suppliers|Backup/)])
    )
    expect(menu.getByText('Cashier')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
describe('Point of Sale', () => {
  beforeEach(async () => { await setupShop(); await seedProducts() })

  async function openTill() {
    await signIn()
    await nav('Point of Sale')
    return screen.findByPlaceholderText('Search or scan products...')
  }

  it('scanning a barcode adds the product; an unknown code shows a message', async () => {
    const search = await openTill()
    await user.type(search, '600111{Enter}')
    expect(await screen.findByDisplayValue('1')).toBeInTheDocument()
    expect(search.value).toBe('')
    await user.type(search, '999{Enter}')
    expect(await screen.findByText('No product with code "999"')).toBeInTheDocument()
  })

  it('sells kg in parts, caps quantities at the stock and refuses out-of-stock', async () => {
    const search = await openTill()
    await user.type(search, 'RICE{Enter}')
    const qty = await screen.findByDisplayValue('1')
    await user.clear(qty)
    await user.type(qty, '1.5')
    expect(qty.value).toBe('1.5')
    expect(screen.getAllByText('RWF 1,800').length).toBeGreaterThan(0)
    await user.clear(qty)
    await user.type(qty, '50')
    expect(Number(qty.value)).toBe(10) // only 10 kg in stock

    // Soap: 3 in stock, the 4th click is refused
    const soap = screen.getByRole('button', { name: /Soap/ })
    for (let i = 0; i < 4; i++) await user.click(soap)
    expect(await screen.findByText(/Only 3 of Soap in stock/)).toBeInTheDocument()
  })

  it('pieces cannot be sold in parts', async () => {
    await openTill()
    await user.click(screen.getByRole('button', { name: /Soap/ }))
    const qty = await screen.findByDisplayValue('1')
    await user.clear(qty)
    await user.type(qty, '2.7')
    expect(qty.value).toBe('2')
  })

  it('cash: shows the change and refuses too little money', async () => {
    await openTill()
    await user.click(screen.getByRole('button', { name: /Soap/ }))
    await user.type(field('Cash received'), '500')
    await user.click(button('✓ Complete Sale'))
    expect(await screen.findByText(/Cash received is less than the total/)).toBeInTheDocument()
    await user.clear(field('Cash received'))
    await user.type(field('Cash received'), '5000')
    expect(screen.getByText('RWF 4,000')).toBeInTheDocument()
    await user.click(button('✓ Complete Sale'))
    expect(await screen.findByText('Sale Complete!')).toBeInTheDocument()
    await user.click(button('🖨️ Print'))
    expect(window.print).toHaveBeenCalled()
    expect(db.prepare('SELECT stock FROM products WHERE sku = ?').get('SOAP').stock).toBe(2)
  })

  it('discounts in RWF and %', async () => {
    await openTill()
    await user.click(screen.getByRole('button', { name: /Soap/ }))
    await user.click(screen.getByRole('button', { name: /Soap/ }))
    await user.type(field('Discount'), '10')
    await user.click(button('%'))
    expect(screen.getByText('-RWF 200')).toBeInTheDocument()
    expect(screen.getAllByText('RWF 1,800').length).toBeGreaterThan(0)
    await user.click(button('RWF'))
    expect(screen.getByText('-RWF 10')).toBeInTheDocument()
  })

  it('credit needs a customer; then records the debt', async () => {
    await openTill()
    await user.click(screen.getByRole('button', { name: /Soap/ }))
    await user.click(button('Credit'))
    await user.click(button('✓ Complete Sale'))
    expect((await screen.findAllByText('Choose a customer for a credit sale')).length).toBeGreaterThan(0)
    await user.selectOptions(screen.getAllByRole('combobox')[0], screen.getByRole('option', { name: /Ann/ }))
    await user.type(field('Paid now (optional)'), '300')
    expect(screen.getByText('RWF 700')).toBeInTheDocument()
    await user.click(button('✓ Complete Sale'))
    expect(await screen.findByText('Sale Complete!')).toBeInTheDocument()
    expect(db.prepare('SELECT payment_method, amount_paid FROM sales').get()).toEqual({ payment_method: 'Credit', amount_paid: 300 })
  })

  it('paid now cannot be more than the total', async () => {
    await openTill()
    await user.click(screen.getByRole('button', { name: /Soap/ }))
    await user.click(button('Credit'))
    await user.selectOptions(screen.getAllByRole('combobox')[0], screen.getByRole('option', { name: /Ann/ }))
    await user.type(field('Paid now (optional)'), '5000')
    await user.click(button('✓ Complete Sale'))
    expect(await screen.findByText('Paid now cannot be more than the total')).toBeInTheDocument()
  })

  it('if someone else sold the last items, the sale is refused and nothing is saved', async () => {
    await openTill()
    await user.click(screen.getByRole('button', { name: /Soap/ }))
    db.prepare(`UPDATE products SET stock = 0 WHERE sku = 'SOAP'`).run() // another till sold them
    await user.click(button('✓ Complete Sale'))
    expect(await screen.findByText(/Not enough stock for "Soap"/)).toBeInTheDocument()
    expect(db.prepare('SELECT COUNT(*) n FROM sales').get().n).toBe(0)
    expect(await screen.findByText('Out')).toBeInTheDocument() // stock refreshed on screen
  })

  it('quick-adds a customer from the till', async () => {
    await openTill()
    await user.click(button('+ New'))
    await user.type(field('Name'), 'Jean')
    await user.click(button('Save'))
    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).toHaveDisplayValue(/Jean/))
  })

  it('MoMo reference is saved', async () => {
    await openTill()
    await user.click(screen.getByRole('button', { name: /Soap/ }))
    await user.click(button('Mobile Money'))
    await user.type(screen.getByPlaceholderText('Transaction ID / reference (optional)'), 'MP777')
    await user.click(button('✓ Complete Sale'))
    await screen.findByText('Sale Complete!')
    expect(db.prepare('SELECT payment_reference FROM sales').get().payment_reference).toBe('MP777')
  })
})

// ─────────────────────────────────────────────────────────────
describe('Sales History', () => {
  beforeEach(async () => {
    await setupShop(); await seedProducts()
    setCurrentUser({ id: 1, name: 'Rica', role: 'owner' })
    const soap = db.prepare(`SELECT * FROM products WHERE sku = 'SOAP'`).get()
    await completeSale([{ ...soap, quantity: 1 }], { paymentMethod: 'Cash' })
  })

  it('the owner voids a sale only with a reason', async () => {
    await signIn()
    await nav('Sales History')
    await user.click(await screen.findByRole('button', { name: 'View' }))
    await user.click(button('↩ Void Sale'))
    const confirm = screen.getAllByRole('button', { name: 'Void sale' }).at(-1)
    expect(confirm).toBeDisabled()
    await user.type(screen.getByPlaceholderText('e.g. customer returned the goods'), 'Returned')
    await user.click(confirm)
    expect(await screen.findByText(/was voided/)).toBeInTheDocument()
    expect(db.prepare('SELECT status, void_reason, voided_by FROM sales').get()).toEqual({ status: 'voided', void_reason: 'Returned', voided_by: 'Rica' })
  })

  it('the owner records the EBM number', async () => {
    await signIn()
    await nav('Sales History')
    await user.click(await screen.findByRole('button', { name: 'View' }))
    await user.type(field('EBM receipt number'), 'EBM-42')
    await user.click(within(screen.getByText('EBM receipt number').parentElement.parentElement).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.prepare('SELECT ebm_receipt_no FROM sales').get().ebm_receipt_no).toBe('EBM-42'))
  })

  it('a cashier can view and print, but not void, export or edit EBM', async () => {
    await signIn('Aline', '5678')
    await nav('Sales History')
    expect(screen.queryByRole('button', { name: /Excel/ })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'View' }))
    expect(button('🖨️ Print')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '↩ Void Sale' })).not.toBeInTheDocument()
    expect(screen.queryByText('EBM receipt number')).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
describe('Customers', () => {
  beforeEach(async () => {
    await setupShop(); await seedProducts()
    const soap = db.prepare(`SELECT * FROM products WHERE sku = 'SOAP'`).get()
    const ann = db.prepare(`SELECT * FROM customers`).get()
    await completeSale([{ ...soap, quantity: 2 }], { paymentMethod: 'Credit', customer: ann })
  })

  it('shows the debt, refuses an overpayment, records a payment', async () => {
    await signIn()
    await nav('Customers')
    expect(await screen.findAllByText('RWF 2,000')).toBeTruthy()
    await user.click(button('Record payment'))
    await user.clear(field('Amount'))
    await user.type(field('Amount'), '2500')
    await user.click(button('Save payment'))
    expect(await screen.findByText('This payment is more than what the customer owes.')).toBeInTheDocument()
    await user.clear(field('Amount'))
    await user.type(field('Amount'), '500')
    await user.click(button('Save payment'))
    expect(await screen.findByText(/Payment of RWF 500 recorded for Ann/)).toBeInTheDocument()
    await user.click(button('Statement'))
    expect(await screen.findByText('Owes RWF 1,500')).toBeInTheDocument()
  })

  it('a cashier can record payments but cannot delete customers', async () => {
    await signIn('Aline', '5678')
    await nav('Customers')
    expect(await screen.findByRole('button', { name: 'Record payment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
describe('Products', () => {
  beforeEach(setupShop)

  it('validates the form and warns when selling below cost', async () => {
    await signIn()
    await nav('Products')
    await user.click(await screen.findByRole('button', { name: '+ Add Product' }))
    await user.click(button('Save'))
    expect(await screen.findByText('Product name is required')).toBeInTheDocument()
    await user.type(field('Product name *'), 'Bread')
    await user.click(button('Save'))
    expect(await screen.findByText('SKU is required')).toBeInTheDocument()
    await user.type(field('SKU *'), 'BRD')
    await user.click(button('Save'))
    expect(await screen.findByText('Sell price is required')).toBeInTheDocument()
    await user.type(field('Sell price *'), '500')
    await user.type(field('Initial Stock'), '2.5')
    await user.click(button('Save'))
    expect(await screen.findByText('This unit can only be stocked in whole numbers')).toBeInTheDocument()
    await user.clear(field('Initial Stock'))
    await user.type(field('Initial Stock'), '20')
    await user.type(field('Buy price'), '800')
    dialog.ask.mockResolvedValueOnce(false) // "selling below cost — save anyway?" → No
    await user.click(button('Save'))
    expect(dialog.ask).toHaveBeenCalled()
    expect(db.prepare('SELECT COUNT(*) n FROM products').get().n).toBe(0)
    await user.click(button('Save')) // → Yes
    await waitFor(() => expect(db.prepare('SELECT COUNT(*) n FROM products').get().n).toBe(1))
  })

  it('restocks and shows the history', async () => {
    await addProduct({ name: 'Rice', sku: 'RICE', unit: 'Kg', sell_price: 1200, buy_price: 900, stock: 1 })
    await signIn()
    await nav('Products')
    await user.click(await screen.findByRole('button', { name: 'Restock' }))
    await user.type(field('Quantity *'), '2.5')
    await user.click(button('Add stock'))
    expect(await screen.findByText('2.5 kg added to Rice')).toBeInTheDocument()
    await user.click(button('History'))
    expect(await screen.findByText('+2.5 kg')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
describe('Expenses, Transactions, P&L, Dashboard', () => {
  beforeEach(setupShop)

  it('expenses: validation, add, edit', async () => {
    await signIn()
    await nav('Expenses')
    await user.click(await screen.findByRole('button', { name: '+ Add Expense' }))
    await user.click(button('Save'))
    expect(await screen.findByText('Description is required')).toBeInTheDocument()
    await user.type(field('Description *'), 'Rent')
    await user.click(button('Save'))
    expect(await screen.findByText('Valid amount is required')).toBeInTheDocument()
    await user.type(field('Amount *'), '20000')
    await user.click(button('Save'))
    expect(await screen.findByText('-RWF 20,000')).toBeInTheDocument()
    await user.click(button('Edit'))
    await user.clear(field('Amount *'))
    await user.type(field('Amount *'), '25000')
    await user.click(button('Save'))
    expect(await screen.findByText('-RWF 25,000')).toBeInTheDocument()
  })

  it('transactions: manual money in appears with totals', async () => {
    await signIn()
    await nav('Transactions')
    await user.click(await screen.findByRole('button', { name: '+ Add Transaction' }))
    await user.type(field('Description *'), 'Repair job')
    await user.type(field('Amount *'), '3000')
    await user.click(button('Save'))
    expect(await screen.findByText('Repair job')).toBeInTheDocument()
    expect(screen.getAllByText('+RWF 3,000').length).toBeGreaterThan(0)
  })

  it('P&L and Dashboard load, and the period can change', async () => {
    await signIn()
    expect(await screen.findByText('Customers owe you')).toBeInTheDocument()
    await nav('Profit & Loss')
    expect(await screen.findByText('Income statement')).toBeInTheDocument()
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'last_month')
    expect(await screen.findByText('Income statement')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
describe('Settings', () => {
  beforeEach(setupShop)

  it('switching to French changes the whole app', async () => {
    await signIn()
    await nav('Settings')
    await user.click(await screen.findByRole('button', { name: 'General' }))
    await user.selectOptions(field('Language'), 'fr')
    await user.click(button('Save'))
    expect((await screen.findAllByText('Paramètres')).length).toBeGreaterThan(0)
    expect(within(document.querySelector('aside')).getByText('Caisse')).toBeInTheDocument()
  })

  it('adds a cashier; you cannot deactivate yourself', async () => {
    await signIn()
    await nav('Settings')
    await user.click(await screen.findByRole('button', { name: 'Users' }))
    await screen.findByText('(you)')
    const myRow = screen.getByText('(you)').closest('tr')
    expect(within(myRow).queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
    await user.click(button('+ Add user'))
    await user.type(field('Name'), 'Eric')
    await user.type(field('PIN (4–6 digits)'), '1111')
    await user.type(field('Repeat PIN'), '2222')
    await user.click(screen.getAllByRole('button', { name: 'Save' }).at(-1))
    expect(await screen.findByText('The two PINs do not match')).toBeInTheDocument()
    await user.clear(field('Repeat PIN'))
    await user.type(field('Repeat PIN'), '1111')
    await user.click(screen.getAllByRole('button', { name: 'Save' }).at(-1))
    expect(await screen.findByText('Eric')).toBeInTheDocument()
  })

  it('shop details cannot be saved without a name', async () => {
    await signIn()
    await nav('Settings')
    const name = await waitFor(() => field('Shop name *'))
    await user.clear(name)
    await user.click(button('Save'))
    expect(await screen.findByText('Shop name is required')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
describe('Safety nets', () => {
  it('a crashing page shows a recovery screen instead of a blank window', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Broken = () => { throw new Error('kaboom') }
    render(<ErrorBoundary name="test"><Broken /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('kaboom')).toBeInTheDocument()
  })

  it('locks itself after the chosen minutes without activity', async () => {
    await setupShop()
    db.prepare(`INSERT INTO settings (key, value) VALUES ('auto_lock_minutes', '5') ON CONFLICT(key) DO UPDATE SET value = '5'`).run()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await signIn()
      await screen.findByText(/Good/)
      await act(async () => { vi.advanceTimersByTime(4 * 60 * 1000) })
      expect(screen.queryByText('Who is using the app?')).toBeNull()
      await act(async () => { vi.advanceTimersByTime(60 * 1000 + 100) })
      expect(await screen.findByText('Who is using the app?')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
