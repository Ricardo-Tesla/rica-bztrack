import { test, expect } from './fixtures'
import { btn, field, nav, readyShop, sell, dbValue, modal, row } from './helpers'

test.beforeEach(async ({ page }) => { await readyShop(page) })

test('sales history: EBM number, reprint, void with a reason puts stock back', async ({ page }) => {
  await sell(page, [['Soap', 2]])
  await nav(page, 'Sales History')
  await page.getByRole('button', { name: 'View' }).first().click()
  await field(page, 'EBM receipt number').fill('EBM-0001')
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('EBM receipt number saved')).toBeVisible()
  await btn(page, '🖨️ Print').click()
  expect(await page.evaluate(() => window.__printed)).toBe(1)

  await btn(page, '↩ Void Sale').click()
  await page.getByPlaceholder('e.g. customer returned the goods').fill('Customer returned it')
  await page.getByRole('button', { name: 'Void sale' }).last().click()
  await expect(page.getByText(/was voided/)).toBeVisible()

  expect(await dbValue(page, "SELECT stock FROM products WHERE sku = 'SOAP'")).toBe(20)
  expect(await dbValue(page, "SELECT ebm_receipt_no FROM sales")).toBe('EBM-0001')
  expect(await dbValue(page, "SELECT void_reason FROM sales")).toBe('Customer returned it')
  expect(await dbValue(page, "SELECT SUM(CASE WHEN type='income' THEN amount ELSE -amount END) FROM transactions")).toBe(0)
})

test('customer debt: repayment, overpayment refused, statement, cancel a payment', async ({ page }) => {
  await sell(page, [['Soap', 2]], { customer: 'Ann Uwase — 0788000111', credit: 1000 })
  await nav(page, 'Customers')
  await expect(row(page, 'Ann Uwase')).toContainText('RWF 1,360')

  await btn(page, 'Record payment').click()
  await field(page, 'Amount').fill('5000')
  await btn(page, 'Save payment').click()
  await expect(page.getByText('This payment is more than what the customer owes.')).toBeVisible()
  await field(page, 'Amount').fill('500')
  await btn(page, 'Save payment').click()
  await expect(page.getByText(/Payment of RWF 500 recorded/)).toBeVisible()

  await btn(page, 'Statement').click()
  await expect(page.getByText('Owes RWF 860')).toBeVisible()
  await modal(page).getByRole('button', { name: 'Cancel' }).last().click()
  await expect(page.getByText('Owes RWF 1,360')).toBeVisible()
})

test('expenses: add, edit, delete; transactions and totals follow', async ({ page }) => {
  await nav(page, 'Expenses')
  await btn(page, '+ Add Expense').click()
  await btn(page, 'Save').click()
  await expect(page.getByText(/required/i).first()).toBeVisible()
  await field(page, 'Description *').fill('October rent')
  await field(page, 'Amount *').fill('20000')
  await btn(page, 'Save').click()
  await expect(page.getByText('October rent')).toBeVisible()
  await row(page, 'October rent').getByRole('button', { name: 'Edit' }).click()
  await field(page, 'Amount *').fill('25000')
  await btn(page, 'Save').click()
  await expect(page.getByText('-RWF 25,000')).toBeVisible()
  expect(await dbValue(page, "SELECT amount FROM transactions WHERE reference_type = 'expense'")).toBe(25000)

  await nav(page, 'Transactions')
  await btn(page, '+ Add Transaction').click()
  await field(page, 'Description *').fill('Repair service')
  await field(page, 'Amount *').fill('3000')
  await btn(page, 'Save').click()
  await expect(page.getByText('Repair service')).toBeVisible()

  await nav(page, 'Expenses')
  await row(page, 'October rent').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('October rent')).toHaveCount(0)
  expect(await dbValue(page, "SELECT COUNT(*) FROM transactions WHERE reference_type = 'expense'")).toBe(0)
})

test('profit & loss and dashboard agree with the sales', async ({ page }) => {
  await sell(page, [['Soap', 2]]) // 2 × 1,180, cost 2 × 500
  await nav(page, 'Expenses')
  await btn(page, '+ Add Expense').click()
  await field(page, 'Description *').fill('Transport')
  await field(page, 'Amount *').fill('300')
  await btn(page, 'Save').click()

  await nav(page, 'Profit & Loss')
  await expect(page.getByText('Income statement')).toBeVisible()
  // net profit = 2,360 − 1,000 − 300 = 1,060
  await expect(page.getByText('RWF 1,060').first()).toBeVisible()
  await page.locator('select').first().selectOption('all')
  await expect(page.getByText('RWF 1,060').first()).toBeVisible()

  await nav(page, 'Dashboard')
  await expect(page.getByText('RWF 2,360').first()).toBeVisible()
})

test('products: validation; a product with sales is archived, not deleted', async ({ page }) => {
  await nav(page, 'Products')
  await btn(page, '+ Add Product').click()
  await btn(page, 'Save').click()
  await expect(page.getByText(/required/i).first()).toBeVisible()
  await btn(page, 'Cancel').click()

  await sell(page, [['Soap', 1]])
  await nav(page, 'Products')
  await row(page, 'SOAP').getByRole('button', { name: 'Delete' }).click()
  await expect(row(page, 'SOAP')).toHaveCount(0)
  expect(await dbValue(page, "SELECT archived FROM products WHERE name = 'Soap'")).toBe(1)
  // the SKU is freed so a new product can use it
  expect(await dbValue(page, "SELECT sku FROM products WHERE name = 'Soap'")).toMatch(/^SOAP~archived-/)
  // old sales still show the product
  await nav(page, 'Sales History')
  await page.getByRole('button', { name: 'View' }).first().click()
  await expect(modal(page).getByText('Soap')).toBeVisible()
})

test('excel export buttons do not crash', async ({ page }) => {
  await sell(page, [['Soap', 1]])
  for (const pageName of ['Sales History', 'Products', 'Customers', 'Expenses', 'Transactions', 'Profit & Loss']) {
    await nav(page, pageName)
    const excel = page.getByRole('button', { name: /Excel/ })
    // enabled only when there is something to export; the save dialog is cancelled in the simulation
    if (await excel.count() && await excel.first().isEnabled()) await excel.first().click()
  }
})
