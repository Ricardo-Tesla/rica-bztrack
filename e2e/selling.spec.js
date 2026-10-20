import { test, expect } from './fixtures'
import { btn, field, nav, readyShop, searchBox, dbValue, modal, row } from './helpers'

test.beforeEach(async ({ page }) => { await readyShop(page) })

test('cash sale: barcode scan, kg in parts, discount, change, print', async ({ page }) => {
  await nav(page, 'Point of Sale')
  await searchBox(page).fill('600111')
  await searchBox(page).press('Enter')
  await page.locator('input[type=number][step="0.1"]').fill('1.5')
  await page.locator('button', { hasText: 'Soap' }).first().click()
  await page.locator('label:text-is("Discount") + div input').fill('80')
  await page.locator('label:text-is("Cash received") + div input').fill('5000')
  // 1.5 × 1,200 + 1,180 − 80 = 2,900 ; change 2,100
  await expect(page.getByText('RWF 2,900').first()).toBeVisible()
  await expect(page.getByText('RWF 2,100').first()).toBeVisible()
  await btn(page, '✓ Complete Sale').click()
  await expect(page.getByText('Sale Complete!')).toBeVisible()
  await btn(page, '🖨️ Print').click()
  expect(await page.evaluate(() => window.__printed)).toBe(1)
  await btn(page, 'New sale').click()

  expect(await dbValue(page, "SELECT stock FROM products WHERE sku = 'RICE'")).toBe(48.5)
  expect(await dbValue(page, "SELECT stock FROM products WHERE sku = 'SOAP'")).toBe(19)
  expect(await dbValue(page, 'SELECT total FROM sales')).toBe(2900)
  expect(await dbValue(page, "SELECT SUM(amount) FROM transactions WHERE type = 'income'")).toBe(2900)
  expect(await dbValue(page, "SELECT user_name FROM sales")).toBe('Rica')
})

test('an unknown barcode shows a message and adds nothing', async ({ page }) => {
  await nav(page, 'Point of Sale')
  await searchBox(page).fill('999999')
  await searchBox(page).press('Enter')
  await expect(page.getByText(/No product with code/)).toBeVisible()
  await expect(btn(page, '✓ Complete Sale')).toBeDisabled()
})

test('too little cash is refused', async ({ page }) => {
  await nav(page, 'Point of Sale')
  await page.locator('button', { hasText: 'Soap' }).first().click()
  await page.locator('label:text-is("Cash received") + div input').fill('500')
  await btn(page, '✓ Complete Sale').click()
  await expect(page.getByText(/not enough|less than the total/i).first()).toBeVisible()
  expect(await dbValue(page, 'SELECT COUNT(*) FROM sales')).toBe(0)
})

test('quantities are capped at the stock', async ({ page }) => {
  await nav(page, 'Point of Sale')
  await searchBox(page).fill('RICE')
  await searchBox(page).press('Enter')
  await page.locator('input[type=number][step="0.1"]').fill('999')
  expect(Number(await page.locator('input[type=number][step="0.1"]').inputValue())).toBeLessThanOrEqual(50)
  await btn(page, 'Clear').click()
  await expect(btn(page, '✓ Complete Sale')).toBeDisabled()
})

test('if the stock ran out meanwhile (another till), the sale is refused and nothing is saved', async ({ page }) => {
  await nav(page, 'Point of Sale')
  await page.locator('button', { hasText: 'Soap' }).first().click()
  await page.evaluate(() => window.__db.run("UPDATE products SET stock = 0 WHERE sku = 'SOAP'"))
  await btn(page, '✓ Complete Sale').click()
  await expect(page.getByText(/Not enough stock for "Soap"/)).toBeVisible()
  expect(await dbValue(page, 'SELECT COUNT(*) FROM sales')).toBe(0)
  expect(await dbValue(page, 'SELECT COUNT(*) FROM transactions')).toBe(0)
})

test('credit sale: needs a customer, records the debt and what was paid now', async ({ page }) => {
  await nav(page, 'Point of Sale')
  await page.locator('button', { hasText: 'Soap' }).first().click()
  await page.locator('button', { hasText: 'Soap' }).first().click()
  await btn(page, 'Credit').click()
  await btn(page, '✓ Complete Sale').click()
  await expect(page.getByText(/Choose a customer/).first()).toBeVisible()

  await page.locator('select').first().selectOption({ label: 'Ann Uwase — 0788000111' })
  await page.locator('label:text-is("Paid now (optional)") + div input').fill('1000')
  await btn(page, '✓ Complete Sale').click()
  await expect(page.getByText('Sale Complete!')).toBeVisible()
  await expect(page.getByText('Balance due')).toBeVisible()
  await btn(page, 'New sale').click()

  expect(await dbValue(page, 'SELECT amount_paid FROM sales')).toBe(1000)
  expect(await dbValue(page, "SELECT SUM(amount) FROM transactions WHERE type = 'income'")).toBe(1000)
  await nav(page, 'Customers')
  await expect(row(page, 'Ann Uwase')).toContainText('RWF 1,360')
})

test('Mobile Money sale keeps the transaction ID', async ({ page }) => {
  await nav(page, 'Point of Sale')
  await page.locator('button', { hasText: 'Soap' }).first().click()
  await btn(page, 'Mobile Money').click()
  await page.getByPlaceholder(/transaction ID|reference/i).fill('MP2610.1234')
  await btn(page, '✓ Complete Sale').click()
  await expect(page.getByText('Sale Complete!')).toBeVisible()
  expect(await dbValue(page, 'SELECT payment_reference FROM sales')).toBe('MP2610.1234')
  expect(await dbValue(page, 'SELECT payment_method FROM transactions')).toBe('Mobile Money')
})

test('restock updates the stock, the average cost and the history', async ({ page }) => {
  await nav(page, 'Products')
  await row(page, 'SOAP').getByRole('button', { name: 'Restock' }).click()
  await field(page, 'Quantity *').fill('20')
  await field(page, 'Cost per unit').fill('600')
  await btn(page, 'Add stock').click()
  await expect(page.getByText('20 added to Soap')).toBeVisible()
  expect(await dbValue(page, "SELECT stock FROM products WHERE sku = 'SOAP'")).toBe(40)
  expect(await dbValue(page, "SELECT buy_price FROM products WHERE sku = 'SOAP'")).toBe(550) // (20×500 + 20×600) / 40
  // buying stock is not an expense
  expect(await dbValue(page, 'SELECT COUNT(*) FROM expenses')).toBe(0)
  await row(page, 'SOAP').getByRole('button', { name: 'History' }).click()
  await expect(modal(page).getByText('Stock history')).toBeVisible()
})

test('a VAT-registered shop shows VAT on the sale', async ({ page }) => {
  // new shop with VAT on
  await page.goto('/')
  await readyShop(page, { vat: true })
  await nav(page, 'Point of Sale')
  await page.locator('button', { hasText: 'Soap' }).first().click()
  await btn(page, '✓ Complete Sale').click()
  await expect(page.getByText('Sale Complete!')).toBeVisible()
  expect(await dbValue(page, 'SELECT tax FROM sales')).toBe(180) // 1,180 incl. 18% VAT
})
